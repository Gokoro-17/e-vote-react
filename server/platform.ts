import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  createHmac,
} from "node:crypto";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "./supabase.js";
import { eligibilityReason } from "./engine.js";
import path from "node:path";
function databaseConnection() {
  if (!process.env.DATABASE_URL) return undefined;
  try {
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set("sslmode", "require");
    url.searchParams.set("sslaccept", "strict");
    url.searchParams.set("schema", "evote");
    if (process.env.SUPABASE_CA_CERT_PATH)
      url.searchParams.set(
        "sslcert",
        path.resolve(process.env.SUPABASE_CA_CERT_PATH),
      );
    if (!url.searchParams.has("connection_limit"))
      url.searchParams.set("connection_limit", "5");
    if (!url.searchParams.has("connect_timeout"))
      url.searchParams.set("connect_timeout", "10");
    if (url.port === "6543") url.searchParams.set("pgbouncer", "true");
    return url.toString();
  } catch {
    return process.env.DATABASE_URL;
  }
}
const connection = databaseConnection();
const clientOptions: Prisma.PrismaClientOptions = connection
  ? { datasources: { db: { url: connection } } }
  : {};
export const db = new PrismaClient(clientOptions);
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
const key = (purpose: string) => {
  const k = Buffer.from(
    process.env[
      purpose === "ballot" ? "BALLOT_ENCRYPTION_KEY" : "DATA_ENCRYPTION_KEY"
    ] || "",
    "base64",
  );
  if (k.length !== 32)
    throw new Error("Configure separate 32-byte encryption keys in .env.");
  return k;
};
export const identityFingerprint = (subject: string) =>
  createHmac("sha256", key("data"))
    .update("authorized-identity-v1:" + subject)
    .digest("hex");
