import { maintenance, db } from "./platform.js";
import { requireConfiguration } from "./supabase.js";
import { processBillingMaintenance } from "./billing.js";
import type { Express } from "express";
import { timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";

export async function runMaintenance(deadline = Infinity) {
  requireConfiguration();
  // A database lease prevents overlapping workers across serverless instances.
  const leaseUntil = new Date(Date.now() + 120000);
  const acquired = await db.$queryRaw<
    any[]
  >`INSERT INTO evote."RateBucket" (id,attempts,"resetAt")
    VALUES ('maintenance:lease',1,${leaseUntil}) ON CONFLICT (id)
    DO UPDATE SET "resetAt"=EXCLUDED."resetAt" WHERE evote."RateBucket"."resetAt" < now() RETURNING id`;
  if (!acquired.length) return false;
  try {
    await maintenance(deadline);
    await processBillingMaintenance(deadline);
    return true;
  } finally {
    await db.rateBucket.deleteMany({
      where: { id: "maintenance:lease", resetAt: leaseUntil },
    });
  }
}

export function mountWorker(app: Express) {
  app.post(
    "/api/internal/maintenance",
    rateLimit({ windowMs: 60000, limit: 30 }),
    async (req, res, next) => {
      res.set("Cache-Control", "no-store");
      const secret = process.env.WORKER_SECRET || "";
      const supplied = Buffer.from(req.get("authorization") || "");
      const expected = Buffer.from("Bearer " + secret);
      if (
        secret.length < 32 ||
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      ) {
        res.status(401).json({ error: "Worker authorization required." });
        return;
      }
      try {
        const completed = await runMaintenance(Date.now() + 35000);
        res.json({ ok: true, skipped: !completed });
      } catch (error) {
        next(error);
      }
    },
  );
}

// An imported/bundled API must never run the standalone worker entry point.
if (
  /(?:^|\/)server\/worker\.(?:ts|js)$/.test(
    (process.argv[1] || "").replaceAll("\\", "/"),
  )
) {
  try {
    // The standalone worker has a longer budget than an HTTP function.
    await runMaintenance(Date.now() + 90000);
    console.log("Scheduled maintenance completed.");
  } catch {
    console.error(
      "Scheduled maintenance failed. Check server configuration and provider availability.",
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
