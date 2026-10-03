import "dotenv/config";
import { Client } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const project = "mdtymdvybaurguflwktt";
let client,
  opened = false;
try {
  const raw = process.env.DIRECT_URL;
  if (!raw)
    throw new Error("Set DIRECT_URL privately before applying the migration.");
  const url = new URL(raw);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.password ||
    url.searchParams.has("host")
  )
    throw new Error("Use a PostgreSQL connection with a database password.");
  if (
    !(
      url.hostname === `db.${project}.supabase.co` ||
      (url.hostname.endsWith(".pooler.supabase.com") &&
        decodeURIComponent(url.username).endsWith("." + project))
    )
  )
    throw new Error("Migration target must be the selected Supabase project.");
  if (url.port === "6543")
    throw new Error(
      "Use the direct connection or session pooler on port 5432 for migration.",
    );
  const schedule = process.argv.includes("--schedule");
  const workerOrigin = process.env.APP_ORIGIN || "";
  if (
    schedule &&
    (!/^https:\/\/[^/]+$/.test(workerOrigin) ||
      new URL(workerOrigin).hostname.endsWith("localhost") ||
      (process.env.WORKER_SECRET || "").length < 32)
  )
    throw new Error(
      "Scheduling requires an HTTPS APP_ORIGIN and a private WORKER_SECRET.",
    );
  for (const key of [
    "schema",
    "pgbouncer",
    "connection_limit",
    "pool_timeout",
    "sslmode",
    "sslaccept",
    "sslcert",
    "sslrootcert",
  ])
    url.searchParams.delete(key);
  const ca = process.env.SUPABASE_CA_CERT_PATH
    ? await readFile(process.env.SUPABASE_CA_CERT_PATH, "utf8")
    : undefined;
  client = new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  opened = true;
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(7823490)");
  const migrations = (await readdir("supabase/migrations"))
    .filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  if (
    !migrations.length ||
    !migrations[0].endsWith("_secure_voting_platform.sql")
  )
    throw new Error("Expected the reviewed application baseline migration.");
  const existing = await client.query(
    "SELECT to_regnamespace('evote') AS application, to_regclass('evote.__migration_history') AS history",
  );
  if (existing.rows[0].application && !existing.rows[0].history)
    throw new Error(
      "An existing evote schema requires a separate migration review.",
    );
  const applied = existing.rows[0].history
    ? (
        await client.query(
          "SELECT name,checksum FROM evote.__migration_history ORDER BY name",
        )
      ).rows
    : [];
  if (applied.some((row) => !migrations.includes(row.name)))
    throw new Error("Existing application migration differs.");
  let count = 0;
  for (const migration of migrations) {
    const sql = await readFile("supabase/migrations/" + migration, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prior = applied.find((row) => row.name === migration);
    if (prior) {
      if (prior.checksum !== checksum)
        throw new Error("Existing application migration differs.");
      continue;
    }
    if (applied.some((row) => row.name > migration))
      throw new Error("Existing application migration differs.");
    await client.query(sql);
    if (!existing.rows[0].history && count === 0)
      await client.query(
        "CREATE TABLE evote.__migration_history (name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now()); ALTER TABLE evote.__migration_history ENABLE ROW LEVEL SECURITY; REVOKE ALL ON evote.__migration_history FROM PUBLIC,anon,authenticated,evote_server",
      );
    await client.query(
      "INSERT INTO evote.__migration_history (name,checksum) VALUES ($1,$2)",
      [migration, checksum],
    );
    count++;
  }
  if (schedule) {
    const existingSecret = await client.query(
      "SELECT id FROM vault.secrets WHERE name='evote_worker_token'",
    );
    if (existingSecret.rows.length)
      await client.query("SELECT vault.update_secret($1::uuid,$2)", [
        existingSecret.rows[0].id,
        process.env.WORKER_SECRET,
      ]);
    else
      await client.query(
        "SELECT vault.create_secret($1,'evote_worker_token','E-Vote scheduled maintenance bearer token')",
        [process.env.WORKER_SECRET],
      );
    const workerUrl = workerOrigin + "/api/internal/maintenance";
    // The URL is validated above. Keep the bearer token out of cron command text.
    const command = `SELECT net.http_post(url := '${workerUrl.replaceAll("'", "''")}',
      headers := jsonb_build_object('Content-Type','application/json','Authorization',
        'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='evote_worker_token')),
      body := '{}'::jsonb, timeout_milliseconds := 55000);`;
    await client.query(
      "SELECT cron.schedule('evote-maintenance','* * * * *',$1)",
      [command],
    );
    await client.query(
      "SELECT cron.schedule('evote-maintenance-history','0 0 * * *',$1)",
      [
        "DELETE FROM cron.job_run_details WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname IN ('evote-maintenance','evote-maintenance-history')) AND end_time < now() - interval '7 days'",
      ],
    );
  }
  await client.query("COMMIT");
  console.log(
    `${count} reviewed Supabase migration(s) applied. No user or election records were seeded.`,
  );
  if (schedule)
    console.log(
      "Supabase maintenance scheduled every minute; bearer token is protected in Vault.",
    );
} catch (e) {
  if (opened) await client.query("ROLLBACK").catch(() => {});
  const known = new Set([
    "Set DIRECT_URL privately before applying the migration.",
    "Use a PostgreSQL connection with a database password.",
    "Migration target must be the selected Supabase project.",
    "Use the direct connection or session pooler on port 5432 for migration.",
    "Expected the reviewed application baseline migration.",
    "An existing evote schema requires a separate migration review.",
    "Existing application migration differs.",
    "Scheduling requires an HTTPS APP_ORIGIN and a private WORKER_SECRET.",
  ]);
  console.error(
    "Migration stopped: " +
      (known.has(e.message)
        ? e.message
        : "Check the private connection, database permissions, TLS certificate and reviewed migration."),
  );
  console.error("No migration was committed. Credentials were not printed.");
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
