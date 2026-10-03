import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { plans } from "../shared/plans.js";
import { paystack } from "../server/billing.js";
import { db } from "../server/platform.js";

try {
  if (!/^sk_live_/.test(process.env.PAYSTACK_SECRET_KEY || ""))
    throw new Error(
      "Set PAYSTACK_SECRET_KEY privately in .env to your Paystack live secret key.",
    );
  let content = await readFile(".env", "utf8");
  const catalog: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await paystack(`/plan?perPage=100&page=${page}`);
    if (!Array.isArray(batch))
      throw new Error("Paystack did not return a plan catalog.");
    catalog.push(...batch);
    if (batch.length < 100) break;
    if (page === 20)
      throw new Error(
        "Plan catalog exceeds automatic setup size. Configure the three plan codes privately.",
      );
  }
  for (const plan of plans.filter((p) => p.amount > 0)) {
    const variable = "PAYSTACK_PLAN_" + plan.id;
    const name = `E-Vote ${plan.name} Monthly NGN`;
    const supplied = process.env[variable];
    let provider = supplied
      ? await paystack("/plan/" + encodeURIComponent(supplied))
      : catalog.find(
          (p) =>
            p.name === name &&
            p.amount === plan.amount &&
            p.currency === "NGN" &&
            p.interval === "monthly",
        );
    if (!provider)
      provider = await paystack("/plan", {
        name,
        amount: plan.amount,
        currency: "NGN",
        interval: "monthly",
        send_invoices: true,
        send_sms: false,
      });
    if (
      provider.amount !== plan.amount ||
      provider.currency !== "NGN" ||
      provider.interval !== "monthly" ||
      !/^PLN_[a-zA-Z0-9]+$/.test(provider.plan_code)
    )
      throw new Error(
        `The configured ${plan.name} plan does not match its approved price and monthly currency.`,
      );
    const entry = variable + "=" + provider.plan_code;
    content = new RegExp("^" + variable + "=.*$", "m").test(content)
      ? content.replace(new RegExp("^" + variable + "=.*$", "m"), entry)
      : content + "\n" + entry + "\n";
    await writeFile(".env", content, "utf8");
    console.log(
      `${plan.name}: ₦${(plan.amount / 100).toLocaleString("en-NG")} monthly plan configured. No customer was subscribed or charged.`,
    );
  }
  console.log(
    "Restart the API. Set the Paystack live webhook to your public HTTPS /api/billing/webhook endpoint.",
  );
} catch (error: any) {
  console.error(
    error.status
      ? "Billing setup stopped: the payment provider request failed. Keys were not printed."
      : error.message,
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
