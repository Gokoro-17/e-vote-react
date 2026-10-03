import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { encrypt, decrypt, db } from "./platform.js";
const restore = process.argv[2] === "restore";
function pgEnvironment(raw: string) {
  const u = new URL(raw);
  if (!["postgresql:", "postgres:"].includes(u.protocol))
    throw new Error("PostgreSQL URL required.");
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.slice(1),
    PGSSLMODE: "verify-full",
    ...(process.env.SUPABASE_CA_CERT_PATH
      ? { PGSSLROOTCERT: process.env.SUPABASE_CA_CERT_PATH }
      : {}),
  };
}
function projectIdentity(raw: string) {
  const url = new URL(raw);
  if (url.hostname.endsWith(".supabase.co") && url.hostname.startsWith("db."))
    return url.hostname.split(".")[1];
  if (url.hostname.endsWith(".pooler.supabase.com"))
    return decodeURIComponent(url.username).split(".").at(-1);
  return null;
}
async function run(
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  input?: Buffer,
) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(binary, args, {
        env,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      }),
      chunks: Buffer[] = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(`PostgreSQL backup tool exited with code ${code}.`)),
    );
    child.stdin.end(input);
  });
}
try {
  if (restore) {
    const target = process.env.RECOVERY_DATABASE_URL;
    if (!target || target === process.env.DATABASE_URL)
      throw new Error(
        "Set RECOVERY_DATABASE_URL to a separate empty recovery database. The live database cannot be the restore target.",
      );
    const file = process.argv[3];
    if (!file)
      throw new Error(
        "Usage: npm run db:restore -- restore path-to-backup.enc",
      );
    const env = pgEnvironment(target),
      live = process.env.DATABASE_URL
        ? new URL(process.env.DATABASE_URL)
        : null;
    const targetProject = projectIdentity(target);
    if (
      targetProject === "mdtymdvybaurguflwktt" ||
      (targetProject &&
        process.env.DATABASE_URL &&
        targetProject === projectIdentity(process.env.DATABASE_URL))
    )
      throw new Error(
        "The selected live project cannot be a recovery destination.",
      );
    if (
      live &&
      env.PGHOST === live.hostname &&
      env.PGPORT === (live.port || "5432") &&
      env.PGDATABASE === live.pathname.slice(1)
    )
      throw new Error("The restore destination resolves to the live database.");
    // No --clean/drop operations: restore fails transactionally if destination objects exist.
    const bytes = decrypt(await readFile(path.resolve(file), "utf8"));
    await run(
      process.env.PG_RESTORE_PATH || "pg_restore",
      [
        "--exit-on-error",
        "--single-transaction",
        "--no-owner",
        "--no-privileges",
      ],
      env,
      bytes,
    );
    console.log(
      "Restored into the separate recovery database. Restore matching document snapshots and verify integrity/access before any cutover.",
    );
  } else {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
    const folder = path.resolve(
      ".backups",
      new Date().toISOString().replace(/[:.]/g, "-"),
    );
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const dump = await run(
      process.env.PG_DUMP_PATH || "pg_dump",
      ["--format=custom", "--schema=evote", "--no-owner", "--no-privileges"],
      pgEnvironment(process.env.DIRECT_URL || process.env.DATABASE_URL),
    );
    await writeFile(path.join(folder, "database.enc"), encrypt(dump), {
      mode: 0o600,
    });
    await writeFile(
      path.join(folder, "manifest.json"),
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          documentStorage: "Supabase Storage: separate object backup required",
          encryption: "AES-256-GCM",
          note: "This dump contains application schema data only. Supabase Auth, private storage objects, RLS policies and role grants need coordinated backups. Protect keys separately.",
        },
        null,
        2,
      ),
    );
    console.log("Encrypted backup created in .backups.");
  }
} catch {
  console.error(
    "Backup or recovery stopped. Check the private configuration, separate recovery destination, encryption keys, certificate and PostgreSQL tools. Credentials were not printed.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
