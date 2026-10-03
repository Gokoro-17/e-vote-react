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
        signal: AbortSignal.timeout(5000),
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
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "DATABASE_URL",
    "DATA_ENCRYPTION_KEY",
    "BALLOT_ENCRYPTION_KEY",
  ])
    if (!process.env[name]) issues.push(name);
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
        "Supabase setup is incomplete. The application administrator must finish the project connection.",
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