export function encrypt(value: string | Buffer, purpose = "data") {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key(purpose), iv);
  return Buffer.concat([
    iv,
    c.update(value),
    c.final(),
    c.getAuthTag(),
  ]).toString("base64");
}
export function decrypt(value: string, purpose = "data") {
  const b = Buffer.from(value, "base64"),
    c = createDecipheriv("aes-256-gcm", key(purpose), b.subarray(0, 12));
  c.setAuthTag(b.subarray(-16));
  return Buffer.concat([c.update(b.subarray(12, -16)), c.final()]);
}
export async function audit(
  actor: string,
  event: string,
  organizationId?: string,
  electionId?: string,
  result = "SUCCESS",
  tx: any = db,
) {
  // Serialize append operations so concurrent actions cannot fork the hash chain.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7823491)`;
  const previous = await tx.auditLog.findFirst({ orderBy: { id: "desc" } });
  const createdAt = new Date(),
    previousHash = previous?.hash || "GENESIS";
  const payload = {
    actor,
    event,
    organizationId: organizationId || null,
    electionId: electionId || null,
    result,
    createdAt: createdAt.toISOString(),
    previousHash,
  };
  await tx.auditLog.create({
    data: { ...payload, createdAt, hash: digest(JSON.stringify(payload)) },
  });
}
export const logAudit = (
  actor: string,
  event: string,
  org?: string,
  election?: string,
  result = "SUCCESS",
) => db.$transaction((tx) => audit(actor, event, org, election, result, tx));
export async function notify(
  userId: string,
  title: string,
  message: string,
  client: any = db,
) {
  await client.notification.create({ data: { userId, title, message } });
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      emailVerified: true,
      suspended: true,
      emailNotifications: true,
    },
  });
  if (user?.emailVerified && !user.suspended && user.emailNotifications)
    await client.mailOutbox.create({
      data: { to: user.email, subject: title, encryptedBody: encrypt(message) },
    });
}
export async function queueMail(to: string, subject: string, body: string) {
  await db.mailOutbox.create({
    data: { to, subject, encryptedBody: encrypt(body) },
  });
}
// Object-storage adapters receive encrypted content only; documents are never public URLs.
export interface DocumentStorage {
  put(key: string, ciphertext: string): Promise<void>;
  get(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}
const objectStorage: DocumentStorage = {
  async put(key, data) {
    const { error } = await supabaseAdmin()
      .storage.from("verification-documents")
      .upload(key, Buffer.from(data), {
        contentType: "application/octet-stream",
        upsert: false,
      });
    if (error) throw new Error("Secure document upload failed.");
  },
  async get(key) {
    const { data, error } = await supabaseAdmin()
      .storage.from("verification-documents")
      .download(key);
    if (error || !data) throw new Error("Secure document retrieval failed.");
    return data.text();
  },
  async delete(key) {
    const { error } = await supabaseAdmin()
      .storage.from("verification-documents")
      .remove([key]);
    if (error) throw new Error("Secure document deletion failed.");
  },
};
export async function storeDocument(buffer: Buffer) {
  const objectKey = token();
  await objectStorage.put(objectKey, encrypt(buffer));
  return objectKey;
}
export const fetchDocument = async (key: string) =>
  decrypt(await objectStorage.get(key));
export const removeDocument = async (key: string) => objectStorage.delete(key);
export async function eligibilityCounts(e: any, client: any = db) {
  const records = await client.voterEligibility.findMany({
    where: { electionId: e.id },
    include: {
      user: {
        include: {
          memberships: { where: { organizationId: e.organizationId } },
        },
      },
    },
  });
  return {
    registered: records.length,
    eligible: records.filter(
      (r: any) => !eligibilityReason(e, r.user, r, r.user.memberships[0]),
    ).length,
  };
}
export async function processDeletionJob(job: any) {
  try {
    for (const objectKey of JSON.parse(
      decrypt(job.encryptedObjectKeys).toString(),
    ))
      await removeDocument(objectKey);
    const { error } = await supabaseAdmin().auth.admin.deleteUser(job.id, true);
    if (error && error.status !== 404)
      throw new Error("Authentication deletion unavailable.");
    await db.deletionJob.update({
      where: { id: job.id },
      data: { completedAt: new Date(), encryptedObjectKeys: encrypt("[]") },
    });
    await logAudit("SYSTEM", "ACCOUNT_DELETION_COMPLETED");
  } catch {
    await db.deletionJob.update({
      where: { id: job.id },
      data: { attempts: { increment: 1 } },
    });
  }
}
export async function maintenance(deadline = Infinity) {
  for (const job of await db.deletionJob.findMany({
    where: { completedAt: null, attempts: { lt: 20 } },
    take: 20,
  })) {
    if (Date.now() + 20000 >= deadline) return;
    await processDeletionJob(job);
  }
  const expired = await db.document.findMany({
    where: { expiresAt: { lt: new Date() } },
    take: 20,
  });
  for (const d of expired) {
    if (Date.now() + 20000 >= deadline) return;
    await removeDocument(d.objectKey);
    await db.document.delete({ where: { id: d.id } });
    await logAudit("SYSTEM", "DOCUMENT_EXPIRED");
  }
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.authRegistration.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 30 * 86400000) } },
  });
  await db.rateBucket.deleteMany({ where: { resetAt: { lt: new Date() } } });
  const elections = await db.election.findMany({
    where: {
      status: { in: ["VOTING_UPCOMING", "VOTING_OPEN", "RESULTS_PENDING"] },
      organization: { suspended: false },
    },
  });
  for (const e of elections) {
    if (Date.now() + 20000 >= deadline) return;
    let status = e.status;
    if (
      status === "VOTING_UPCOMING" &&
      e.votingStart <= new Date() &&
      e.votingEnd > new Date()
    )
      status = "VOTING_OPEN";
    if (status === "VOTING_UPCOMING" && e.votingEnd <= new Date())
      status = "VOTING_CLOSED";
    if (status === "VOTING_OPEN" && e.votingEnd <= new Date())
      status = "VOTING_CLOSED";
    if (
      status === "RESULTS_PENDING" &&
      e.resultVisibility === "DELAYED" &&
      e.publishAt &&
      e.publishAt <= new Date()
    )
      status = "RESULTS_PUBLISHED";
    if (status !== e.status)
      await serializable(async (tx) => {
        await tx.$queryRaw`SELECT id FROM evote."Election" WHERE id=${e.id} FOR UPDATE`;
        const current = await tx.election.findUnique({
          where: { id: e.id },
          include: {
            positions: {
              include: { candidates: { where: { status: "APPROVED" } } },
            },
          },
        });
        if (!current || current.status !== e.status) return;
        if (
          status === "VOTING_OPEN" &&
          (!current.positions.length ||
            current.positions.some((p) => !p.candidates.length))
        )
          return;
        const counts =
          e.status === "VOTING_UPCOMING"
            ? await eligibilityCounts(e, tx)
            : null;
        const changed = await tx.election.updateMany({
          where: { id: e.id, status: e.status },
          data: {
            status,
            ...(counts
              ? {
                  registeredAtOpen: counts.registered,
                  eligibleAtOpen: counts.eligible,
                }
              : {}),
          },
        });
        if (changed.count) {
          await audit("SYSTEM", status, e.organizationId, e.id, "SUCCESS", tx);
          await tx.notificationCampaign.create({
            data: {
              electionId: e.id,
              title: status,
              message: `${e.name}: ${status.replaceAll("_", " ").toLowerCase()}`,
            },
          });
        }
      });
  }
  for (const campaign of await db.notificationCampaign.findMany({
    where: { completedAt: null },
    orderBy: { createdAt: "asc" },
    take: 10,
  })) {
    if (Date.now() + 20000 >= deadline) return;
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM evote."NotificationCampaign" WHERE id=${campaign.id} FOR UPDATE`;
        const fresh = await tx.notificationCampaign.findUnique({
          where: { id: campaign.id },
        });
        if (!fresh || fresh.completedAt) return;
        const voters = await tx.voterEligibility.findMany({
          where: {
            electionId: fresh.electionId,
            ...(fresh.cursor ? { userId: { gt: fresh.cursor } } : {}),
          },
          orderBy: { userId: "asc" },
          take: 100,
        });
        for (const v of voters)
          await notify(v.userId, fresh.title, fresh.message, tx);
        await tx.notificationCampaign.update({
          where: { id: fresh.id },
          data: {
            cursor: voters.at(-1)?.userId || fresh.cursor,
            completedAt: voters.length < 100 ? new Date() : null,
          },
        });
      },
      { timeout: 20000 },
    );
  }
  if (process.env.SMTP_URL) {
    const mailer = nodemailer.createTransport({
      url: process.env.SMTP_URL,
      pool: true,
      maxConnections: 1,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
    });
    try {
      for (const m of await db.mailOutbox.findMany({
        where: {
          sentAt: null,
          attempts: { lt: 5 },
          OR: [
            { claimedAt: null },
            { claimedAt: { lt: new Date(Date.now() - 5 * 60000) } },
          ],
        },
        take: 20,
        orderBy: { createdAt: "asc" },
      })) {
        if (Date.now() + 20000 >= deadline) return;
        const claim = await db.mailOutbox.updateMany({
          where: {
            id: m.id,
            sentAt: null,
            OR: [
              { claimedAt: null },
              { claimedAt: { lt: new Date(Date.now() - 5 * 60000) } },
            ],
          },
          data: { claimedAt: new Date() },
        });
        if (!claim.count) continue;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            mailer.sendMail({
              from: process.env.MAIL_FROM,
              to: m.to,
              subject: m.subject,
              text: decrypt(m.encryptedBody).toString(),
            }),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                mailer.close();
                reject(new Error("Email delivery timed out."));
              }, 15000);
            }),
          ]);
          await db.mailOutbox.update({
            where: { id: m.id },
            data: { sentAt: new Date(), encryptedBody: encrypt("DELIVERED") },
          });
        } catch {
          await db.mailOutbox.update({
            where: { id: m.id },
            data: { attempts: { increment: 1 }, claimedAt: null },
          });
        } finally {
          if (timer) clearTimeout(timer);
        }
      }
    } finally {
      mailer.close();
    }
  }
}
export async function serializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let i = 0; i < 4; i++)
    try {
      return await db.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 20000,
      });
    } catch (e: any) {
      if (e.code !== "P2034" || i === 3) throw e;
    }
  throw new Error("Transaction retry exhausted");
}
