import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { supabaseAdmin } from "./supabase.js";
const db = new PrismaClient(),
  email = process.argv[2];
if (!email)
  throw new Error("Usage: npm run admin:bootstrap -- registered-email");
try {
  const candidate = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (
    !candidate ||
    !candidate.emailVerified ||
    candidate.suspended ||
    !candidate.consentAt
  )
    throw new Error("Register, verify and finish this account first.");
  const { data, error } = await supabaseAdmin().auth.admin.mfa.listFactors({
    userId: candidate.id,
  });
  if (error || !data?.factors.some((factor) => factor.status === "verified"))
    throw new Error(
      "Enable an authenticator in Account security before assigning platform access.",
    );
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7823492)`;
    const u = await tx.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!u || !u.emailVerified || u.suspended || !u.consentAt)
      throw new Error("Register, verify and finish this account first.");
    if (await tx.user.count({ where: { role: "SUPER_ADMIN" } }))
      throw new Error(
        "A platform administrator already exists; use its dashboard to appoint others.",
      );
    await tx.user.update({
      where: { id: u.id },
      data: { role: "SUPER_ADMIN" },
    });
  });
  console.log("Initial platform administrator assigned.");
} finally {
  await db.$disconnect();
}
