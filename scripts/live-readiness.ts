import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { db } from "../server/platform.js";
import { configurationIssues, projectRef } from "../server/supabase.js";
const origin =
  process.env.LIVE_TEST_ORIGIN ||
  `http://127.0.0.1:${process.env.PORT || 3001}`;
let checks = 0,
  blocked = false;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    checks++;
    console.log("PASS " + name);
  } catch (e: any) {
    console.log(
      "BLOCKED " +
        name +
        ": " +
        ([
          "The private .env connection values are incomplete.",
          "Google sign-in is disabled in the selected project.",
          "Email confirmation is disabled in the selected project.",
        ].includes(e.message)
          ? e.message
          : "The check did not pass; review the service configuration."),
    );
    blocked = true;
  }
}
async function request(path: string, options: RequestInit = {}) {
  return fetch(origin + "/api" + path, {
    ...options,
    signal: AbortSignal.timeout(15000),
    redirect: "manual",
  });
}
await check("Live session endpoint and secure API headers", async () => {
  const response = await request("/auth/session");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(response.headers.get("content-security-policy"));
  const body = (await response.json()) as any;
  assert.equal(body.user, null);
  assert.equal(body.csrf, null);
});
await check("Public configuration exposes no server secrets", async () => {
  const response = await request("/public/config");
  assert.equal(response.status, 200);
  const text = await response.text();
  const body = JSON.parse(text);
  assert.equal(body.configured, true);
  assert.equal(body.googleEnabled, true);
  assert.equal(body.captchaSiteKey, process.env.TURNSTILE_SITE_KEY);
  for (const key of [
    "SUPABASE_SECRET_KEY",
    "TURNSTILE_SECRET",
    "DATA_ENCRYPTION_KEY",
    "BALLOT_ENCRYPTION_KEY",
    "SMTP_URL",
    "DATABASE_URL",
    "WORKER_SECRET",
  ])
    if (process.env[key]) assert.ok(!text.includes(process.env[key]!));
});
await check("Unauthenticated scheduler invocation is rejected", async () => {
  const response = await request("/internal/maintenance", { method: "POST" });
  assert.equal(response.status, 401);
});
await check(
  "Google and email login require a real bot-protection challenge",
  async () => {
    const browserOrigin = ["localhost", "127.0.0.1"].includes(
      new URL(origin).hostname,
    )
      ? process.env.APP_ORIGIN!
      : new URL(origin).origin;
    for (const path of ["/auth/google", "/auth/login"]) {
      const response = await request(path, {
        method: "POST",
        headers: { "content-type": "application/json", origin: browserOrigin },
        body: "{}",
      });
      assert.equal(response.status, 403);
      assert.match(((await response.json()) as any).error, /bot protection/i);
    }
  },
);
await check(
  "Sign-out clears default authentication and recovery cookies",
  async () => {
    const browserOrigin = ["localhost", "127.0.0.1"].includes(
      new URL(origin).hostname,
    )
      ? process.env.APP_ORIGIN!
      : new URL(origin).origin;
    const response = await request("/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json", origin: browserOrigin },
      body: "{}",
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as any;
    assert.equal(body.user, null);
    assert.equal(body.csrf, null);
    const cookies = response.headers.getSetCookie();
    for (const name of [
      "evote-auth",
      "evote-auth-code-verifier",
      "evote-recovery",
      "evote-recovery-intent",
    ]) {
      const cookie = cookies.find((c) => c.startsWith(name + "="));
      assert.ok(cookie);
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /Expires=Thu, 01 Jan 1970/i);
      if (origin.startsWith("https:")) assert.match(cookie, /Secure/i);
    }
  },
);
await check(
  "Public election, organization and statistics endpoints respond",
  async () => {
    for (const path of ["/elections", "/organizations", "/public/stats"]) {
      const response = await request(path);
      assert.equal(response.status, 200);
      assert.match(
        response.headers.get("content-type") || "",
        /application\/json/,
      );
      await response.json();
    }
  },
);
await check(
  "Live subscription catalog has the approved NGN prices and capacities",
  async () => {
    const response = await request("/public/plans");
    assert.equal(response.status, 200);
    const catalog = (await response.json()) as any;
    assert.equal(catalog.currency, "NGN");
    assert.equal(catalog.interval, "monthly");
    assert.deepEqual(
      catalog.plans.map((p: any) => [p.id, p.voters, p.amount]),
      [
        ["FREE", 50, 0],
        ["PRO", 100, 1500000],
        ["BUSINESS", 1000, 2500000],
        ["ENTERPRISE", null, 4000000],
      ],
    );
  },
);
await check("Unsigned payment webhook denied before data access", async () => {
  const response = await request("/billing/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 401);
});
await check("Forged payment signature denied before data access", async () => {
  const response = await request("/billing/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-paystack-signature": "0".repeat(128),
    },
    body: "{}",
  });
  assert.equal(response.status, 401);
});
await check("Cross-origin subscription checkout denied", async () => {
  const response = await request(
    "/organizations/not-an-organization/billing/checkout",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://untrusted.example",
      },
      body: "{}",
    },
  );
  assert.equal(response.status, 403);
});
await check(
  "Cross-origin mutation denied before application data is changed",
  async () => {
    const response = await request("/contact", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://untrusted.example",
      },
      body: "{}",
    });
    assert.equal(response.status, 403);
  },
);
await check("Selected Supabase project is configured", async () => {
  if (configurationIssues().length)
    throw new Error("The private .env connection values are incomplete.");
  const response = await request("/health");
  assert.equal(response.status, 200);
});
let providerSettings: any;
await check("Live Supabase email confirmation", async () => {
  assert.equal(process.env.SUPABASE_URL, `https://${projectRef}.supabase.co`);
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY! },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200);
  providerSettings = await response.json();
  if (providerSettings.mailer_autoconfirm !== false)
    throw new Error("Email confirmation is disabled in the selected project.");
  assert.equal(providerSettings.external?.email, true);
});
await check("Live Supabase Google sign-in", async () => {
  assert.ok(providerSettings);
  if (providerSettings?.external?.google !== true)
    throw new Error("Google sign-in is disabled in the selected project.");
});
await check(
  "Google OAuth redirects to Google with a real web client",
  async () => {
    const authorize = new URL(process.env.SUPABASE_URL + "/auth/v1/authorize");
    authorize.searchParams.set("provider", "google");
    authorize.searchParams.set(
      "redirect_to",
      new URL(origin).origin + "/api/auth/callback",
    );
    authorize.searchParams.set(
      "code_challenge",
      createHash("sha256").update(randomBytes(32)).digest("base64url"),
    );
    authorize.searchParams.set("code_challenge_method", "s256");
    const response = await fetch(authorize, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 302);
    const google = new URL(response.headers.get("location")!);
    assert.equal(google.hostname, "accounts.google.com");
    assert.match(
      google.searchParams.get("client_id") || "",
      /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
    );
    assert.equal(
      google.searchParams.get("redirect_uri"),
      process.env.SUPABASE_URL + "/auth/v1/callback",
    );
  },
);
await check(
  "Identity documents use a private, size-limited storage bucket",
  async () => {
    const client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await client.storage.listBuckets();
    assert.equal(error, null);
    const bucket = data!.find((b) => b.id === "verification-documents");
    assert.ok(bucket);
    assert.equal(bucket.public, false);
    assert.equal(bucket.file_size_limit, 7340032);
    assert.deepEqual(bucket.allowed_mime_types, ["application/octet-stream"]);
  },
);
if (!configurationIssues().length) {
  await check(
    "Application database login cannot bypass RLS or change roles",
    async () => {
      const roles = await db.$queryRaw<
        any[]
      >`SELECT current_user AS name,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user`;
      assert.equal(roles[0]?.name, "evote_runtime");
      for (const flag of [
        "rolsuper",
        "rolbypassrls",
        "rolcreaterole",
        "rolcreatedb",
      ])
        assert.equal(roles[0][flag], false);
    },
  );
  await check(
    "Runtime cannot modify stored ballots, receipts or audit history",
    async () => {
      for (const table of [
        "Ballot",
        "VoteReceipt",
        "AuditLog",
        "ElectionResult",
      ]) {
        const rights = await db.$queryRaw<
          any[]
        >`SELECT has_table_privilege(current_user,${'evote."' + table + '"'},'UPDATE,DELETE,TRUNCATE') AS mutable`;
        assert.equal(rights[0]?.mutable, false);
      }
    },
  );
  await check(
    "Private session lookup preserves caller permissions",
    async () => {
      await db.$queryRaw`SELECT id,user_id FROM evote."AuthSessionCheck" WHERE false`;
      const views = await db.$queryRaw<any[]>`SELECT c.reloptions,
      has_table_privilege('anon',c.oid,'SELECT') AS anonymous_access,
      has_table_privilege('authenticated',c.oid,'SELECT') AS browser_access,
      has_table_privilege('evote_server',c.oid,'SELECT') AS backend_access,
      has_table_privilege('evote_server',c.oid,'UPDATE') AS backend_update
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='evote' AND c.relname='AuthSessionCheck' AND c.relkind='v'`;
      assert.equal(views.length, 1);
      assert.ok(views[0].reloptions.includes("security_invoker=true"));
      assert.equal(views[0].anonymous_access, false);
      assert.equal(views[0].browser_access, false);
      assert.equal(views[0].backend_access, true);
      assert.equal(views[0].backend_update, false);
    },
  );
  await check("Live registration capacity trigger is installed", async () => {
    const functions = await db.$queryRaw<
      any[]
    >`SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='evote' AND p.proname='validate_eligibility_change'`;
    assert.match(functions[0]?.prosrc || "", /EVOTE_VOTER_LIMIT/);
    const triggers = await db.$queryRaw<
      any[]
    >`SELECT t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='evote' AND c.relname='VoterEligibility' AND t.tgname='eligibility_rules'`;
    assert.equal(triggers[0]?.tgenabled, "O");
  });
  await check("Anonymous admin access denied", async () => {
    const response = await request("/admin/dashboard");
    assert.equal(response.status, 401);
  });
  await check("Private database tables have RLS enabled", async () => {
    const tables = await db.$queryRaw<
      any[]
    >`SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='evote' AND c.relkind='r'`;
    assert.ok(tables.length >= 25);
    assert.ok(tables.every((t) => t.relrowsecurity));
  });
  await check(
    "Browser roles cannot access identity or ballot tables",
    async () => {
      const rights = await db.$queryRaw<
        any[]
      >`SELECT has_schema_privilege('anon','evote','USAGE') AS anon, has_schema_privilege('authenticated','evote','USAGE') AS authenticated`;
      assert.equal(rights[0]?.anon, false);
      assert.equal(rights[0]?.authenticated, false);
    },
  );
  await check(
    "Ballot schema excludes voter and receipt references",
    async () => {
      const cols = await db.$queryRaw<
        any[]
      >`SELECT column_name FROM information_schema.columns WHERE table_schema='evote' AND table_name='Ballot'`;
      assert.deepEqual(
        cols.map((c) => c.column_name).sort(),
        ["commitment", "encryptedChoice", "id", "positionId"].sort(),
      );
    },
  );
}
await db.$disconnect();
console.log(
  `${checks} live readiness checks passed. No accounts, organizations, documents, elections or ballots were created. Requests may create operational rate/security metadata. Target: ${projectRef}.`,
);
if (blocked) process.exitCode = 1;
