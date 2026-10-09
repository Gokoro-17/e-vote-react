import type { Express } from "express";
import { z } from "zod";
import {
  db,
  audit,
  logAudit,
  notify,
  token,
  serializable,
} from "./platform.js";
import { requirePlatformAdmin, requireUser } from "./auth.js";
import { supabaseAdmin } from "./supabase.js";
import sharp from "sharp";

export function mountExtensions(app: Express, c: any) {
  const { route, access, visible, getElection, upload, bot, authLimit } = c;
  function fail(message: string, status = 400): never {
    throw Object.assign(new Error(message), { status });
  }
  for (const kind of ["voters", "verification"] as const) {
    app.get(
      `/api/elections/:id/${kind}`,
      route(async (req: any, res: any) => {
        const e = await getElection(req.params.id);
        await access(req, e.organizationId);
        const page = z.coerce
          .number()
          .int()
          .min(1)
          .max(100000)
          .default(1)
          .parse(req.query.page);
        const q = z.string().max(100).default("").parse(req.query.q);
        const user = q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {};
        const where = { electionId: e.id, user };
        const take = 30,
          skip = (page - 1) * take;
        const [items, total] =
          kind === "voters"
            ? await Promise.all([
                db.voterEligibility.findMany({
                  where,
                  include: {
                    user: { select: { name: true, email: true } },
                    group: { select: { name: true } },
                  },
                  orderBy: { userId: "asc" },
                  take,
                  skip,
                }),
                db.voterEligibility.count({ where }),
              ])
            : await Promise.all([
                db.verificationRequest.findMany({
                  where,
                  include: {
                    user: { select: { name: true, email: true } },
                    document: { select: { id: true, expiresAt: true } },
                  },
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  take,
                  skip,
                }),
                db.verificationRequest.count({ where }),
              ]);
        res.json({
          items,
          total,
          page,
          pages: Math.max(1, Math.ceil(total / take)),
        });
      }),
    );
  }
  app.get(
    "/api/account/memberships",
    route(async (req: any, res: any) =>
      res.json(
        await db.organizationMember.findMany({
          where: { userId: requireUser(req).id, active: true },
          include: { organization: true },
        }),
      ),
    ),
  );
  app.get(
    "/api/account/membership-requests",
    route(async (req: any, res: any) =>
      res.json(
        await db.organizationJoinRequest.findMany({
          where: { userId: requireUser(req).id },
          select: {
            organizationId: true,
            status: true,
            message: true,
            createdAt: true,
            organization: {
              select: { name: true, slug: true, color: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      ),
    ),
  );
  app.get(
    "/api/account/receipts",
    route(async (req: any, res: any) =>
      res.json(
        await db.voteReceipt.findMany({
          where: { userId: requireUser(req).id },
          select: {
            id: true,
            recordedAt: true,
            position: {
              select: {
                title: true,
                election: { select: { name: true, slug: true } },
              },
            },
          },
          orderBy: { recordedAt: "desc" },
          take: 200,
        }),
      ),
    ),
  );
  app.post(
    "/api/organizations/:id/join",
    route(async (req: any, res: any) => {
      const u = requireUser(req),
        input = z
          .object({ message: z.string().max(1000).default("") })
          .parse(req.body);
      const org = await db.organization.findFirst({
        where: { id: req.params.id, suspended: false },
      });
      if (!org) fail("Organization not found.", 404);
      const member = await db.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId: org.id, userId: u.id },
        },
      });
      if (member?.active) fail("You are already a member.");
      const previous = await db.organizationJoinRequest.findUnique({
        where: {
          organizationId_userId: { organizationId: org.id, userId: u.id },
        },
      });
      if (previous?.status === "PENDING")
        fail("Your membership request is already waiting for review.");
      await db.organizationJoinRequest.upsert({
        where: {
          organizationId_userId: { organizationId: org.id, userId: u.id },
        },
        create: {
          organizationId: org.id,
          userId: u.id,
          message: input.message,
        },
        update: { status: "PENDING", message: input.message },
      });
      const admins = await db.organizationMember.findMany({
        where: { organizationId: org.id, role: "ADMIN", active: true },
      });
      for (const admin of admins)
        await notify(
          admin.userId,
          "Membership request",
          `${u.name} requested to join ${org.name}.`,
        );
      await logAudit(u.id, "MEMBERSHIP_REQUESTED", org.id);
      res.json({
        message: "Your membership request has been sent for review.",
      });
    }),
  );
  app.get(
    "/api/organizations/:id/join-requests",
    route(async (req: any, res: any) => {
      await access(req, req.params.id, ["ADMIN"]);
      res.json(
        await db.organizationJoinRequest.findMany({
          where: { organizationId: req.params.id },
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
      );
    }),
  );
  app.post(
    "/api/organizations/:id/join-requests/:userId",
    route(async (req: any, res: any) => {
      await access(req, req.params.id, ["ADMIN"]);
      const input = z
        .object({ status: z.enum(["APPROVED", "REJECTED"]) })
        .parse(req.body);
      await serializable(async (tx) => {
        const organization = await tx.organization.findUnique({
          where: { id: req.params.id },
          select: { name: true },
        });
        if (!organization) fail("Organization not found.", 404);
        const changed = await tx.organizationJoinRequest.updateMany({
          where: {
            organizationId: req.params.id,
            userId: req.params.userId,
            status: "PENDING",
          },
          data: input,
        });
        if (!changed.count) fail("This request has already been reviewed.");
        if (input.status === "APPROVED")
          await tx.organizationMember.upsert({
            where: {
              organizationId_userId: {
                organizationId: req.params.id,
                userId: req.params.userId,
              },
            },
            create: {
              organizationId: req.params.id,
              userId: req.params.userId,
              role: "VOTER",
            },
            update: { active: true, role: "VOTER" },
          });
        await audit(
          req.user.id,
          "MEMBERSHIP_" + input.status,
          req.params.id,
          undefined,
          "SUCCESS",
          tx,
        );
        await notify(
          req.params.userId,
          input.status === "APPROVED"
            ? "Membership approved"
            : "Membership request declined",
          input.status === "APPROVED"
            ? `You are now a member of ${organization.name}.`
            : `Your request to join ${organization.name} was declined. You can contact the organization for more information.`,
          tx,
        );
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/organizations/:id/groups",
    route(async (req: any, res: any) => {
      await access(req, req.params.id);
      res.json(
        await db.organizationGroup.findMany({
          where: { organizationId: req.params.id },
          orderBy: { name: "asc" },
        }),
      );
    }),
  );
  app.post(
    "/api/organizations/:id/groups",
    route(async (req: any, res: any) => {
      await access(req, req.params.id, ["ADMIN"]);
      const input = z
        .object({ name: z.string().trim().min(2).max(100) })
        .parse(req.body);
      const group = await db.organizationGroup.create({
        data: { organizationId: req.params.id, ...input },
      });
      await logAudit(req.user.id, "GROUP_CREATED", req.params.id);
      res.status(201).json(group);
    }),
  );
  app.patch(
    "/api/positions/:id",
    route(async (req: any, res: any) => {
      const p = await db.electionPosition.findUnique({
        where: { id: req.params.id },
        include: { election: true },
      });
      if (!p) fail("Position not found.", 404);
      await access(req, p!.election.organizationId, ["ADMIN"]);
      const input = z
        .object({
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
        })
        .parse(req.body);
      if (
        p!.election.mode === "ELECTION_DEMO" &&
        (input.maxVotes !== 1 || input.method === "WEIGHTED")
      )
        fail(
          "Formal demonstrations require one participation and equal voting weight.",
        );
      await serializable(async (tx) => {
        const e = await tx.election.findUnique({
          where: { id: p!.electionId },
        });
        if (e?.status !== "DRAFT")
          fail("Position settings are locked after draft.");
        await tx.electionPosition.update({ where: { id: p!.id }, data: input });
        await audit(
          req.user.id,
          "POSITION_UPDATED",
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
    "/api/positions/:id",
    route(async (req: any, res: any) => {
      const p = await db.electionPosition.findUnique({
        where: { id: req.params.id },
        include: { election: true },
      });
      if (!p) fail("Position not found.", 404);
      await access(req, p!.election.organizationId, ["ADMIN"]);
      await serializable(async (tx) => {
        const e = await tx.election.findUnique({
          where: { id: p!.electionId },
        });
        if (e?.status !== "DRAFT")
          fail("Positions can only be removed in draft.");
        await tx.candidate.deleteMany({ where: { positionId: p!.id } });
        await tx.electionPosition.delete({ where: { id: p!.id } });
        await audit(
          req.user.id,
          "POSITION_DELETED",
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
    "/api/candidates/:id",
    route(async (req: any, res: any) => {
      const candidate = await db.candidate.findUnique({
        where: { id: req.params.id },
        include: {
          position: {
            include: { election: { include: { organization: true } } },
          },
        },
      });
      if (!candidate) fail("Candidate not found.", 404);
      await visible(req, candidate!.position.election);
      if (
        candidate!.status !== "APPROVED" &&
        candidate!.userId !== req.user?.id
      )
        await access(req, candidate!.position.election.organizationId);
      const { userId, position, ...profile } = candidate!;
      const { eventPasswordHash, ...election } = position.election;
      res.json({
        ...profile,
        position: { id: position.id, title: position.title },
        election,
      });
    }),
  );
  app.post(
    "/api/assets",
    upload.single("image"),
    route(async (req: any, res: any) => {
      const u = requireUser(req),
        input = z
          .object({
            type: z.enum(["LOGO", "BANNER", "CANDIDATE"]),
            organizationId: z.string().uuid().optional(),
            electionId: z.string().uuid().optional(),
            candidateId: z.string().uuid().optional(),
          })
          .parse(req.body);
      let candidateSelfUpload = false;
      if (input.type === "LOGO") {
        if (!input.organizationId) fail("Organization is required.");
        await access(req, input.organizationId, ["ADMIN"]);
      } else {
        let election: any;
        if (input.type === "CANDIDATE") {
          const candidate = await db.candidate.findUnique({
            where: { id: input.candidateId },
            include: { position: true },
          });
          if (!candidate) fail("Candidate is required.");
          election = await getElection(candidate!.position.electionId);
          try {
            await access(req, election.organizationId, ["ADMIN"]);
          } catch (error) {
            if (candidate!.userId !== u.id) throw error;
            candidateSelfUpload = true;
          }
        } else {
          if (!input.electionId) fail("Election is required.");
          election = await getElection(input.electionId);
          await access(req, election.organizationId, ["ADMIN"]);
        }
        if (
          !["DRAFT", "REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(
            election.status,
          ) ||
          (input.type === "BANNER" && election.status !== "DRAFT")
        )
          fail("Campaign and election images are locked at this stage.");
      }
      const file = req.file;
      if (!file) fail("Select a JPEG or PNG image, up to 5 MB.");
      const b = file.buffer,
        mime = b
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "image/png"
          : b[0] === 255 && b[1] === 216 && b[2] === 255
            ? "image/jpeg"
            : null;
      if (!mime || mime !== file.mimetype)
        fail("Upload a valid JPEG or PNG image.");
      let normalized: Buffer;
      try {
        normalized = await sharp(b, {
          limitInputPixels: 24000000,
          failOn: "warning",
        })
          .rotate()
          .resize({
            width: 2400,
            height: 2400,
            fit: "inside",
            withoutEnlargement: true,
          })
          .toFormat(mime === "image/png" ? "png" : "jpeg")
          .toBuffer();
      } catch {
        fail(
          "This image could not be decoded safely. Use a JPEG or PNG up to 24 megapixels.",
        );
      }
      if (normalized.length > 5 * 1024 * 1024)
        fail("The processed image exceeds 5 MB. Choose a smaller image.");
      const key = `${u.id}/${token()}.${mime === "image/png" ? "png" : "jpg"}`,
        storage = supabaseAdmin().storage.from("campaign-images");
      const { error } = await storage.upload(key, normalized, {
        contentType: mime,
        cacheControl: "3600",
        upsert: false,
      });
      if (error)
        fail("Image upload failed. Check the storage configuration.", 503);
      const { data } = storage.getPublicUrl(key);
      try {
        if (input.type === "LOGO")
          await db.organization.update({
            where: { id: input.organizationId },
            data: { logo: data.publicUrl },
          });
        else if (input.type === "BANNER")
          await serializable(async (tx) => {
            const e = await tx.election.findUnique({
              where: { id: input.electionId },
            });
            if (e?.status !== "DRAFT") fail("Election settings are locked.");
            await tx.election.update({
              where: { id: input.electionId },
              data: { banner: data.publicUrl },
            });
          });
        else
          await serializable(async (tx) => {
            const candidate = await tx.candidate.findUnique({
              where: { id: input.candidateId },
              include: { position: { include: { election: true } } },
            });
            if (
              !candidate ||
              !["DRAFT", "REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(
                candidate.position.election.status,
              )
            )
              fail("Candidate profile is locked.");
            await tx.candidate.update({
              where: { id: input.candidateId },
              data: {
                photo: data.publicUrl,
                ...(candidateSelfUpload ? { status: "PENDING" } : {}),
              },
            });
          });
      } catch (error) {
        await storage.remove([key]);
        throw error;
      }
      await logAudit(
        u.id,
        "PUBLIC_IMAGE_UPLOADED",
        input.organizationId,
        input.electionId,
      );
      res.json({ url: data.publicUrl });
    }),
  );
  app.get(
    "/api/platform/settings",
    route(async (req: any, res: any) => {
      requirePlatformAdmin(req);
      res.json(
        (await db.platformSettings.findUnique({
          where: { id: "platform" },
        })) || {
          documentRetentionDays: 30,
          contactEmail: "",
          welcomeMessage: "",
        },
      );
    }),
  );
  app.patch(
    "/api/platform/settings",
    route(async (req: any, res: any) => {
      requirePlatformAdmin(req, true);
      const input = z
        .object({
          documentRetentionDays: z.number().int().min(1).max(90),
          contactEmail: z.string().email().or(z.literal("")),
          welcomeMessage: z.string().max(500),
        })
        .parse(req.body);
      await db.platformSettings.upsert({
        where: { id: "platform" },
        create: input,
        update: input,
      });
      await logAudit(req.user.id, "PLATFORM_SETTINGS_UPDATED");
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/contact",
    authLimit,
    route(async (req: any, res: any) => {
      await bot(req);
      const input = z
        .object({
          name: z.string().trim().min(2).max(100),
          email: z.string().email().max(254),
          message: z.string().trim().min(20).max(3000),
          consent: z.literal(true),
        })
        .parse(req.body);
      const admins = await db.user.findMany({
        where: { role: "SUPER_ADMIN", suspended: false },
      });
      if (!admins.length)
        fail(
          "Contact support is not available yet. Please contact your organization administrator.",
          503,
        );
      for (const admin of admins)
        await notify(
          admin.id,
          "Contact request",
          `${input.name} (${input.email}): ${input.message}`,
        );
      res.json({ message: "Your message has been sent to the platform team." });
    }),
  );
}
