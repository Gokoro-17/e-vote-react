import { maintenance, db } from "./platform.js";
import { requireConfiguration } from "./supabase.js";
import { processBillingMaintenance } from "./billing.js";
try {
  requireConfiguration();
  await maintenance();
  await processBillingMaintenance();
  console.log("Scheduled maintenance completed.");
} catch {
  console.error(
    "Scheduled maintenance failed. Check server configuration and provider availability.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
