import type { Express, Response, NextFunction } from "express";
import { z } from "zod";
import { db, digest, token, encrypt, decrypt, logAudit } from "./platform.js";
import {
  supabaseForRequest,
  supabaseAdmin,
  configurationIssues,
  appOrigin,
  authAvailability,
  clearAuthCookies,
} from "./supabase.js";

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
function checkMailError(error: { status?: number; code?: string } | null) {
  if (!error) return;
  if (error.status === 429)
    fail("Please wait before requesting another email.", 429);
  // Preserve the same response for unknown and already-confirmed accounts.
  if (["user_not_found", "email_not_confirmed"].includes(error.code || ""))
    return;
  fail("We couldn't send the email right now. Please try again shortly.", 503);
}
const route =
  (fn: (req: any, res: Response, next: NextFunction) => Promise<any>) =>
  (req: any, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const password = z.string().min(12, "Use at least 12 characters.").max(128);
export const safeUser = (u: any) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  emailVerified: u.emailVerified,
  role: u.role,
  verifiedDob: Boolean(u.verifiedDob),
  consentAt: u.consentAt,
  emailNotifications: u.emailNotifications,
});

async function providerSession(req: any, res: Response) {
  const client = (req.supabase ??= supabaseForRequest(req, res));
  // getUser validates with Supabase Auth; getSession is only used after validation to obtain the same token's session ID.
  const { data: identity, error } = await client.auth.getUser();
  if (error || !identity.user || !identity.user.email_confirmed_at) return null;
  const { data } = await client.auth.getSession();
  if (!data.session) return null;
  let claims: any;
  try {
    claims = JSON.parse(
      Buffer.from(
        data.session.access_token.split(".")[1],
        "base64url",
      ).toString(),
    );
  } catch {
    return null;
  }
  if (claims.sub !== identity.user.id || !claims.session_id) return null;
  // A revoked session must not remain valid until its JWT expires. Roles never come from user_metadata.
  const active = await db.$queryRaw<
    any[]
  >`SELECT id FROM evote."AuthSessionCheck" WHERE id = ${claims.session_id}::uuid AND user_id = ${identity.user.id}::uuid`;
  if (!active.length) return null;
  return {
    client,
    identity: identity.user,
    sessionId: claims.session_id as string,
    aal: claims.aal || "aal1",
  };
}
async function profile(identity: any) {
  const pending = await db.authRegistration.findUnique({
    where: { id: identity.id },
  });
  const existing = await db.user.findUnique({ where: { id: identity.id } });
  if (existing?.suspended)
    fail("This account is unavailable. Contact your administrator.", 403);
  const u = await db.user.upsert({
    where: { id: identity.id },
    update: { email: identity.email.toLowerCase(), emailVerified: true },
    create: {
      id: identity.id,
      email: identity.email.toLowerCase(),
      emailVerified: true,
      name:
        pending?.name ||
        String(
          identity.user_metadata?.full_name ||
            identity.user_metadata?.name ||
            "Your account",
        ).slice(0, 100),
      dob: pending?.dob,
      consentAt: pending?.consentAt || null,
    },
  });
  if (pending) await db.authRegistration.delete({ where: { id: pending.id } });
  return u;
}
async function establish(req: any, res: Response) {
  const auth = await providerSession(req, res);
  if (!auth) fail("Confirm your email before signing in.", 401);
  const user = await profile(auth.identity),
    id = digest(auth.sessionId);
  const session = await db.session.upsert({
    where: { id },
    create: {
      id,
      userId: user.id,
      csrf: token(),
      expiresAt: new Date(Date.now() + 8 * 3600000),
      reauthenticatedAt: new Date(),
    },
    update: {
      csrf: token(),
      expiresAt: new Date(Date.now() + 8 * 3600000),
      reauthenticatedAt: new Date(),
    },
  });
  await logAudit(user.id, "LOGIN");
  req.user = user;
  req.session = session;
  req.auth = auth;
  const factors = await auth.client.auth.mfa.listFactors();
  const needsMfa = Boolean(
    factors.data?.totp?.some((f: any) => f.status === "verified") &&
    auth.aal !== "aal2",
  );
  return { user: safeUser(user), csrf: session.csrf, needsMfa };
}
export async function authenticate(req: any, res: Response) {
  if (
    configurationIssues().length ||
    !Object.keys(req.cookies || {}).some((name) =>
      name.startsWith("evote-auth"),
    )
  )
    return;
  const auth = await providerSession(req, res);
  if (!auth) return;
  const session = await db.session.findUnique({
    where: { id: digest(auth.sessionId) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || session.user.suspended)
    return;
  req.auth = auth;
  req.session = session;
  req.user = session.user;
  const factors = await auth.client.auth.mfa.listFactors();
  if (factors.error) fail("Unable to verify account security. Try again.", 503);
  req.needsMfa = Boolean(
    factors.data?.totp?.some((f: any) => f.status === "verified") &&
    auth.aal !== "aal2",
  );
}
export function requireUser(req: any, allowIncomplete = false) {
  if (!req.user) fail("Sign in to continue.", 401);
  if (!allowIncomplete && !req.user.consentAt)
    fail("Accept the privacy policy to finish creating your account.", 403);
  if (!allowIncomplete && req.needsMfa)
    fail("Verify your authenticator code to continue.", 403);
  return req.user;
}
export function mountAuth(
  app: Express,
  authLimit: any,
  bot: (req: any) => Promise<void>,
) {
  app.get(
    "/api/auth/session",
    route(async (req, res) =>
      res.json({
        user: req.user ? safeUser(req.user) : null,
        csrf: req.session?.csrf || null,
        needsMfa: Boolean(req.needsMfa),
        configured: configurationIssues().length === 0,
      }),
    ),
  );
  app.post(
    "/api/auth/register",
    authLimit,
    route(async (req, res) => {
      await bot(req);
      const input = z
        .object({
          email,
          password,
          name: z.string().trim().min(2).max(100),
          dob: z.string().date().optional(),
          consent: z.literal(true),
        })
        .parse(req.body);
      if (input.dob && new Date(input.dob) > new Date())
        fail("Date of birth cannot be in the future.");
      const client = (req.supabase ??= supabaseForRequest(req, res));
      const { data, error } = await client.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          emailRedirectTo: `${appOrigin}/api/auth/callback`,
          data: { full_name: input.name },
        },
      });
      if (error) {
        if (!error.status || error.status >= 500 || error.status === 429)
          checkMailError(error);
        fail(
          error.code === "over_email_send_rate_limit"
            ? "Please wait before requesting another confirmation email."
            : "Unable to create this account. Try signing in or resetting your password.",
          400,
        );
      }
      if (data.session) {
        await client.auth.signOut();
        fail(
          "Email confirmation must be enabled in Supabase Auth before registration can continue.",
          503,
        );
      }
      if (data.user && data.user.identities?.length) {
        await db.authRegistration.upsert({
          where: { id: data.user.id },
          create: {
            id: data.user.id,
            name: input.name,
            dob: input.dob ? new Date(input.dob) : null,
            consentAt: new Date(),
          },
          update: { name: input.name, consentAt: new Date() },
        });
        const ipHash = digest(req.ip || "");
        await db.securityEvent.create({
          data: {
            actor: data.user.id,
            type: "ACCOUNT_REGISTRATION",
            metadata: { ipHash },
          },
        });
        const count = await db.securityEvent.count({
          where: {
            type: "ACCOUNT_REGISTRATION",
            createdAt: { gte: new Date(Date.now() - 3600000) },
            metadata: { path: ["ipHash"], equals: ipHash },
          },
        });
        if (count === 5)
          await db.securityEvent.create({
            data: {
              type: "MULTIPLE_ACCOUNT_PATTERN",
              metadata: { ipHash, registrations: count, reviewOnly: true },
            },
          });
      }
      res.status(201).json({
        message:
          "Check your inbox and confirm your email to finish creating your account.",
      });
    }),
  );
  app.post(
    "/api/auth/login",
    authLimit,
    route(async (req, res) => {
      await bot(req);
      const input = z
        .object({ email, password: z.string().min(1).max(128) })
        .parse(req.body);
      const failures = await db.securityEvent.count({
        where: {
          type: "LOGIN_FAILURE",
          createdAt: { gte: new Date(Date.now() - 15 * 60000) },
          metadata: { path: ["emailHash"], equals: digest(input.email) },
        },
      });
      if (failures >= 8)
        fail("Too many sign-in attempts. Try again in 15 minutes.", 429);
      const client = (req.supabase ??= supabaseForRequest(req, res));
      const { error } = await client.auth.signInWithPassword(input);
      if (error) {
        if (error.status === 429)
          fail("Too many sign-in attempts. Please try again shortly.", 429);
        if (!error.status || error.status >= 500)
          fail(
            "Sign-in is temporarily unavailable. Please try again shortly.",
            503,
          );
        await db.securityEvent.create({
          data: {
            type:
              error.code === "email_not_confirmed"
                ? "LOGIN_UNCONFIRMED"
                : "LOGIN_FAILURE",
            metadata: {
              emailHash: digest(input.email),
              ipHash: digest(req.ip || ""),
            },
          },
        });
        fail(
          error.code === "email_not_confirmed"
            ? "Confirm your email before signing in."
            : "Email or password is incorrect.",
          401,
        );
      }
      res.json(await establish(req, res));
    }),
  );
  app.post(
    "/api/auth/google",
    authLimit,
    route(async (req, res) => {
      await bot(req);
      if (!(await authAvailability()).googleEnabled)
        fail(
          "Google sign-in has not been enabled by the platform administrator yet.",
          503,
        );
      const client = (req.supabase ??= supabaseForRequest(req, res));
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${appOrigin}/api/auth/callback`,
          skipBrowserRedirect: true,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error || !data.url)
        fail(
          "Google sign-in is unavailable. Ask the administrator to enable the Google provider in Supabase Auth.",
          503,
        );
      res.json({ url: data.url });
    }),
  );
  app.get(
    "/api/auth/callback",
    route(async (req, res) => {
      if (typeof req.query.code !== "string" || req.query.code.length > 2000)
        return res.redirect("/login?error=confirmation");
      const client = (req.supabase ??= supabaseForRequest(req, res));
      const { error } = await client.auth.exchangeCodeForSession(
        req.query.code,
      );
      if (error) return res.redirect("/verify-email?expired=1");
      const result = await establish(req, res);
      const recovery = req.cookies["evote-recovery-intent"];
      if (recovery) {
        res.clearCookie("evote-recovery-intent", { path: "/" });
        try {
          const data = JSON.parse(decrypt(recovery).toString());
          if (data.expires > Date.now() && data.email === result.user.email) {
            res.cookie(
              "evote-recovery",
              encrypt(
                JSON.stringify({
                  userId: result.user.id,
                  session: req.session.id,
                  expires: Date.now() + 15 * 60000,
                }),
              ),
              {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                path: "/",
                maxAge: 15 * 60000,
              },
            );
            return res.redirect("/reset-password");
          }
        } catch {}
      }
      res.redirect(
        result.needsMfa
          ? "/two-factor"
          : result.user.consentAt
            ? "/dashboard"
            : "/onboarding",
      );
    }),
  );
  app.post(
    "/api/auth/verify-email",
    authLimit,
    route(async (req, res) => {
      const input = z
        .object({
          email,
          code: z
            .string()
            .regex(
              /^\d{6,10}$/,
              "Enter the code from your confirmation email.",
            ),
        })
        .parse(req.body);
      const client = (req.supabase ??= supabaseForRequest(req, res));
      const { error } = await client.auth.verifyOtp({
        email: input.email,
        token: input.code,
        type: "email",
      });
      if (error)
        fail(
          "This confirmation code is invalid or expired. Request a new email.",
        );
      res.json(await establish(req, res));
    }),
  );
  app.post(
    "/api/auth/resend-verification",
    authLimit,
    route(async (req, res) => {
      await bot(req);
      const input = z.object({ email }).parse(req.body);
      const client = (req.supabase ??= supabaseForRequest(req, res));
      const { error } = await client.auth.resend({
        type: "signup",
        email: input.email,
        options: { emailRedirectTo: `${appOrigin}/api/auth/callback` },
      });
      checkMailError(error);
      res.json({
        message: "If confirmation is needed, a new email will arrive shortly.",
      });
    }),
  );
  app.post(
    "/api/auth/forgot-password",
    authLimit,
    route(async (req, res) => {
      await bot(req);
      const input = z.object({ email }).parse(req.body);
      const client = (req.supabase ??= supabaseForRequest(req, res));
      const { error } = await client.auth.resetPasswordForEmail(input.email, {
        redirectTo: `${appOrigin}/api/auth/callback`,
      });
      checkMailError(error);
      res.cookie(
        "evote-recovery-intent",
        encrypt(
          JSON.stringify({ email: input.email, expires: Date.now() + 3600000 }),
        ),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 3600000,
        },
      );
      res.json({
        message:
          "If this account exists, you will receive a password reset email.",
      });
    }),
  );
  app.post(
    "/api/auth/reset-password",
    authLimit,
    route(async (req, res) => {
      const u = requireUser(req, true),
        input = z.object({ password }).parse(req.body);
      let proof: any;
      try {
        proof = JSON.parse(
          decrypt(req.cookies["evote-recovery"] || "").toString(),
        );
      } catch {
        fail("Open a fresh password reset link in this browser.");
      }
      if (
        proof.userId !== u.id ||
        proof.session !== req.session.id ||
        proof.expires < Date.now()
      )
        fail("This reset link has expired. Request another one.");
      const { error } = await req.auth.client.auth.updateUser({
        password: input.password,
      });
      if (error)
        fail("Unable to update the password. Use a different strong password.");
      const { error: signOutError } = await req.auth.client.auth.signOut({
        scope: "global",
      });
      await db.session.deleteMany({ where: { userId: u.id } });
      await logAudit(u.id, "PASSWORD_RESET");
      clearAuthCookies(req, res);
      if (signOutError && ![401, 403, 404].includes(signOutError.status || 0))
        fail(
          "Your password changed and this browser is signed out. Sign in again to review other sessions in your account settings.",
          503,
        );
      res.json({
        message: "Password updated. Sign in with your new password.",
        csrf: null,
        user: null,
      });
    }),
  );
  app.post(
    "/api/auth/logout",
    route(async (req, res) => {
      const client = (req.supabase ??= supabaseForRequest(req, res));
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error && ![401, 403, 404].includes(error.status || 0))
        fail("We couldn't finish signing out. Please try again.", 503);
      if (req.session) {
        await db.session.deleteMany({ where: { id: req.session.id } });
        await logAudit(req.user.id, "LOGOUT");
      }
      clearAuthCookies(req, res);
      res.json({ ok: true, csrf: null, user: null });
    }),
  );
  app.post(
    "/api/auth/consent",
    route(async (req, res) => {
      const u = requireUser(req, true);
      z.object({
        consent: z.literal(true),
        name: z.string().trim().min(2).max(100),
      }).parse(req.body);
      const user = await db.user.update({
        where: { id: u.id },
        data: { consentAt: new Date(), name: req.body.name },
      });
      await logAudit(u.id, "PRIVACY_CONSENT_ACCEPTED");
      res.json({ user: safeUser(user), csrf: req.session.csrf });
    }),
  );
  app.get(
    "/api/auth/security",
    route(async (req, res) => {
      requireUser(req, true);
      const { data, error } = await req.auth.client.auth.mfa.listFactors();
      if (error) fail("Unable to load security settings.", 503);
      res.json({
        factors: data?.totp || [],
        aal: req.auth.aal,
        needsMfa: req.needsMfa,
        sessions: await db.session.count({
          where: { userId: req.user.id, expiresAt: { gt: new Date() } },
        }),
        phone: req.auth.identity.phone_confirmed_at
          ? req.auth.identity.phone
          : null,
        phoneEnabled: process.env.ENABLE_PHONE_VERIFICATION === "true",
      });
    }),
  );
  app.post(
    "/api/auth/mfa/enroll",
    authLimit,
    route(async (req, res) => {
      requireUser(req);
      const { data, error } = await req.auth.client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "E-Vote authenticator",
      });
      if (error)
        fail(
          "Unable to enroll an authenticator. Remove an unfinished enrollment first.",
        );
      await logAudit(req.user.id, "MFA_ENROLLMENT_STARTED");
      res.json({
        id: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
    }),
  );
  app.post(
    "/api/auth/mfa/verify",
    authLimit,
    route(async (req, res) => {
      requireUser(req, true);
      const input = z
        .object({
          factorId: z.string().uuid(),
          code: z.string().regex(/^\d{6}$/),
        })
        .parse(req.body);
      const { error } = await req.auth.client.auth.mfa.challengeAndVerify({
        factorId: input.factorId,
        code: input.code,
      });
      if (error) fail("Authenticator code is incorrect or expired.");
      await logAudit(req.user.id, "MFA_VERIFIED");
      res.json({ ok: true });
    }),
  );
  app.delete(
    "/api/auth/mfa/:id",
    authLimit,
    route(async (req, res) => {
      requireUser(req);
      const { error } = await req.auth.client.auth.mfa.unenroll({
        factorId: z.string().uuid().parse(req.params.id),
      });
      if (error) fail("Verify your authenticator before removing it.");
      await logAudit(req.user.id, "MFA_REMOVED");
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/auth/phone",
    authLimit,
    route(async (req, res) => {
      requireUser(req);
      if (process.env.ENABLE_PHONE_VERIFICATION !== "true")
        fail("Phone verification is not configured.", 503);
      const input = z
        .object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) })
        .parse(req.body);
      const { error } = await req.auth.client.auth.updateUser({
        phone: input.phone,
      });
      if (error) fail("Unable to send phone verification.");
      res.json({ message: "Verification code sent." });
    }),
  );
  app.post(
    "/api/auth/phone/verify",
    authLimit,
    route(async (req, res) => {
      requireUser(req);
      const input = z
        .object({
          phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
          code: z.string().regex(/^\d{6}$/),
        })
        .parse(req.body);
      const { error } = await req.auth.client.auth.verifyOtp({
        phone: input.phone,
        token: input.code,
        type: "phone_change",
      });
      if (error) fail("Invalid phone verification code.");
      await logAudit(req.user.id, "PHONE_VERIFIED");
      res.json({ ok: true });
    }),
  );
}
