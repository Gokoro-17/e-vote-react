import "dotenv/config";
import assert from "node:assert/strict";
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
if (!configurationIssues().length) {
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
  `${checks} read-only live checks passed. No accounts, organizations, documents, elections or ballots were created. Target: ${projectRef}.`,
);
if (blocked) process.exitCode = 1;
