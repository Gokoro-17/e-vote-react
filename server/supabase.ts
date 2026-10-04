import "dotenv/config";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Request, Response } from "express";

export const projectRef = "mdtymdvybaurguflwktt";
export const appOrigin = process.env.APP_ORIGIN || "http://localhost:5174";
const production = process.env.NODE_ENV === "production";
export const authConfigured = () =>
  Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_PUBLISHABLE_KEY &&
    process.env.DATABASE_URL,
  );
let providerCache:
  | { expires: number; emailConfirmation: boolean; googleEnabled: boolean }
  | undefined;
export async function authAvailability() {
  if (providerCache && providerCache.expires > Date.now()) return providerCache;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY)
    return { emailConfirmation: false, googleEnabled: false };
  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/settings`,
      {
        headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new Error("Provider unavailable");
    const settings = (await response.json()) as any;
    providerCache = {
      expires: Date.now() + 60000,
      emailConfirmation: settings.mailer_autoconfirm === false,
      googleEnabled: settings.external?.google === true,
    };
    return providerCache;
  } catch {
    return { emailConfirmation: false, googleEnabled: false };
  }
}
export function configurationIssues() {
  const issues: string[] = [];
  // Fail closed at the request boundary so health checks can report setup_required
  // instead of crashing the serverless function during module initialization.
  if (production) {
    try {
      const origin = new URL(appOrigin);
      if (
        origin.protocol !== "https:" ||
        origin.origin !== appOrigin ||
        origin.username ||
        origin.password
      )
        issues.push("APP_ORIGIN must be the exact public HTTPS origin");
    } catch {
      issues.push("APP_ORIGIN must be the exact public HTTPS origin");
    }
    for (const name of ["SMTP_URL", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET"])
      if (!process.env[name]) issues.push(name);
  }
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "DATABASE_URL",
    "DATA_ENCRYPTION_KEY",
    "BALLOT_ENCRYPTION_KEY",
  ])
    if (!process.env[name]) issues.push(name);
  const dataKey = Buffer.from(process.env.DATA_ENCRYPTION_KEY || "", "base64");
  const ballotKey = Buffer.from(
    process.env.BALLOT_ENCRYPTION_KEY || "",
    "base64",
  );
  if (process.env.DATA_ENCRYPTION_KEY && dataKey.length !== 32)
    issues.push("DATA_ENCRYPTION_KEY must be a 32-byte base64 key");
  if (process.env.BALLOT_ENCRYPTION_KEY && ballotKey.length !== 32)
    issues.push("BALLOT_ENCRYPTION_KEY must be a 32-byte base64 key");
  if (
    dataKey.length === 32 &&
    ballotKey.length === 32 &&
    dataKey.equals(ballotKey)
  )
    issues.push("Document and ballot encryption keys must be separate");
  if (
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_URL !== `https://${projectRef}.supabase.co`
  )
    issues.push("SUPABASE_URL must target the selected project");
  if (process.env.DATABASE_URL) {
    try {
      const connection = new URL(process.env.DATABASE_URL);
      const selected =
        connection.hostname === `db.${projectRef}.supabase.co` ||
        (connection.hostname.endsWith(".pooler.supabase.com") &&
          decodeURIComponent(connection.username).endsWith(`.${projectRef}`));
      if (!selected)
        issues.push("DATABASE_URL must target the selected Supabase project");
      if (
        !["postgres:", "postgresql:"].includes(connection.protocol) ||
        !connection.password ||
        connection.searchParams.has("host")
      )
        issues.push(
          "DATABASE_URL requires a private PostgreSQL password and the selected host",
        );
    } catch {
      issues.push("DATABASE_URL is invalid");
    }
  }
  return issues;
}
export function requireConfiguration() {
  if (configurationIssues().length)
    throw Object.assign(
      new Error(
        "Account services are not ready yet. The application administrator must finish the server configuration.",
      ),
      { status: 503 },
    );
}
export function supabaseForRequest(req: Request, res: Response) {
  requireConfiguration();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        name: "evote-auth",
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        path: "/",
      },
      cookies: {
        getAll: () =>
          Object.entries(req.cookies || {}).map(([name, value]) => ({
            name,
            value: String(value),
          })),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            req.cookies[name] = value;
            res.cookie(name, value, {
              ...options,
              httpOnly: true,
              secure: production,
              sameSite: "lax",
              path: "/",
            });
          }
        },
      },
    },
  );
}
export function clearAuthCookies(req: Request, res: Response) {
  const names = new Set([
    ...Object.keys(req.cookies || {}).filter((name) =>
      name.startsWith("evote-auth"),
    ),
    "evote-auth",
    "evote-auth-code-verifier",
    "evote-recovery",
    "evote-recovery-intent",
  ]);
  for (const name of names) {
    res.clearCookie(name, {
      path: "/",
      httpOnly: true,
      secure: production,
      sameSite: "lax",
    });
    delete req.cookies?.[name];
  }
}
let privileged: ReturnType<typeof createClient> | undefined;
export function supabaseAdmin() {
  requireConfiguration();
  if (!process.env.SUPABASE_SECRET_KEY)
    throw Object.assign(
      new Error(
        "Secure storage and account deletion require the server Supabase secret key.",
      ),
      { status: 503 },
    );
  return (privileged ??= createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  ));
}
