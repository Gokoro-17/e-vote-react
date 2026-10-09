import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import argon2 from "argon2";
import multer from "multer";
import { z } from "zod";
import QRCode from "qrcode";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import path from "node:path";
import {
  authenticate,
  requireUser,
  requirePlatformAdmin,
  safeUser,
  mountAuth,
} from "./auth.js";
import {
  configurationIssues,
  requireConfiguration,
  supabaseAdmin,
  authAvailability,
  clearAuthCookies,
} from "./supabase.js";
import { mountExtensions } from "./extensions.js";
import { mountWorker, runMaintenance } from "./worker.js";
import { mountBilling, mountBillingWebhook } from "./billing.js";
import {
  db,
  digest,
  token,
  encrypt,
  decrypt,
  identityFingerprint,
  audit,
  logAudit,
  notify,
  queueMail,
  storeDocument,
  fetchDocument,
  removeDocument,
  serializable,
  processDeletionJob,
  eligibilityCounts,
} from "./platform.js";
import {
  eligibilityReason,
  validateChoices,
  tally,
  transitions,
  launchTarget,
} from "./engine.js";
const app = express(),
  production = process.env.NODE_ENV === "production";
const origin = process.env.APP_ORIGIN || "http://localhost:5174";
// Frontend and API mutations must share this exact deployment origin.
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
        frameSrc: ["https://challenges.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "https://challenges.cloudflare.com"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
  }),
);
// Paystack signs the exact bytes. Register this before JSON parsing and browser CSRF middleware.
mountBillingWebhook(app);
// Machine requests use a dedicated bearer secret, before browser session/CSRF middleware.
mountWorker(app);
app.use(express.json({ limit: "128kb" }));
app.use(cookieParser());
const route =
  (fn: (req: any, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
const httpUrl = z
  .string()
  .url()
  .refine(
    (v) => ["http:", "https:"].includes(new URL(v).protocol),
    "Use an HTTP or HTTPS URL.",
  );
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 500,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests. Try again later." },
  }),
);
app.use(
  "/api",
  route(async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    await authenticate(req, res);
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.get("origin") !== origin)
        fail("Request origin is not allowed.", 403);
      if (req.session && req.get("x-csrf-token") !== req.session.csrf)
        fail("Invalid CSRF token. Refresh and try again.", 403);
    }
    next();
  }),
);
async function access(
  req: any,
  organizationId: string,
  roles = ["ADMIN", "MODERATOR"],
) {
  const u = requireUser(req);
  if (u.role === "SUPER_ADMIN") {
    requirePlatformAdmin(req);
    req.securityOrganizationId = organizationId;
    return;
  }
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { suspended: true },
  });
  if (!organization || organization.suspended)
    fail("Organization access is unavailable.", 403);
  const m = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: u.id } },
  });
  if (!m?.active || !roles.includes(m.role))
    fail("You do not have permission for this organization.", 403);
  req.securityOrganizationId = organizationId;
}
const getElection = async (id: string) => {
  const e = await db.election.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: {
      organization: true,
      positions: { include: { candidates: true } },
      runoffOfElection: { select: { name: true, slug: true } },
      runoffElection: { select: { name: true, slug: true, status: true } },
    },
  });
  if (!e) fail("Election not found.", 404);
  return e!;
};
async function visible(req: any, e: any) {
  if (e.organization.suspended && req.user?.role !== "SUPER_ADMIN")
    fail("This organization is currently unavailable.", 403);
  if (e.access === "PUBLIC" && e.status !== "DRAFT") return;
  if (req.user?.role === "SUPER_ADMIN") {
    requirePlatformAdmin(req);
    return;
  }
  const member = req.user
    ? await db.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: e.organizationId,
            userId: req.user.id,
          },
        },
      })
    : null;
  if (member?.active && ["ADMIN", "MODERATOR"].includes(member.role)) return;
  if (
    e.status !== "DRAFT" &&
    req.user &&
    (e.access === "ORGANIZATION"
      ? member?.active
      : await db.voterEligibility.findUnique({
          where: {
            electionId_userId: { electionId: e.id, userId: req.user.id },
          },
        }))
  )
    return;
  fail("This election requires an invitation or membership.", 403);
}
const authLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});
const limiterScope = process.env.NODE_ENV === "test" ? token() : "production";
// A shared database limiter supplements process-local edge protection.
app.use(
  "/api",
  route(async (req, res, next) => {
    if (
      req.path === "/auth/session" ||
      req.path === "/health" ||
      req.path === "/public/config" ||
      req.path === "/public/plans"
    )
      return next();
    requireConfiguration();
    const auth = req.path.startsWith("/auth/"),
      vote = req.path.endsWith("/vote"),
      verification = req.path.startsWith("/verification/");
    const windowMs = auth ? 15 * 60000 : 60000,
      limit = auth ? 30 : vote ? 20 : verification ? 30 : 240;
    const bucket = Math.floor(Date.now() / windowMs),
      resetAt = new Date((bucket + 1) * windowMs),
      subject = digest(req.ip || "unknown");
    const id = `${limiterScope}:${auth ? "auth" : vote ? "vote" : verification ? "verification" : "api"}:${subject}:${bucket}`;
    const row = await db.rateBucket.upsert({
      where: { id },
      create: { id, resetAt },
      update: { attempts: { increment: 1 } },
    });
    if (verification && row.attempts === 10)
      await db.securityEvent.create({
        data: {
          actor: req.user?.id,
          type: "VERIFICATION_ATTEMPT_BURST",
          metadata: { ipHash: subject, reviewOnly: true },
        },
      });
    if (row.attempts > limit) {
      if (row.attempts === limit + 1)
        await db.securityEvent.create({
          data: {
            actor: req.user?.id,
            type: "EXCESSIVE_REQUESTS",
            metadata: {
              ipHash: subject,
              scope: auth ? "auth" : vote ? "vote" : "api",
            },
          },
        });
      res
        .set(
          "Retry-After",
          String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
        )
        .status(429)
        .json({ error: "Too many requests. Please try again later." });
      return;
    }
    next();
  }),
);
async function bot(req: any) {
  if (!process.env.TURNSTILE_SECRET) return;
  const captcha = z.string().min(1).max(2048).safeParse(req.body?.captcha);
  if (!captcha.success) fail("Complete the bot protection check.", 403);
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET,
        response: captcha.data,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const result = (await response.json()) as any;
  if (
    !result.success ||
    (production && result.hostname !== new URL(origin).hostname)
  ) {
    await db.securityEvent.create({
      data: {
        actor: req.user?.id,
        type: "BOT_CHECK_FAILED",
        metadata: { ipHash: digest(req.ip || ""), reviewOnly: true },
      },
    });
    fail("Complete the bot protection check.", 403);
  }
}
app.get(
  "/api/health",
  route(async (req, res) => {
    const issues = configurationIssues();
    if (issues.length)
      return res.status(503).json({
        status: "setup_required",
        database: "supabase",
        project: "mdtymdvybaurguflwktt",
      });
    await db.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "supabase" });
  }),
);
app.get(
  "/api/public/config",
  route(async (req, res) => {
    const configured = configurationIssues().length === 0,
      settings = configured
        ? await db.platformSettings.findUnique({ where: { id: "platform" } })
        : null,
      providers = await authAvailability();
    res.json({
      configured,
      googleEnabled: providers.googleEnabled,
      captchaSiteKey: process.env.TURNSTILE_SITE_KEY || "",
      contactEmail: settings?.contactEmail || process.env.CONTACT_EMAIL || "",
      welcomeMessage: settings?.welcomeMessage || "",
    });
  }),
);
mountAuth(app, authLimit, bot);
app.get(
  "/api/organizations",
  route(async (req, res) =>
    res.json(
      await db.organization.findMany({
        where: { suspended: false },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          logo: true,
          verified: true,
          color: true,
          contact: true,
          welcome: true,
        },
      }),
    ),
  ),
);
app.get(
  "/api/organizations/:id",
  route(async (req, res) => {
    const org = await db.organization.findFirst({
      where: {
        OR: [{ id: req.params.id }, { slug: req.params.id }],
        suspended: false,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logo: true,
        verified: true,
        color: true,
        contact: true,
        welcome: true,
      },
    });
    if (!org) fail("Organization not found.", 404);
    const elections = await db.election.findMany({
      where: { organizationId: org.id },
      include: {
        organization: true,
        positions: { include: { candidates: true } },
      },
      orderBy: { votingStart: "desc" },
      take: 100,
    });
    const available = [];
    for (const e of elections)
      try {
        await visible(req, e);
        available.push(publicElection(e));
      } catch {}
    res.json({ ...org, elections: available });
  }),
);
app.get(
  "/api/public/stats",
  route(async (req, res) =>
    res.json({
      organizations: await db.organization.count({
        where: { suspended: false },
      }),
      publishedElections: await db.election.count({
        where: {
          access: "PUBLIC",
          status: { in: ["RESULTS_PUBLISHED", "ARCHIVED"] },
          organization: { suspended: false },
        },
      }),
      publicBallots: await db.ballot.count({
        where: {
          position: {
            election: {
              access: "PUBLIC",
              status: { in: ["RESULTS_PUBLISHED", "ARCHIVED"] },
              organization: { suspended: false },
            },
          },
        },
      }),
    }),
  ),
);
app.post(
  "/api/organizations",
  route(async (req, res) => {
    const u = requireUser(req);
    if (!u.emailVerified)
      fail("Verify your email to create an organization.", 403);
    const input = z
      .object({
        name: z.string().trim().min(2).max(100),
        description: z.string().max(1000).default(""),
      })
      .parse(req.body);
    const org = await db.organization.create({
      data: {
        ...input,
        slug:
          input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
          "-" +
          token().slice(0, 6),
        members: { create: { userId: u.id, role: "ADMIN" } },
      },
    });
    await logAudit(u.id, "ORGANIZATION_CREATED", org.id);
    res.status(201).json(org);
  }),
);
app.patch(
  "/api/organizations/:id",
  route(async (req, res) => {
    await access(req, req.params.id, ["ADMIN"]);
    const input = z
      .object({
        name: z.string().min(2).max(100).optional(),
        description: z.string().max(2000).optional(),
        logo: httpUrl.optional(),
        color: z
          .string()
          .regex(/^#[a-fA-F0-9]{6}$/)
          .optional(),
        contact: z.string().max(200).optional(),
        welcome: z.string().max(500).optional(),
      })
      .parse(req.body);
    const org = await db.organization.update({
      where: { id: req.params.id },
      data: input,
    });
    await logAudit(req.user.id, "BRANDING_UPDATED", org.id);
    res.json(org);
  }),
);
app.delete(
  "/api/organizations/:id",
  route(async (req, res) => {
    const u = requireUser(req);
    await access(req, req.params.id, ["ADMIN"]);
    const { confirmation } = z
      .object({ confirmation: z.string().trim().min(1).max(100) })
      .parse(req.body);
    if (req.session.reauthenticatedAt < new Date(Date.now() - 10 * 60000))
      fail("Sign in again before deleting an organization.", 403);
    await serializable(async (tx) => {
      await tx.$queryRaw`SELECT id FROM evote."Organization" WHERE id=${req.params.id} FOR UPDATE`;
      const organization = await tx.organization.findUnique({
        where: { id: req.params.id },
        include: {
          elections: { select: { id: true, status: true } },
          _count: { select: { subscriptions: true, payments: true } },
        },
      });
      if (!organization || organization.suspended)
        fail("Organization not found.", 404);
      if (confirmation !== organization.name)
        fail(`Type ${organization.name} exactly to confirm deletion.`);
      if (organization._count.subscriptions || organization._count.payments)
        fail(
          "This organization has billing records. Cancel its subscription and contact support before deletion.",
        );
      if (organization.elections.some((e) => e.status !== "DRAFT"))
        fail(
          "An organization with an active or completed election cannot be deleted. Archive those elections and contact support if removal is required.",
        );
      const electionIds = organization.elections.map((e) => e.id);
      if (electionIds.length) {
        const [ballots, participation, receipts, eligibility, verification] =
          await Promise.all([
            tx.ballot.count({
              where: { position: { electionId: { in: electionIds } } },
            }),
            tx.voteStatus.count({
              where: { position: { electionId: { in: electionIds } } },
            }),
            tx.voteReceipt.count({
              where: { position: { electionId: { in: electionIds } } },
            }),
            tx.voterEligibility.count({
              where: { electionId: { in: electionIds } },
            }),
            tx.verificationRequest.count({
              where: { electionId: { in: electionIds } },
            }),
          ]);
        if (ballots || participation || receipts || eligibility || verification)
          fail(
            "This organization has protected participation records and cannot be deleted.",
          );
        await tx.notificationCampaign.deleteMany({
          where: { electionId: { in: electionIds } },
        });
        await tx.invitation.deleteMany({
          where: { electionId: { in: electionIds } },
        });
        await tx.electionActivity.deleteMany({
          where: { electionId: { in: electionIds } },
        });
        await tx.candidate.deleteMany({
          where: { position: { electionId: { in: electionIds } } },
        });
        await tx.electionPosition.deleteMany({
          where: { electionId: { in: electionIds } },
        });
        await tx.election.deleteMany({ where: { id: { in: electionIds } } });
      }
      await tx.organizationJoinRequest.deleteMany({
        where: { organizationId: organization.id },
      });
      await tx.organizationGroup.deleteMany({
        where: { organizationId: organization.id },
      });
      await tx.organizationMember.deleteMany({
        where: { organizationId: organization.id },
      });
      await tx.organization.update({
        where: { id: organization.id },
        data: {
          name: "Deleted organization",
          slug: `deleted-${organization.id}`,
          description: "",
          logo: "",
          contact: "",
          welcome: "",
          verified: false,
          suspended: true,
          plan: "FREE",
        },
      });
      await audit(
        u.id,
        "ORGANIZATION_DELETED",
        organization.id,
        undefined,
        "SUCCESS",
        tx,
      );
    });
    res.json({ ok: true });
  }),
);
app.get(
  "/api/organizations/:id/members",
  route(async (req, res) => {
    await access(req, req.params.id);
    res.json(
      await db.organizationMember.findMany({
        where: { organizationId: req.params.id },
        include: {
          user: {
            select: { id: true, name: true, email: true, emailVerified: true },
          },
        },
      }),
    );
  }),
);
app.post(
  "/api/organizations/:id/members",
  route(async (req, res) => {
    await access(req, req.params.id, ["ADMIN"]);
    const input = z
      .object({
        email: z.string().email(),
        role: z.enum(["ADMIN", "MODERATOR", "VOTER", "CANDIDATE"]),
        active: z.boolean().default(true),
      })
      .parse(req.body);
    const u = await db.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (!u) fail("This person must create an account first.");
    // Keep at least one active administrator.
    await serializable(async (tx) => {
      const current = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: req.params.id,
            userId: u!.id,
          },
        },
      });
      if (
        current?.role === "ADMIN" &&
        current.active &&
        (!input.active || input.role !== "ADMIN") &&
        (await tx.organizationMember.count({
          where: { organizationId: req.params.id, role: "ADMIN", active: true },
        })) <= 1
      )
        fail("An organization must retain an administrator.");
      await tx.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: req.params.id,
            userId: u!.id,
          },
        },
        create: {
          organizationId: req.params.id,
          userId: u!.id,
          role: input.role,
          active: input.active,
        },
        update: { role: input.role, active: input.active },
      });
      await audit(
        req.user.id,
        "MEMBER_UPDATED",
        req.params.id,
        undefined,
        "SUCCESS",
        tx,
      );
    });
    res.json({ ok: true });
  }),
);
const electionSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(3).max(120),
  description: z.string().max(3000).default(""),
  mode: z.enum(["GENERAL", "ELECTION_DEMO"]).default("GENERAL"),
  timezone: z.string().max(80).default("Africa/Lagos"),
  location: z.string().max(120).default(""),
  banner: z.string().url().or(z.literal("")).default(""),
  registrationStart: z.string().datetime().nullable().optional(),
  registrationEnd: z.string().datetime().nullable().optional(),
  votingStart: z.string().datetime(),
  votingEnd: z.string().datetime(),
  publishAt: z.string().datetime().nullable().optional(),
  minAge: z.number().int().min(0).max(120).default(0),
  maxAge: z.number().int().min(0).max(120).nullable().default(null),
  membershipRequired: z.boolean().default(false),
  geography: z.string().max(100).default(""),
  customRules: z.string().max(2000).default(""),
  groupId: z.string().uuid().nullable().default(null),
  faq: z
    .array(
      z.object({
        question: z.string().min(3).max(200),
        answer: z.string().min(3).max(1000),
      }),
    )
    .max(12)
    .default([]),
  resultVisibility: z.enum(["HIDDEN", "LIVE", "DELAYED"]).default("HIDDEN"),
  access: z
    .enum(["PUBLIC", "PRIVATE", "ORGANIZATION", "PASSWORD"])
    .default("PUBLIC"),
  eventPassword: z.string().min(12).max(128).optional(),
});
function schedule(input: any, passwordAlreadySet = false) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  } catch {
    fail("Invalid election timezone.");
  }
  if (new Date(input.votingEnd) <= new Date(input.votingStart))
    fail("Voting end must follow voting start.");
  if (
    input.registrationStart &&
    input.registrationEnd &&
    new Date(input.registrationEnd) <= new Date(input.registrationStart)
  )
    fail("Registration end must follow registration start.");
  if (
    input.registrationEnd &&
    new Date(input.registrationEnd) > new Date(input.votingStart)
  )
    fail("Registration must end before voting starts.");
  if (input.publishAt && new Date(input.publishAt) < new Date(input.votingEnd))
    fail("Publication must follow voting end.");
  if (input.resultVisibility === "DELAYED" && !input.publishAt)
    fail("Delayed results require a publication date.");
  if (input.maxAge != null && input.maxAge < input.minAge)
    fail("Maximum age must be at least minimum age.");
  if (input.mode === "ELECTION_DEMO" && input.resultVisibility === "LIVE")
    fail("Formal demonstration elections use hidden or delayed results.");
  if (
    input.access === "PASSWORD" &&
    !input.eventPassword &&
    !passwordAlreadySet
  )
    fail("Set an event password.");
}
async function electionData(input: any) {
  const { eventPassword, ...data } = input;
  for (const field of [
    "registrationStart",
    "registrationEnd",
    "votingStart",
    "votingEnd",
    "publishAt",
  ])
    if (data[field]) data[field] = new Date(data[field]);
  return {
    ...data,
    eventPasswordHash: eventPassword ? await argon2.hash(eventPassword) : null,
  };
}
function publicElection(e: any) {
  const { eventPasswordHash, ...data } = e;
  return {
    ...data,
    runoffElection:
      e.runoffElection?.status === "DRAFT" ? null : e.runoffElection,
    positions: e.positions.map((p: any) => ({
      ...p,
      candidates: p.candidates
        .filter((c: any) => c.status === "APPROVED")
        .map((c: any) => {
          const { userId, ...publicProfile } = c;
          return publicProfile;
        }),
    })),
  };
}
app.get(
  "/api/elections",
  route(async (req, res) => {
    const q = z
      .string()
      .max(100)
      .parse(req.query.q || "");
    const statusFilter = z
      .string()
      .max(40)
      .parse(req.query.status || "");
    if (req.user?.role === "SUPER_ADMIN") requirePlatformAdmin(req);
    if (statusFilter && !Object.hasOwn(transitions, statusFilter))
      fail("Unknown election status.");
    const memberships = req.user
        ? await db.organizationMember.findMany({
            where: { userId: req.user.id, active: true },
          })
        : [],
      records = req.user
        ? await db.voterEligibility.findMany({ where: { userId: req.user.id } })
        : [];
    const allowed: any =
      req.user?.role === "SUPER_ADMIN"
        ? {}
        : {
            organization: { suspended: false },
            OR: [
              { access: "PUBLIC", status: { not: "DRAFT" } },
              {
                organizationId: {
                  in: memberships
                    .filter((m) => ["ADMIN", "MODERATOR"].includes(m.role))
                    .map((m) => m.organizationId),
                },
              },
              {
                access: "ORGANIZATION",
                status: { not: "DRAFT" },
                organizationId: {
                  in: memberships.map((m) => m.organizationId),
                },
              },
              {
                access: { in: ["PRIVATE", "PASSWORD"] },
                status: { not: "DRAFT" },
                id: { in: records.map((r) => r.electionId) },
              },
            ],
          };
    const search = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { organization: { name: { contains: q, mode: "insensitive" } } },
            {
              positions: {
                some: {
                  OR: [
                    { title: { contains: q, mode: "insensitive" } },
                    {
                      candidates: {
                        some: {
                          status: "APPROVED",
                          name: { contains: q, mode: "insensitive" },
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        }
      : {};
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(req.query.page || 1);
    const all = await db.election.findMany({
      where: {
        AND: [allowed, search, statusFilter ? { status: statusFilter } : {}],
      },
      include: {
        organization: true,
        positions: { include: { candidates: true } },
      },
      orderBy: { votingStart: "asc" },
      take: 100,
      skip: (page - 1) * 100,
    });
    res.json(
      all.map((e) => ({
        ...publicElection(e),
        viewerEligibility: req.user
          ? {
              status:
                records.find((r) => r.electionId === e.id)?.status ||
                "NOT_REGISTERED",
              reason: eligibilityReason(
                e,
                req.user,
                records.find((r) => r.electionId === e.id),
                memberships.find((m) => m.organizationId === e.organizationId),
              ),
            }
          : null,
      })),
    );
  }),
);
app.get(
  "/api/elections/:id",
  route(async (req, res) => {
    const e = await getElection(req.params.id);
    await visible(req, e);
    res.json(publicElection(e));
  }),
);
app.post(
  "/api/elections",
  route(async (req, res) => {
    const { positions, ...input } = electionSchema
      .extend({
        positions: z
          .array(
            z.object({
              title: z.string().trim().min(2).max(100),
              method: z.enum([
                "SINGLE",
                "MULTIPLE",
                "APPROVAL",
                "RANKED",
                "WEIGHTED",
              ]),
              maxChoices: z.number().int().min(1).max(100),
              maxVotes: z.number().int().min(1).max(100),
              runoff: z.boolean(),
            }),
          )
          .min(1)
          .max(50)
          .optional(),
      })
      .parse(req.body);
    await access(req, input.organizationId, ["ADMIN"]);
    schedule(input);
    if (
      input.groupId &&
      !(await db.organizationGroup.findFirst({
        where: { id: input.groupId, organizationId: input.organizationId },
      }))
    )
      fail("Choose a group in this organization.");
    if (
      positions &&
      new Set(positions.map((p) => p.title.toLowerCase())).size !==
        positions.length
    )
      fail("Every position must have a distinct title.");
    if (
      input.mode === "ELECTION_DEMO" &&
      positions?.some((p) => p.maxVotes !== 1 || p.method === "WEIGHTED")
    )
      fail("Formal demonstrations require one participation and equal weight.");
    const e = await serializable(async (tx) => {
      const created = await tx.election.create({
        data: {
          ...(await electionData(input)),
          slug:
            input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
            "-" +
            token().slice(0, 6),
          positions: positions ? { create: positions } : undefined,
        },
      });
      await audit(
        req.user.id,
        "ELECTION_CREATED",
        created.organizationId,
        created.id,
        "SUCCESS",
        tx,
      );
      return created;
    });
    const { eventPasswordHash, ...safe } = e;
    res.status(201).json(safe);
  }),
);
app.patch(
  "/api/elections/:id",
  route(async (req, res) => {
    const e = await getElection(req.params.id);
    await access(req, e.organizationId, ["ADMIN"]);
    const input = electionSchema.parse({
      ...e,
      ...req.body,
      organizationId: e.organizationId,
      votingStart: req.body.votingStart || e.votingStart.toISOString(),
      votingEnd: req.body.votingEnd || e.votingEnd.toISOString(),
      registrationStart:
        req.body.registrationStart !== undefined
          ? req.body.registrationStart
          : e.registrationStart?.toISOString(),
      registrationEnd:
        req.body.registrationEnd !== undefined
          ? req.body.registrationEnd
          : e.registrationEnd?.toISOString(),
      publishAt:
        req.body.publishAt !== undefined
          ? req.body.publishAt
          : e.publishAt?.toISOString(),
    });
    schedule(input, !!e.eventPasswordHash);
    if (
      input.groupId &&
      !(await db.organizationGroup.findFirst({
        where: { id: input.groupId, organizationId: e.organizationId },
      }))
    )
      fail("Choose a group in this organization.");
    const data = await electionData(input);
    if (!input.eventPassword) data.eventPasswordHash = e.eventPasswordHash;
    await db.$transaction(async (tx) => {
      const changed = await tx.election.updateMany({
        where: { id: e.id, status: "DRAFT" },
        data,
      });
      if (!changed.count) fail("Election configuration is locked after draft.");
      await audit(
        req.user.id,
        "ELECTION_UPDATED",
        e.organizationId,
        e.id,
        "SUCCESS",
        tx,
      );
    });
    res.json({ ok: true });
  }),
);
app.delete(
  "/api/elections/:id",
  route(async (req, res) => {
    requireUser(req);
    const e = await getElection(req.params.id);
    await access(req, e.organizationId, ["ADMIN"]);
    await serializable(async (tx) => {
      const current = await tx.election.findUnique({
        where: { id: e.id },
        select: {
          status: true,
          organizationId: true,
          runoffElection: { select: { id: true } },
        },
      });
      if (!current) fail("Election not found.", 404);
      if (current.status !== "DRAFT")
        fail(
          "Only draft elections can be deleted. Archive an election after it begins.",
        );
      const [ballots, participation, receipts, eligibility, verification] =
        await Promise.all([
          tx.ballot.count({ where: { position: { electionId: e.id } } }),
          tx.voteStatus.count({ where: { position: { electionId: e.id } } }),
          tx.voteReceipt.count({ where: { position: { electionId: e.id } } }),
          tx.voterEligibility.count({ where: { electionId: e.id } }),
          tx.verificationRequest.count({ where: { electionId: e.id } }),
        ]);
      if (
        current.runoffElection ||
        ballots ||
        participation ||
        receipts ||
        eligibility ||
        verification
      )
        fail(
          "This draft already has protected participation records and cannot be deleted.",
        );
      await tx.invitation.deleteMany({ where: { electionId: e.id } });
      await tx.electionResult.deleteMany({ where: { electionId: e.id } });
      await tx.electionActivity.deleteMany({ where: { electionId: e.id } });
      await tx.candidate.deleteMany({
        where: { position: { electionId: e.id } },
      });
      await tx.electionPosition.deleteMany({ where: { electionId: e.id } });
      await tx.election.delete({ where: { id: e.id } });
      await audit(
        req.user.id,
        "ELECTION_DELETED",
        current.organizationId,
        e.id,
        "SUCCESS",
        tx,
      );
    });
    res.json({ ok: true });
  }),
);
app.post(
  "/api/elections/:id/positions",
  route(async (req, res) => {
    const e = await getElection(req.params.id);
    await access(req, e.organizationId, ["ADMIN"]);
    const input = z
      .object({
        title: z.string().trim().min(2).max(100),
        method: z
          .enum(["SINGLE", "MULTIPLE", "APPROVAL", "RANKED", "WEIGHTED"])
          .default("SINGLE"),
        maxChoices: z.number().int().min(1).max(100).default(1),
        maxVotes: z.number().int().min(1).max(100).default(1),
        runoff: z.boolean().default(false),
      })
      .parse(req.body);
    if (
      e.mode === "ELECTION_DEMO" &&
      (input.maxVotes !== 1 || input.method === "WEIGHTED")
    )
      fail(
        "Election demonstrations enforce one participation per position and equal voting weight.",
      );
    const p = await serializable(async (tx) => {
      const locked = await tx.election.findUnique({ where: { id: e.id } });
      if (locked?.status !== "DRAFT") fail("Positions are locked after draft.");
      const p = await tx.electionPosition.create({
        data: { electionId: e.id, ...input },
      });
      await audit(
        req.user.id,
        "POSITION_CREATED",
        e.organizationId,
        e.id,
        "SUCCESS",
        tx,
      );
      return p;
    });
    res.status(201).json(p);
  }),
);
app.get(
  "/api/elections/:id/candidates",
  route(async (req, res) => {
    const e = await getElection(req.params.id);
    await visible(req, e);
    res.json(publicElection(e).positions.flatMap((p: any) => p.candidates));
  }),
);
app.post(
  "/api/elections/:id/candidates",
  route(async (req, res) => {
    const e = await getElection(req.params.id),
      u = requireUser(req);
    let admin = true;
    try {
      await access(req, e.organizationId, ["ADMIN"]);
    } catch {
      admin = false;
      await visible(req, e);
    }
    const { accountEmail, ...input } = z
      .object({
        accountEmail: z.string().email().optional(),
        positionId: z.string().uuid(),
        name: z.string().trim().min(2).max(100),
        bio: z.string().max(2000).default(""),
        manifesto: z.string().max(5000).default(""),
        campaign: z.string().max(2000).default(""),
        socialLinks: z.array(httpUrl).max(5).default([]),
      })
      .parse(req.body);
    let candidateUserId: string | null = admin ? null : u.id;
    if (admin && accountEmail) {
      const candidateUser = await db.user.findFirst({
        where: {
          email: accountEmail.toLowerCase(),
          emailVerified: true,
          suspended: false,
          memberships: {
            some: { organizationId: e.organizationId, active: true },
          },
        },
      });
      if (!candidateUser)
        fail(
          "The candidate account must be a confirmed active member of this organization.",
        );
      candidateUserId = candidateUser.id;
    }
    if (!e.positions.some((p) => p.id === input.positionId))
      fail("Position does not belong to this election.");
    const c = await serializable(async (tx) => {
      const current = await tx.election.findUnique({ where: { id: e.id } });
      if (
        !["DRAFT", "REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(
          current!.status,
        )
      )
        fail("Candidate submissions are closed.");
      const c = await tx.candidate.create({
        data: {
          ...input,
          userId: candidateUserId,
          status: admin ? "APPROVED" : "PENDING",
        },
      });
      await audit(
        u.id,
        "CANDIDATE_SUBMITTED",
        e.organizationId,
        e.id,
        "SUCCESS",
        tx,
      );
      return c;
    });
    res.status(201).json(c);
  }),
);
app.patch(
  "/api/candidates/:id",
  route(async (req, res) => {
    const c = await db.candidate.findUnique({
      where: { id: req.params.id },
      include: { position: { include: { election: true } } },
    });
    if (!c) fail("Candidate not found.", 404);
    const e = c!.position.election;
    const u = requireUser(req);
    let official = true;
    try {
      await access(req, e.organizationId);
    } catch {
      official = false;
      if (c.userId !== u.id) fail("You cannot edit this candidate.", 403);
    }
    const input = z
      .object({
        status: z.enum(["APPROVED", "REJECTED", "WITHDRAWN"]).optional(),
        name: z.string().trim().min(2).max(100).optional(),
        bio: z.string().max(2000).optional(),
        manifesto: z.string().max(5000).optional(),
        campaign: z.string().max(2000).optional(),
        socialLinks: z.array(httpUrl).max(5).optional(),
      })
      .parse(req.body);
    if (!official && input.status)
      fail("Only election officials may approve or reject candidates.", 403);
    const data = { ...input, ...(!official ? { status: "PENDING" } : {}) };
    await serializable(async (tx) => {
      const current = await tx.election.findUnique({ where: { id: e.id } });
      if (
        !["DRAFT", "REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(
          current!.status,
        )
      )
        fail("Candidates are locked once voting starts.");
      await tx.candidate.update({ where: { id: c!.id }, data });
      await audit(
        req.user.id,
        "CANDIDATE_" + (data.status || "UPDATED"),
        e.organizationId,
        e.id,
        "SUCCESS",
        tx,
      );
    });
    res.json({ ok: true });
  }),
);
app.get(
  "/api/account/candidates",
  route(async (req, res) =>
    res.json(
      await db.candidate.findMany({
        where: { userId: requireUser(req).id },
        include: {
          position: {
            include: {
              election: { select: { name: true, status: true, slug: true } },
            },
          },
        },
      }),
    ),
  ),
);
app.post(
  "/api/elections/:id/state",
  route(async (req, res) => {
    const e = await getElection(req.params.id);
    await access(req, e.organizationId, ["ADMIN"]);
    const { status: requestedStatus } = z
      .object({ status: z.string() })
      .parse(req.body);
    const targetFor = (election: any) => {
      if (requestedStatus !== "LAUNCH") return requestedStatus;
      try {
        return launchTarget(election);
      } catch (error: any) {
        fail(error.message);
      }
    };
    let status = targetFor(e);
    if (
      requestedStatus !== "LAUNCH" &&
      !transitions[e.status]?.includes(status)
    )
      fail("Invalid election state transition.");
    if (
      ["REGISTRATION_OPEN", "VOTING_UPCOMING", "VOTING_OPEN"].includes(
        status,
      ) &&
      (!e.positions.length ||
        e.positions.some(
          (p) => !p.candidates.some((c) => c.status === "APPROVED"),
        ))
    )
      fail("Every position needs an approved candidate.");
    if (
      status === "REGISTRATION_OPEN" &&
      ((e.registrationStart && new Date() < e.registrationStart) ||
        (e.registrationEnd && new Date() >= e.registrationEnd))
    )
      fail("Registration is outside its scheduled period.");
    if (
      status === "VOTING_OPEN" &&
      (new Date() < e.votingStart || new Date() >= e.votingEnd)
    )
      fail("Voting is outside its scheduled period.");
    if (
      status === "RESULTS_PUBLISHED" &&
      e.publishAt &&
      new Date() < e.publishAt
    )
      fail("The configured publication date has not arrived.");
    status = await serializable(async (tx) => {
      await tx.$queryRaw`SELECT id FROM evote."Election" WHERE id=${e.id} FOR UPDATE`;
      const current = await tx.election.findUnique({
        where: { id: e.id },
        include: { positions: { include: { candidates: true } } },
      });
      if (current?.status !== e.status)
        fail("Election state changed. Refresh.");
      const committedStatus = targetFor(current);
      if (
        requestedStatus !== "LAUNCH" &&
        !transitions[current.status]?.includes(committedStatus)
      )
        fail("Invalid election state transition.");
      if (
        ["REGISTRATION_OPEN", "VOTING_UPCOMING", "VOTING_OPEN"].includes(
          committedStatus,
        ) &&
        (!current.positions.length ||
          current.positions.some(
            (p) => !p.candidates.some((c) => c.status === "APPROVED"),
          ))
      )
        fail("Every position needs an approved candidate.");
      const counts =
        committedStatus === "VOTING_OPEN"
          ? await eligibilityCounts(current, tx)
          : null;
      const updated = await tx.election.updateMany({
        where: { id: e.id, status: e.status },
        data: {
          status: committedStatus,
          ...(counts
            ? {
                registeredAtOpen: counts.registered,
                eligibleAtOpen: counts.eligible,
              }
            : {}),
        },
      });
      if (!updated.count) fail("Election state changed. Refresh.");
      if (committedStatus === "RESULTS_PENDING")
        await tx.electionResult.create({
          data: {
            electionId: e.id,
            data: (await calculate(current, tx)) as any,
          },
        });
      await audit(
        req.user.id,
        committedStatus,
        e.organizationId,
        e.id,
        "SUCCESS",
        tx,
      );
      await tx.notificationCampaign.create({
        data: {
          electionId: e.id,
          title: committedStatus,
          message: `${e.name}: ${committedStatus.replaceAll("_", " ").toLowerCase()}`,
        },
      });
      return committedStatus;
    });
    res.json({ ok: true, status });
  }),
);
app.post(
  "/api/elections/:id/register",
  route(async (req, res) => {
    const e = await getElection(req.params.id),
      u = requireUser(req);
    await visible(req, e);
    if (!u.emailVerified) fail("Verify your email first.", 403);
    if (
      e.status !== "REGISTRATION_OPEN" ||
      (e.registrationStart && new Date() < e.registrationStart) ||
      (e.registrationEnd && new Date() > e.registrationEnd)
    )
      fail("Registration is closed.");
    const row = await db.voterEligibility.upsert({
      where: { electionId_userId: { electionId: e.id, userId: u.id } },
      create: { electionId: e.id, userId: u.id },
      update: {},
    });
    await logAudit(u.id, "VOTER_REGISTERED", e.organizationId, e.id);
    res.json(row);
  }),
);
app.post(
  "/api/elections/:id/invitations",
  route(async (req, res) => {
    const e = await getElection(req.params.id);
    await access(req, e.organizationId, ["ADMIN"]);
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const raw = token();
    await db.invitation.create({
      data: {
        id: digest(raw),
        electionId: e.id,
        email: email.toLowerCase(),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    const link = `${origin}/invitations/${raw}`;
    await queueMail(
      email,
      "Election invitation",
      `You are invited to ${e.name}. ${link}`,
    );
    await logAudit(req.user.id, "INVITATION_CREATED", e.organizationId, e.id);
    res.json({ link });
  }),
);
app.post(
  "/api/invitations/accept",
  route(async (req, res) => {
    const u = requireUser(req);
    const { token: raw } = z
      .object({ token: z.string().min(30) })
      .parse(req.body);
    if (!u.emailVerified) fail("Verify your email first.");
    const invitation = await serializable(async (tx) => {
      const i = await tx.invitation.findUnique({ where: { id: digest(raw) } });
      if (!i || i.usedAt || i.expiresAt < new Date() || i.email !== u.email)
        fail("Invitation is invalid for this account.");
      await tx.invitation.update({
        where: { id: i!.id },
        data: { usedAt: new Date() },
      });
      await tx.voterEligibility.upsert({
        where: {
          electionId_userId: { electionId: i!.electionId, userId: u.id },
        },
        create: { electionId: i!.electionId, userId: u.id },
        update: {},
      });
      return i!;
    });
    res.json({ electionId: invitation.electionId });
  }),
);
app.post(
  "/api/elections/:id/unlock",
  authLimit,
  route(async (req, res) => {
    const e = await getElection(req.params.id),
      u = requireUser(req);
    const { password } = z
      .object({ password: z.string().max(128) })
      .parse(req.body);
    if (
      e.access !== "PASSWORD" ||
      !e.eventPasswordHash ||
      !(await argon2.verify(e.eventPasswordHash, password))
    )
      fail("Invalid event password.", 403);
    if (!u.emailVerified) fail("Verify your email first.");
    await db.voterEligibility.upsert({
      where: { electionId_userId: { electionId: e.id, userId: u.id } },
      create: { electionId: e.id, userId: u.id },
      update: {},
    });
    res.json({ ok: true });
  }),
);
app.get(
  "/api/elections/:id/eligibility",
  route(async (req, res) => {
    const e = await getElection(req.params.id),
      u = requireUser(req);
    await visible(req, e);
    const record = await db.voterEligibility.findUnique({
        where: { electionId_userId: { electionId: e.id, userId: u.id } },
      }),
      member = await db.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: e.organizationId,
            userId: u.id,
          },
        },
      });
    res.json({
      status: record?.status || "NOT_REGISTERED",
      reason: eligibilityReason(e, u, record, member),
      requireCaptcha: process.env.REQUIRE_VOTE_CAPTCHA === "true",
      receipts: await db.voteStatus.findMany({
        where: { userId: u.id, position: { electionId: e.id } },
        select: {
          positionId: true,
          count: true,
          receipt: true,
          recordedAt: true,
        },
      }),
    });
  }),
);
app.post(
  "/api/elections/:id/vote",
  rateLimit({ windowMs: 60000, limit: 20 }),
  route(async (req, res) => {
    const u = requireUser(req),
      e = await getElection(req.params.id);
    await visible(req, e);
    const input = z
      .object({
        positionId: z.string().uuid(),
        choices: z.array(z.string().uuid()).min(1).max(100),
      })
      .parse(req.body);
    if (process.env.REQUIRE_VOTE_CAPTCHA === "true") await bot(req);
    const receipt = "EVT-" + token().slice(0, 16).toUpperCase();
    const saved = await serializable(async (tx) => {
      // Closing waits for in-flight submissions to finish before results can be calculated.
      await tx.$queryRaw`SELECT id FROM "evote"."Election" WHERE id = ${e.id} FOR SHARE`;
      const current = await tx.election.findUnique({
        where: { id: e.id },
        include: { organization: true },
      });
      if (
        current?.status !== "VOTING_OPEN" ||
        new Date() < current.votingStart ||
        new Date() >= current.votingEnd
      )
        fail("Voting is closed.", 409);
      if (current.organization.suspended)
        fail("Organization participation is suspended.", 403);
      const freshUser = await tx.user.findUnique({ where: { id: u.id } }),
        record = await tx.voterEligibility.findUnique({
          where: { electionId_userId: { electionId: e.id, userId: u.id } },
        }),
        member = await tx.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: e.organizationId,
              userId: u.id,
            },
          },
        });
      const reason = eligibilityReason(current, freshUser, record, member);
      if (reason) fail(reason, 403);
      const p = await tx.electionPosition.findFirst({
        where: { id: input.positionId, electionId: e.id },
        include: { candidates: true },
      });
      if (!p) fail("Position does not belong to this election.");
      try {
        validateChoices(p, p!.candidates, input.choices);
      } catch (err: any) {
        fail(err.message);
      }
      const previous = await tx.voteStatus.findUnique({
        where: { userId_positionId: { userId: u.id, positionId: p!.id } },
      });
      if (previous && previous.count >= p!.maxVotes)
        fail("You have already voted for this position.", 409);
      const cipher = encrypt(
        JSON.stringify({ choices: input.choices, weight: record!.weight }),
        "ballot",
      );
      await tx.ballot.create({
        data: {
          positionId: p!.id,
          encryptedChoice: cipher,
          commitment: digest(cipher),
        },
      });
      const hour = new Date();
      hour.setUTCMinutes(0, 0, 0);
      const activity = await tx.electionActivity.upsert({
        where: { electionId_hour: { electionId: e.id, hour } },
        create: { electionId: e.id, hour },
        update: { submissions: { increment: 1 } },
      });
      if (
        activity.submissions ===
        Number(process.env.SUSPICIOUS_VOTES_PER_HOUR || 500)
      )
        await tx.securityEvent.create({
          data: {
            organizationId: e.organizationId,
            type: "VOTING_ACTIVITY_SPIKE",
            metadata: {
              hour: hour.toISOString(),
              submissions: activity.submissions,
              reviewOnly: true,
            },
          },
        });
      await tx.voteReceipt.create({
        data: { id: receipt, userId: u.id, positionId: p!.id },
      });
      const status = await tx.voteStatus.upsert({
        where: { userId_positionId: { userId: u.id, positionId: p!.id } },
        create: { userId: u.id, positionId: p!.id, receipt },
        update: { count: { increment: 1 }, receipt, recordedAt: new Date() },
      });
      await notify(
        u.id,
        "Vote recorded",
        `Your vote in ${e.name} was recorded. Confirmation: ${receipt}`,
        tx,
      );
      return status;
    });
    // Deliberately no per-voter ballot-choice or ballot-ID audit record.
    res
      .status(201)
      .json({ code: saved.receipt, at: saved.recordedAt, election: e.name });
  }),
);
async function calculate(e: any, client: any = db) {
  const records: any[] = await client.voterEligibility.findMany({
    where: { electionId: e.id },
    include: {
      user: {
        include: {
          memberships: { where: { organizationId: e.organizationId } },
        },
      },
    },
  });
  const eligible =
      e.eligibleAtOpen ??
      records.filter(
        (r) => !eligibilityReason(e, r.user, r, r.user.memberships[0]),
      ).length,
    registered = e.registeredAtOpen ?? records.length;
  const participation: any[] = await client.voteStatus.findMany({
    where: { position: { electionId: e.id } },
    select: { userId: true, count: true, recordedAt: true },
  });
  const voters = new Set(participation.map((v) => v.userId)).size,
    hours: Record<string, number> = {};
  for (const h of await client.electionActivity.findMany({
    where: { electionId: e.id },
  }))
    hours[h.hour.toISOString().slice(0, 13)] = h.submissions;
  const positions = [];
  for (const p of e.positions) {
    const ballots: any[] = await client.ballot.findMany({
      where: { positionId: p.id },
    });
    positions.push(
      tally(
        p,
        ballots.map((b) => {
          if (digest(b.encryptedChoice) !== b.commitment)
            fail("Ballot integrity check failed.", 500);
          return JSON.parse(decrypt(b.encryptedChoice, "ballot").toString());
        }),
      ),
    );
  }
  return {
    registered,
    eligible,
    voters,
    turnout: eligible ? (voters / eligible) * 100 : 0,
    ballots: positions.reduce((a, p) => a + p.ballots, 0),
    positions,
    hours,
  };
}
app.get(
  "/api/elections/:id/results",
  route(async (req, res) => {
    const e = await getElection(req.params.id);
    await visible(req, e);
    const published = ["RESULTS_PUBLISHED", "ARCHIVED"].includes(e.status);
    const live =
      e.resultVisibility === "LIVE" &&
      ["VOTING_OPEN", "VOTING_CLOSED", "RESULTS_PENDING"].includes(e.status);
    if (!published && !live) fail("Results have not been published.", 403);
    const snapshot = published
      ? await db.electionResult.findFirst({
          where: { electionId: e.id },
          orderBy: { createdAt: "desc" },
        })
      : null;
    res.json({
      ...((snapshot?.data as any) || (await calculate(e))),
      final: published,
    });
  }),
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
app.post(
  "/api/verification/request",
  authLimit,
  upload.single("document"),
  route(async (req, res) => {
    await bot(req);
    const u = requireUser(req);
    if (!u.emailVerified) fail("Verify your email first.");
    const input = z
        .object({
          electionId: z.string().uuid(),
          type: z.enum(["MEMBERSHIP", "STUDENT", "GEOGRAPHY", "IDENTITY"]),
          note: z.string().max(1000).default(""),
        })
        .parse(req.body),
      e = await getElection(input.electionId);
    await visible(req, e);
    if (!["REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(e.status))
      fail("Verification submissions are closed.");
    if (
      await db.verificationRequest.count({
        where: { userId: u.id, electionId: e.id, status: "PENDING" },
      })
    )
      fail("A verification request is already pending.");
    const file = req.file;
    let objectKey: string | undefined;
    if (file) {
      const b = file.buffer;
      const mime =
        b.subarray(0, 5).toString() === "%PDF-"
          ? "application/pdf"
          : b
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? "image/png"
            : b[0] === 255 && b[1] === 216 && b[2] === 255
              ? "image/jpeg"
              : null;
      if (!mime || mime !== file.mimetype)
        fail("Upload a valid PDF, PNG or JPEG, up to 5 MB.");
      objectKey = await storeDocument(b);
    }
    const settings = await db.platformSettings.findUnique({
      where: { id: "platform" },
    });
    try {
      const v = await db.verificationRequest.create({
        data: {
          userId: u.id,
          electionId: e.id,
          type: input.type,
          note: input.note,
          document: objectKey
            ? {
                create: {
                  objectKey,
                  mime: file.mimetype,
                  size: file.size,
                  expiresAt: new Date(
                    Date.now() +
                      (settings?.documentRetentionDays || 30) * 86400000,
                  ),
                },
              }
            : undefined,
        },
      });
      await logAudit(u.id, "VERIFICATION_REQUESTED", e.organizationId, e.id);
      res.status(201).json({ id: v.id, status: v.status });
    } catch (err) {
      if (objectKey) await removeDocument(objectKey);
      throw err;
    }
  }),
);
app.get(
  "/api/verification/status",
  route(async (req, res) => {
    const u = requireUser(req);
    res.json(
      await db.verificationRequest.findMany({
        where: { userId: u.id },
        select: {
          id: true,
          electionId: true,
          type: true,
          status: true,
          note: true,
          createdAt: true,
          document: { select: { id: true, expiresAt: true } },
        },
      }),
    );
  }),
);
app.get(
  "/api/documents/:id",
  route(async (req, res) => {
    const d = await db.document.findUnique({
      where: { id: req.params.id },
      include: { request: { include: { election: true } } },
    });
    if (!d || d.expiresAt < new Date())
      fail("Document not found or expired.", 404);
    await access(req, d!.request.election.organizationId);
    await logAudit(
      req.user.id,
      "DOCUMENT_ACCESSED",
      d!.request.election.organizationId,
      d!.request.electionId,
    );
    res
      .set({
        "Content-Type": d!.mime,
        "Content-Disposition": 'attachment; filename="verification-document"',
        "Cache-Control": "no-store",
      })
      .send(await fetchDocument(d!.objectKey));
  }),
);
app.delete(
  "/api/documents/:id",
  route(async (req, res) => {
    const u = requireUser(req),
      d = await db.document.findUnique({
        where: { id: req.params.id },
        include: { request: { include: { election: true } } },
      });
    if (!d) fail("Document not found.", 404);
    if (d!.request.userId !== u.id)
      await access(req, d!.request.election.organizationId);
    await removeDocument(d!.objectKey);
    await db.document.delete({ where: { id: d!.id } });
    await logAudit(
      u.id,
      "DOCUMENT_DELETED",
      d!.request.election.organizationId,
      d!.request.electionId,
    );
    res.json({ ok: true });
  }),
);
app.post(
  "/api/verification/:id/review",
  route(async (req, res) => {
    const v = await db.verificationRequest.findUnique({
      where: { id: req.params.id },
      include: { election: true },
    });
    if (!v) fail("Request not found.", 404);
    await access(req, v!.election.organizationId);
    const input = z
      .object({
        status: z.enum(["VERIFIED", "REJECTED"]),
        reason: z.string().min(3).max(500),
        geography: z.string().max(100).default(""),
        weight: z.number().int().min(1).max(100).default(1),
        groupId: z.string().uuid().nullable().default(null),
      })
      .parse(req.body);
    if (
      input.groupId &&
      !(await db.organizationGroup.findFirst({
        where: {
          id: input.groupId,
          organizationId: v!.election.organizationId,
        },
      }))
    )
      fail("Select a group in this organization.");
    // Manual documents establish election eligibility, never authoritative identity/DOB.
    if (v!.type === "IDENTITY" && input.status === "VERIFIED")
      fail(
        "Identity verification must come from an authorized provider. Manual document review cannot verify identity.",
      );
    if (v!.election.mode === "ELECTION_DEMO" && input.weight !== 1)
      fail("Formal demonstrations require equal voting weight.");
    await serializable(async (tx) => {
      const e = await tx.election.findUnique({ where: { id: v!.electionId } });
      if (!["REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(e!.status))
        fail("Eligibility is locked during and after voting.");
      const changed = await tx.verificationRequest.updateMany({
        where: { id: v!.id, status: "PENDING" },
        data: { status: input.status, note: input.reason },
      });
      if (!changed.count) fail("Request already reviewed.");
      const data = { ...input, rulesApproved: input.status === "VERIFIED" };
      await tx.voterEligibility.upsert({
        where: {
          electionId_userId: { electionId: v!.electionId, userId: v!.userId },
        },
        create: { electionId: v!.electionId, userId: v!.userId, ...data },
        update: data,
      });
      await notify(v!.userId, "Verification " + input.status, input.reason, tx);
      await audit(
        req.user.id,
        "VERIFICATION_" + input.status,
        v!.election.organizationId,
        v!.electionId,
        "SUCCESS",
        tx,
      );
    });
    res.json({ ok: true });
  }),
);
app.post(
  "/api/verification/:id/provider",
  route(async (req, res) => {
    const v = await db.verificationRequest.findUnique({
      where: { id: req.params.id },
      include: { election: true },
    });
    if (!v) fail("Request not found.", 404);
    await access(req, v!.election.organizationId, ["ADMIN"]);
    if (
      !process.env.IDENTITY_PROVIDER_URL ||
      !process.env.IDENTITY_PROVIDER_TOKEN
    )
      fail("No authorized identity provider is configured.", 503);
    if (!process.env.IDENTITY_PROVIDER_URL.startsWith("https://"))
      fail("Identity provider must use HTTPS.", 503);
    if (v!.type !== "IDENTITY" || v!.status !== "PENDING")
      fail("A pending identity request is required.");
    const response = await fetch(process.env.IDENTITY_PROVIDER_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.IDENTITY_PROVIDER_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requestId: v!.id,
        userId: v!.userId,
        electionId: v!.electionId,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) fail("Verification provider is unavailable.", 502);
    const result = z
      .object({
        requestId: z.string(),
        status: z.enum(["VERIFIED", "PENDING", "REJECTED"]),
        verifiedDob: z.string().date().optional(),
        subject: z.string().min(8).max(300).optional(),
        reference: z.string().max(200),
      })
      .parse(await response.json());
    if (
      result.requestId !== v!.id ||
      (result.verifiedDob && new Date(result.verifiedDob) > new Date())
    )
      fail("Provider returned an invalid verification result.", 502);
    if (result.status === "VERIFIED" && !result.subject)
      fail(
        "The provider must return a stable pseudonymous subject for duplicate-identity protection.",
        502,
      );
    await serializable(async (tx) => {
      const e = await tx.election.findUnique({ where: { id: v!.electionId } });
      if (!["REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(e!.status))
        fail("Verification is closed.");
      const changed = await tx.verificationRequest.updateMany({
        where: { id: v!.id, status: "PENDING" },
        data: { status: result.status, provider: "AUTHORIZED_PROVIDER" },
      });
      if (!changed.count) fail("Request already reviewed.");
      if (result.status === "VERIFIED") {
        const identityHash = identityFingerprint(result.subject!),
          user = await tx.user.findUnique({ where: { id: v!.userId } });
        if (user?.identityHash && user.identityHash !== identityHash)
          fail(
            "Changing an established identity requires an authorized correction procedure.",
          );
        const existing = await tx.user.findUnique({ where: { identityHash } });
        if (existing && existing.id !== v!.userId)
          fail(
            "This verified identity already has an account. Use account recovery.",
            409,
          );
        await tx.user.update({
          where: { id: v!.userId },
          data: {
            identityHash,
            verifiedDob: result.verifiedDob
              ? new Date(result.verifiedDob)
              : undefined,
          },
        });
        await tx.voterEligibility.upsert({
          where: {
            electionId_userId: { electionId: v!.electionId, userId: v!.userId },
          },
          create: {
            electionId: v!.electionId,
            userId: v!.userId,
            status: "VERIFIED",
          },
          update: { status: "VERIFIED" },
        });
      }
      await audit(
        req.user.id,
        "PROVIDER_VERIFICATION_" + result.status,
        v!.election.organizationId,
        v!.electionId,
        "SUCCESS",
        tx,
      );
      await notify(v!.userId, "Identity verification", result.status, tx);
    });
    res.json({ status: result.status });
  }),
);
app.post(
  "/api/elections/:id/runoff",
  route(async (req, res) => {
    const parent = await getElection(req.params.id);
    await access(req, parent.organizationId, ["ADMIN"]);
    const input = z
      .object({
        name: z.string().trim().min(3).max(140),
        votingStart: z.string().datetime(),
        votingEnd: z.string().datetime(),
        positions: z.array(z.string().uuid()).min(1).max(100),
      })
      .parse(req.body);
    if (new Set(input.positions).size !== input.positions.length)
      fail("Select each position once.");
    if (!["RESULTS_PUBLISHED", "ARCHIVED"].includes(parent.status))
      fail("Publish the preceding election results first.");
    if (
      new Date(input.votingStart) <= new Date() ||
      new Date(input.votingEnd) <= new Date(input.votingStart)
    )
      fail("The runoff needs a future start and a later end.");
    const result = await calculate(parent);
    const positions = input.positions.map((id) => {
      const original = parent.positions.find((p) => p.id === id);
      const counted = result.positions.find((p) => p.id === id);
      if (
        !original?.runoff ||
        !counted?.runoffRequired ||
        counted.ballots === 0
      )
        fail("This position does not require a runoff.");
      const ranked = counted!.candidates
        .slice()
        .sort((a: any, b: any) => b.votes - a.votes);
      if (ranked.length < 2)
        fail("A runoff requires at least two approved candidates.");
      const cutoff = ranked[1].votes;
      const ids = new Set(
        ranked.filter((c: any) => c.votes >= cutoff).map((c: any) => c.id),
      );
      return {
        title: original!.title,
        method: original!.method === "WEIGHTED" ? "WEIGHTED" : "SINGLE",
        maxChoices: 1,
        maxVotes: 1,
        runoff: true,
        candidates: {
          create: original!.candidates
            .filter((c) => ids.has(c.id))
            .map(({ id, positionId, ...c }) => ({
              ...c,
              socialLinks: z
                .array(httpUrl)
                .max(5)
                .parse(c.socialLinks || []),
            })),
        },
      };
    });
    const created = await serializable(async (tx) => {
      await tx.$queryRaw`SELECT id FROM evote."Election" WHERE id=${parent.id} FOR UPDATE`;
      if (await tx.election.findUnique({ where: { runoffOfId: parent.id } }))
        fail("A runoff has already been created for this election.", 409);
      const e = await tx.election.create({
        data: {
          organizationId: parent.organizationId,
          runoffOfId: parent.id,
          name: input.name,
          slug:
            input.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "") +
            "-" +
            token().slice(0, 8).toLowerCase(),
          description:
            "Runoff following " + parent.name + ". " + parent.description,
          mode: parent.mode,
          timezone: parent.timezone,
          location: parent.location,
          banner: parent.banner,
          votingStart: new Date(input.votingStart),
          votingEnd: new Date(input.votingEnd),
          registrationEnd: new Date(input.votingStart),
          resultVisibility: "HIDDEN",
          minAge: parent.minAge,
          maxAge: parent.maxAge,
          membershipRequired: parent.membershipRequired,
          geography: parent.geography,
          customRules: parent.customRules,
          groupId: parent.groupId,
          access: parent.access,
          eventPasswordHash: parent.eventPasswordHash,
          faq: parent.faq as any,
          positions: { create: positions },
        },
      });
      await tx.$executeRaw`INSERT INTO evote."VoterEligibility" ("electionId","userId",status,geography,weight,reason,"rulesApproved","groupId")
        SELECT ${e.id},v."userId",v.status,v.geography,v.weight,v.reason,v."rulesApproved",v."groupId"
        FROM evote."VoterEligibility" v JOIN evote."User" u ON u.id=v."userId"
        WHERE v."electionId"=${parent.id} AND v.status='VERIFIED' AND u.suspended=false AND u."emailVerified"=true AND u."consentAt" IS NOT NULL`;
      await audit(
        req.user.id,
        "RUNOFF_DRAFT_CREATED",
        parent.organizationId,
        e.id,
        "SUCCESS",
        tx,
      );
      await audit(
        req.user.id,
        "RUNOFF_SCHEDULED",
        parent.organizationId,
        parent.id,
        "SUCCESS",
        tx,
      );
      return e;
    });
    const { eventPasswordHash, ...safe } = created;
    res.status(201).json(safe);
  }),
);
app.get(
  "/api/admin/dashboard",
  route(async (req, res) => {
    const u = requireUser(req);
    if (u.role === "SUPER_ADMIN") requirePlatformAdmin(req);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .default(1)
      .parse(req.query.page);
    const q = z.string().max(100).default("").parse(req.query.q);
    const memberships = await db.organizationMember.findMany({
      where: {
        userId: u.id,
        active: true,
        role: { in: ["ADMIN", "MODERATOR"] },
      },
      include: { organization: true },
    });
    const organizations =
      u.role === "SUPER_ADMIN"
        ? await db.organization.findMany({
            take: 100,
            orderBy: { name: "asc" },
          })
        : memberships.map((m) => m.organization);
    const ids = memberships.map((m) => m.organizationId);
    const scope =
      u.role === "SUPER_ADMIN"
        ? {}
        : { organizationId: { in: ids }, organization: { suspended: false } };
    const where = {
      ...scope,
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    };
    const [
      elections,
      total,
      states,
      registered,
      verified,
      participation,
      alerts,
      audits,
      security,
    ] = await Promise.all([
      db.election.findMany({
        where,
        take: 30,
        skip: (page - 1) * 30,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          organization: true,
          positions: { include: { candidates: true } },
        },
      }),
      db.election.count({ where }),
      db.election.groupBy({ by: ["status"], where: scope, _count: true }),
      db.voterEligibility.count({ where: { election: scope } }),
      db.voterEligibility.count({
        where: { election: scope, status: "VERIFIED" },
      }),
      db.voteStatus.aggregate({
        where: { position: { election: scope } },
        _sum: { count: true },
      }),
      db.securityEvent.count({
        where: {
          ...(u.role === "SUPER_ADMIN" ? {} : { organizationId: { in: ids } }),
          reviewed: false,
        },
      }),
      db.auditLog.findMany({
        where: u.role === "SUPER_ADMIN" ? {} : { organizationId: { in: ids } },
        take: 200,
        orderBy: { id: "desc" },
      }),
      db.securityEvent.findMany({
        where: u.role === "SUPER_ADMIN" ? {} : { organizationId: { in: ids } },
        take: 100,
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const count = (...statuses: string[]) =>
      states
        .filter((s) => statuses.includes(s.status))
        .reduce((n, s) => n + s._count, 0);
    // Identity lists are fetched separately in authorized, searched, bounded pages.
    // This endpoint never loads or returns individual ballots.
    res.json({
      organizations,
      memberships,
      elections: elections.map(({ eventPasswordHash, ...data }) => data),
      pagination: { page, total, pages: Math.max(1, Math.ceil(total / 30)) },
      audits: audits.map((a) => ({ ...a, id: a.id.toString() })),
      security,
      stats: {
        active: count("VOTING_OPEN"),
        upcoming: count("DRAFT", "REGISTRATION_OPEN", "VOTING_UPCOMING"),
        completed: count(
          "VOTING_CLOSED",
          "RESULTS_PENDING",
          "RESULTS_PUBLISHED",
          "ARCHIVED",
        ),
        registered,
        verified,
        votes: participation._sum.count || 0,
        alerts,
      },
    });
  }),
);
app.get(
  "/api/admin/audit-logs",
  route(async (req, res) => {
    const id = z.string().uuid().parse(req.query.organizationId);
    await access(req, id);
    const rows = await db.auditLog.findMany({
      where: { organizationId: id },
      orderBy: { id: "desc" },
      take: 500,
    });
    res.json(rows.map((a) => ({ ...a, id: a.id.toString() })));
  }),
);
app.post(
  "/api/admin/audit-integrity",
  route(async (req, res) => {
    requirePlatformAdmin(req, true);
    const rows = await db.auditLog.findMany({ orderBy: { id: "asc" } });
    let previousHash = "GENESIS",
      valid = true;
    for (const r of rows) {
      const { actor, event, organizationId, electionId, result } = r;
      const hash = digest(
        JSON.stringify({
          actor,
          event,
          organizationId,
          electionId,
          result,
          createdAt: r.createdAt.toISOString(),
          previousHash,
        }),
      );
      if (r.previousHash !== previousHash || hash !== r.hash) {
        valid = false;
        break;
      }
      previousHash = r.hash;
    }
    res.json({ valid, records: rows.length });
  }),
);
app.post(
  "/api/security/:id/review",
  route(async (req, res) => {
    const s = await db.securityEvent.findUnique({
      where: { id: req.params.id },
    });
    if (!s) fail("Event not found.", 404);
    if (s!.organizationId) await access(req, s!.organizationId);
    else requirePlatformAdmin(req);
    await db.securityEvent.update({
      where: { id: s!.id },
      data: { reviewed: true },
    });
    await logAudit(
      req.user.id,
      "SECURITY_EVENT_REVIEWED",
      s!.organizationId || undefined,
    );
    res.json({ ok: true });
  }),
);
app.get(
  "/api/platform/users",
  route(async (req, res) => {
    requirePlatformAdmin(req);
    res.json(
      await db.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          suspended: true,
          emailVerified: true,
        },
        take: 200,
      }),
    );
  }),
);
app.get(
  "/api/platform/configuration",
  route(async (req, res) => {
    requirePlatformAdmin(req);
    res.json({
      identityProviderConfigured: !!process.env.IDENTITY_PROVIDER_URL,
      emailConfigured: !!process.env.SMTP_URL,
      botProtectionConfigured: !!process.env.TURNSTILE_SECRET,
      objectStorage: "SUPABASE_PRIVATE_ENCRYPTED",
      documentRetentionDays: Number(process.env.DOCUMENT_RETENTION_DAYS || 30),
      governmentDeploymentAuthorized: false,
      plans: ["FREE", "PRO", "BUSINESS", "ENTERPRISE"],
    });
  }),
);
app.patch(
  "/api/platform/organizations/:id",
  route(async (req, res) => {
    const admin = requirePlatformAdmin(req, true),
      organizationId = z.string().uuid().parse(req.params.id);
    const input = z
      .object({
        suspended: z.boolean().optional(),
        verified: z.boolean().optional(),
        plan: z.enum(["FREE", "PRO", "BUSINESS", "ENTERPRISE"]).optional(),
      })
      .parse(req.body);
    await db.organization.update({
      where: { id: organizationId },
      data: input,
    });
    await logAudit(admin.id, "PLATFORM_ORGANIZATION_UPDATED", organizationId);
    res.json({ ok: true });
  }),
);
app.get(
  "/api/elections/:id/analytics",
  route(async (req, res) => {
    const e = await getElection(req.params.id);
    await access(req, e.organizationId);
    const records = await db.voterEligibility.findMany({
        where: { electionId: e.id },
        include: {
          user: {
            include: {
              memberships: { where: { organizationId: e.organizationId } },
            },
          },
        },
      }),
      eligible =
        e.eligibleAtOpen ??
        records.filter(
          (r) => !eligibilityReason(e, r.user, r, r.user.memberships[0]),
        ).length;
    const p = await db.voteStatus.findMany({
        where: { position: { electionId: e.id } },
        select: { userId: true, count: true },
      }),
      voters = new Set(p.map((v) => v.userId)).size;
    const geography: Record<string, number> = {};
    for (const r of records)
      if (r.geography)
        geography[r.geography] = (geography[r.geography] || 0) + 1;
    res.json({
      registered: e.registeredAtOpen ?? records.length,
      eligible,
      verified: records.filter((r) => r.status === "VERIFIED").length,
      voters,
      turnout: eligible ? (voters / eligible) * 100 : 0,
      ballots: p.reduce((a, v) => a + v.count, 0),
      hours: await db.electionActivity.findMany({
        where: { electionId: e.id },
        orderBy: { hour: "asc" },
      }),
      geography: Object.fromEntries(
        Object.entries(geography).filter(([, n]) => n >= 10),
      ),
    });
  }),
);
app.patch(
  "/api/platform/users/:id",
  route(async (req, res) => {
    const u = requirePlatformAdmin(req, true),
      targetId = z.string().uuid().parse(req.params.id);
    if (u.id === targetId) fail("You cannot change your own platform access.");
    const input = z
      .object({
        suspended: z.boolean().optional(),
        role: z.enum(["VOTER", "CANDIDATE", "SUPER_ADMIN"]).optional(),
      })
      .parse(req.body);
    if (input.role === "SUPER_ADMIN") {
      const { data, error } = await supabaseAdmin().auth.admin.mfa.listFactors({
        userId: targetId,
      });
      if (error) fail("Unable to verify the target account's security.", 503);
      if (!data?.factors.some((factor) => factor.status === "verified"))
        fail(
          "This user must enable an authenticator before receiving platform access.",
        );
    }
    await serializable(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId } });
      if (!target) fail("User not found.", 404);
      if (
        target?.role === "SUPER_ADMIN" &&
        (input.suspended || (input.role && input.role !== "SUPER_ADMIN")) &&
        (await tx.user.count({
          where: { role: "SUPER_ADMIN", suspended: false },
        })) <= 1
      )
        fail("Keep an active platform administrator.");
      await tx.user.update({ where: { id: targetId }, data: input });
      if (input.suspended)
        await tx.session.deleteMany({ where: { userId: targetId } });
      await audit(
        u.id,
        "PLATFORM_USER_UPDATED",
        undefined,
        undefined,
        "SUCCESS",
        tx,
      );
    });
    res.json({ ok: true });
  }),
);
app.get(
  "/api/notifications",
  route(async (req, res) =>
    res.json(
      await db.notification.findMany({
        where: { userId: requireUser(req).id },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ),
  ),
);
app.post(
  "/api/notifications/:id/read",
  route(async (req, res) => {
    await db.notification.updateMany({
      where: { id: req.params.id, userId: requireUser(req).id },
      data: { read: true },
    });
    res.json({ ok: true });
  }),
);
app.get(
  "/api/account/export",
  route(async (req, res) => {
    const u = requireUser(req);
    const user = safeUser(u),
      memberships = await db.organizationMember.findMany({
        where: { userId: u.id },
      }),
      eligibility = await db.voterEligibility.findMany({
        where: { userId: u.id },
      }),
      receipts = await db.voteStatus.findMany({ where: { userId: u.id } }),
      notifications = await db.notification.findMany({
        where: { userId: u.id },
      });
    res
      .set("Content-Disposition", 'attachment; filename="evote-account.json"')
      .json({ user, memberships, eligibility, receipts, notifications });
  }),
);
app.patch(
  "/api/account",
  route(async (req, res) => {
    const u = requireUser(req),
      data = z
        .object({
          name: z.string().trim().min(2).max(100).optional(),
          emailNotifications: z.boolean().optional(),
        })
        .parse(req.body);
    res.json(safeUser(await db.user.update({ where: { id: u.id }, data })));
  }),
);
app.delete(
  "/api/account",
  route(async (req, res) => {
    const u = requireUser(req);
    z.object({ confirmation: z.literal("DELETE MY ACCOUNT") }).parse(req.body);
    if (req.session.reauthenticatedAt < new Date(Date.now() - 10 * 60000))
      fail("Sign in again before deleting your account.", 403);
    supabaseAdmin();
    const docs = await db.document.findMany({
      where: { request: { userId: u.id } },
    });
    await serializable(async (tx) => {
      const admins = await tx.organizationMember.findMany({
        where: { userId: u.id, role: "ADMIN", active: true },
      });
      for (const m of admins)
        if (
          (await tx.organizationMember.count({
            where: {
              organizationId: m.organizationId,
              role: "ADMIN",
              active: true,
            },
          })) <= 1
        )
          fail(
            "Transfer organization administration before deleting your account.",
          );
      if (
        u.role === "SUPER_ADMIN" &&
        (await tx.user.count({
          where: { role: "SUPER_ADMIN", suspended: false },
        })) <= 1
      )
        fail("Transfer platform administration before deleting your account.");
      // Preserve pseudonymous participation constraints and anonymous ballots; remove profile and documents.
      await tx.session.deleteMany({ where: { userId: u.id } });
      await tx.organizationMember.deleteMany({ where: { userId: u.id } });
      await tx.verificationRequest.deleteMany({ where: { userId: u.id } });
      await tx.notification.deleteMany({ where: { userId: u.id } });
      await tx.voterEligibility.deleteMany({ where: { userId: u.id } });
      await tx.candidate.updateMany({
        where: { userId: u.id },
        data: { userId: null },
      });
      await tx.user.update({
        where: { id: u.id },
        data: {
          name: "Deleted account",
          email: `deleted-${u.id}@invalid.local`,
          dob: null,
          verifiedDob: null,
          suspended: true,
          emailVerified: false,
          role: "VOTER",
          consentAt: null,
        },
      });
      await tx.deletionJob.create({
        data: {
          id: u.id,
          encryptedObjectKeys: encrypt(
            JSON.stringify(docs.map((d) => d.objectKey)),
          ),
        },
      });
      await audit(u.id, "ACCOUNT_DELETED", undefined, undefined, "SUCCESS", tx);
    });
    await processDeletionJob(
      await db.deletionJob.findUniqueOrThrow({ where: { id: u.id } }),
    );
    await req.auth.client.auth.signOut({ scope: "global" });
    clearAuthCookies(req, res);
    res.json({ ok: true, csrf: null, user: null });
  }),
);
app.get(
  "/api/search",
  route(async (req, res) => {
    const q = z.string().trim().min(2).max(100).parse(req.query.q);
    const elections = await db.election.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          {
            positions: {
              some: {
                OR: [
                  { title: { contains: q, mode: "insensitive" } },
                  {
                    candidates: {
                      some: {
                        status: "APPROVED",
                        name: { contains: q, mode: "insensitive" },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
      include: {
        organization: true,
        positions: { include: { candidates: true } },
      },
      take: 50,
    });
    const found = [];
    for (const e of elections)
      try {
        await visible(req, e);
        found.push(publicElection(e));
      } catch {}
    res.json({
      elections: found,
      organizations: await db.organization.findMany({
        where: { suspended: false, name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true, slug: true },
        take: 50,
      }),
    });
  }),
);
app.get(
  "/api/elections/:id/qr",
  route(async (req, res) => {
    const e = await getElection(req.params.id);
    await visible(req, e);
    res.type("image/png").send(
      await QRCode.toBuffer(`${origin}/elections/${e.slug}`, {
        width: 320,
        margin: 2,
      }),
    );
  }),
);
app.get(
  "/api/elections/:id/export",
  route(async (req, res) => {
    const e = await getElection(req.params.id);
    await access(req, e.organizationId);
    const type = z
        .enum(["results", "candidates", "turnout", "audit"])
        .parse(req.query.type),
      format = z.enum(["csv", "xlsx", "pdf"]).parse(req.query.format);
    let rows: Record<string, any>[] = [];
    if (type === "results") {
      if (
        !["RESULTS_PUBLISHED", "ARCHIVED"].includes(e.status) &&
        !(
          e.resultVisibility === "LIVE" &&
          ["VOTING_OPEN", "VOTING_CLOSED", "RESULTS_PENDING"].includes(e.status)
        )
      )
        fail("Results must be published before export.", 403);
      const r = await calculate(e);
      rows = r.positions.flatMap((p) =>
        p.candidates.map((c: any) => ({
          position: p.title,
          candidate: c.name,
          votes: c.votes,
          percentage: c.percentage,
          method: p.method,
        })),
      );
    }
    if (type === "candidates")
      rows = e.positions.flatMap((p) =>
        p.candidates.map((c) => ({
          position: p.title,
          name: c.name,
          status: c.status,
        })),
      );
    if (type === "turnout") {
      const records = await db.voterEligibility.findMany({
          where: { electionId: e.id },
          include: {
            user: {
              include: {
                memberships: { where: { organizationId: e.organizationId } },
              },
            },
          },
        }),
        registered = e.registeredAtOpen ?? records.length,
        eligible =
          e.eligibleAtOpen ??
          records.filter(
            (r) => !eligibilityReason(e, r.user, r, r.user.memberships[0]),
          ).length,
        p = await db.voteStatus.findMany({
          where: { position: { electionId: e.id } },
          select: { userId: true, count: true },
        });
      const voters = new Set(p.map((v) => v.userId)).size;
      rows = [
        {
          registered,
          eligible,
          voters,
          ballots: p.reduce((a, v) => a + v.count, 0),
          turnout: eligible ? (voters / eligible) * 100 : 0,
        },
      ];
    }
    if (type === "audit")
      rows = (
        await db.auditLog.findMany({
          where: { electionId: e.id, organizationId: e.organizationId },
          orderBy: { id: "asc" },
        })
      ).map((a) => ({
        timestamp: a.createdAt.toISOString(),
        actor: a.actor,
        event: a.event,
        result: a.result,
        hash: a.hash,
      }));
    await logAudit(req.user.id, "REPORT_EXPORTED", e.organizationId, e.id);
    const columns = Object.keys(rows[0] || { message: "" });
    const safe = (v: any) => {
      const s = String(v ?? "");
      return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    };
    res.set("Content-Disposition", `attachment; filename="${type}.${format}"`);
    if (format === "csv") {
      res
        .type("text/csv")
        .send(
          [columns, ...rows.map((r) => columns.map((k) => safe(r[k])))]
            .map((row) =>
              row
                .map((v) => '"' + String(v).replaceAll('"', '""') + '"')
                .join(","),
            )
            .join("\r\n"),
        );
      return;
    }
    if (format === "xlsx") {
      const book = new ExcelJS.Workbook(),
        sheet = book.addWorksheet(type);
      sheet.columns = columns.map((k) => ({ header: k, key: k, width: 24 }));
      rows.forEach((row) =>
        sheet.addRow(Object.fromEntries(columns.map((k) => [k, safe(row[k])]))),
      );
      sheet.getRow(1).font = { bold: true };
      res
        .type(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .send(Buffer.from(await book.xlsx.writeBuffer()));
      return;
    }
    const pdf = new PDFDocument({ margin: 40 });
    res.type("application/pdf");
    pdf.pipe(res);
    pdf.fontSize(18).text(`${e.name} — ${type}`);
    pdf.moveDown();
    for (const row of rows) {
      pdf.fontSize(10).text(columns.map((k) => `${k}: ${row[k]}`).join("\n"));
      pdf.moveDown();
    }
    pdf.end();
  }),
);
mountBilling(app, access);
mountExtensions(app, {
  route,
  fail,
  access,
  visible,
  getElection,
  upload,
  bot,
  authLimit,
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
if (production && process.env.VERCEL !== "1") {
  const root = path.resolve("dist");
  app.use(express.static(root));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(root, "index.html")),
  );
}
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const voterCapacity = /EVOTE_VOTER_LIMIT/.test(
    String(err.meta?.message || err.message || ""),
  );
  const status = voterCapacity
    ? 409
    : err instanceof z.ZodError
      ? 400
      : err.code === "P2002"
        ? 409
        : err.code === "LIMIT_FILE_SIZE"
          ? 413
          : err.status || 500;
  if (status === 500) console.error("Request failed:", err.code || err.name);
  if (
    [400, 403].includes(status) &&
    !configurationIssues().length &&
    !req.path.startsWith("/api/auth/")
  ) {
    const actor = (req as any).user?.id,
      subject = digest(actor || req.ip || ""),
      bucket = Math.floor(Date.now() / 600000);
    db.rateBucket
      .upsert({
        where: { id: `probe:${subject}:${bucket}` },
        create: {
          id: `probe:${subject}:${bucket}`,
          resetAt: new Date((bucket + 1) * 600000),
        },
        update: { attempts: { increment: 1 } },
      })
      .then((row) =>
        row.attempts === 5
          ? db.securityEvent.create({
              data: {
                actor,
                organizationId: (req as any).securityOrganizationId,
                type: "ENDPOINT_VALIDATION_PATTERN",
                metadata: {
                  reviewOnly: true,
                  ipHash: digest(req.ip || ""),
                  scope: req.path.split("/")[2] || "api",
                },
              },
            })
          : undefined,
      )
      .catch(() => {});
  }
  res.status(status).json({
    error: voterCapacity
      ? "This election has reached its registration limit. Please contact the coordinator about upgrading the organization’s plan."
      : err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : status === 500
          ? "Service unavailable. Please try again."
          : err.code === "P2002"
            ? "This record already exists."
            : err.code === "LIMIT_FILE_SIZE"
              ? "File exceeds 5 MB."
              : err.message,
  });
});
export { app };
// Vercel invokes the exported app; listeners and recurring work belong to a persistent host.
if (process.env.NODE_ENV !== "test" && process.env.VERCEL !== "1") {
  const port = Number(process.env.PORT || 3001);
  app.listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`E-Vote API listening on ${port}`),
  );
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      if (!configurationIssues().length)
        await runMaintenance(Date.now() + 90000);
    } catch (e: any) {
      console.error("Maintenance failed:", e.code || e.name);
    } finally {
      running = false;
    }
  }, 30000);
  timer.unref();
}
