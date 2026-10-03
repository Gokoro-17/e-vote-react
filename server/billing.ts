import express, { Express, NextFunction, Request, Response } from "express";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { AsyncLocalStorage } from "node:async_hooks";
import { db, serializable, audit, digest } from "./platform.js";
import { requireUser } from "./auth.js";
import { requireConfiguration } from "./supabase.js";
import {
  plans,
  planById,
  planRank,
  effectivePlan,
  nextBillingMonth,
} from "../shared/plans.js";

const route =
  (fn: (req: any, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);
const fail = (message: string, status = 400): never => {
  throw Object.assign(new Error(message), { status });
};
const paidPlan = z.enum(["PRO", "BUSINESS", "ENTERPRISE"]);
const providerCode = (plan: string) =>
  process.env["PAYSTACK_PLAN_" + plan] || "";
const providerReady = (plan: string) =>
  Boolean(
    /^sk_live_/.test(process.env.PAYSTACK_SECRET_KEY || "") &&
    /^PLN_[a-zA-Z0-9]+$/.test(providerCode(plan)),
  );

export function validWebhookSignature(
  raw: Buffer,
  signature: string,
  secret: string,
) {
  if (!/^[a-f0-9]{128}$/i.test(signature) || !secret) return false;
  const expected = createHmac("sha512", secret).update(raw).digest();
  const supplied = Buffer.from(signature, "hex");
  return (
    supplied.length === expected.length && timingSafeEqual(expected, supplied)
  );
}
export async function paystack(path: string, body?: unknown) {
  if (!/^sk_live_/.test(process.env.PAYSTACK_SECRET_KEY || ""))
    fail("Subscription checkout is not available yet.", 503);
  let response: globalThis.Response;
  const remaining = (billingDeadline.getStore() ?? Infinity) - Date.now();
  if (remaining < 1000)
    fail("Billing maintenance will continue on its next pass.", 503);
  try {
    response = await fetch("https://api.paystack.co" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + process.env.PAYSTACK_SECRET_KEY,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(Math.min(8000, remaining)),
    });
  } catch {
    return fail("The payment provider is unavailable. Please try again.", 502);
  }
  const result = (await response.json().catch(() => null)) as any;
  if (!response.ok || result?.status !== true)
    fail("The payment provider could not complete this request.", 502);
  return result.data || {};
}
export function validatePaidTransaction(
  payment: { reference: string; amount: number; currency: string },
  subscription: { payerEmail: string },
  transaction: any,
) {
  const paidAt = new Date(transaction.paid_at || transaction.paidAt);
  if (
    transaction.status !== "success" ||
    transaction.domain !== "live" ||
    transaction.reference !== payment.reference ||
    transaction.amount !== payment.amount ||
    transaction.currency !== payment.currency ||
    transaction.customer?.email?.toLowerCase() !==
      subscription.payerEmail.toLowerCase() ||
    !/^CUS_[a-zA-Z0-9]+$/.test(transaction.customer?.customer_code || "") ||
    !Number.isFinite(paidAt.getTime()) ||
    paidAt.getTime() > Date.now() + 60000
  )
    fail("Payment details could not be verified.", 409);
  return paidAt;
}
async function verifyPayment(
  reference: string,
  renewalSubscriptionId?: string,
) {
  const existing = await db.billingPayment.findUnique({
    where: { reference },
    include: { subscription: true },
  });
  if (existing?.status === "PAID") return existing;
  const subscription =
    existing?.subscription ||
    (renewalSubscriptionId
      ? await db.billingSubscription.findUnique({
          where: { id: renewalSubscriptionId },
        })
      : null);
  if (!subscription) return null;
  const transaction = await paystack(
    "/transaction/verify/" + encodeURIComponent(reference),
  );
  if (
    existing &&
    ["failed", "abandoned", "reversed"].includes(transaction.status) &&
    transaction.reference === reference &&
    transaction.domain === "live"
  ) {
    await db.billingPayment.updateMany({
      where: { reference, status: "PENDING" },
      data: { status: "FAILED" },
    });
    return db.billingPayment.findUnique({ where: { reference } });
  }
  const expected = existing || {
    reference,
    amount: subscription.amount,
    currency: subscription.currency,
  };
  const paidAt = validatePaidTransaction(expected, subscription, transaction);
  if (
    !existing &&
    transaction.customer.customer_code !== subscription.customerCode
  )
    fail("Payment customer could not be verified.", 409);
  if (existing && paidAt < new Date(existing.createdAt.getTime() - 60000))
    fail("Payment predates the checkout.", 409);
  const fingerprint =
    typeof transaction.authorization?.signature === "string"
      ? digest(transaction.authorization.signature)
      : null;
  return serializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM evote."Organization" WHERE id=${subscription.organizationId} FOR UPDATE`;
    const duplicate = await tx.billingPayment.findUnique({
      where: { reference },
    });
    if (duplicate?.status === "PAID") return duplicate;
    const payment = await tx.billingPayment.upsert({
      where: { reference },
      create: {
        reference,
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        actorId: "PAYSTACK",
        amount: subscription.amount,
        currency: subscription.currency,
        status: "PAID",
        paidAt,
        customerCode: transaction.customer.customer_code,
        authorizationFingerprint: fingerprint,
      },
      update: {
        status: "PAID",
        paidAt,
        customerCode: transaction.customer.customer_code,
        authorizationFingerprint: fingerprint,
      },
    });
    const current = await tx.billingSubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    const until = nextBillingMonth(paidAt);
    await tx.billingSubscription.update({
      where: { id: current.id },
      data: {
        status:
          current.cancellationRequested || current.status === "NON_RENEWING"
            ? "NON_RENEWING"
            : "ACTIVE",
        paidUntil:
          current.paidUntil && current.paidUntil > until
            ? current.paidUntil
            : until,
        customerCode: transaction.customer.customer_code,
      },
    });
    await audit(
      existing?.actorId || "PAYSTACK",
      "SUBSCRIPTION_PAYMENT_VERIFIED",
      subscription.organizationId,
      undefined,
      "SUCCESS",
      tx,
    );
    return payment;
  });
}
async function syncSubscription(code: string) {
  if (!/^SUB_[a-zA-Z0-9]+$/.test(code)) fail("Invalid subscription code.");
  const provider = await paystack("/subscription/" + encodeURIComponent(code));
  if (provider.domain !== "live" || provider.subscription_code !== code)
    fail("Subscription could not be verified.", 409);
  let stored = await db.billingSubscription.findUnique({
    where: { providerCode: code },
  });
  if (!stored) {
    const signature = provider.authorization?.signature;
    if (typeof signature !== "string")
      fail("Subscription association is pending.", 503);
    const created = new Date(provider.createdAt || provider.created_at);
    if (!Number.isFinite(created.getTime()))
      fail("Subscription association is pending.", 503);
    const matches = await db.billingPayment.findMany({
      where: {
        status: "PAID",
        customerCode: provider.customer?.customer_code,
        authorizationFingerprint: digest(signature),
        paidAt: {
          gte: new Date(created.getTime() - 5 * 60000),
          lte: new Date(created.getTime() + 5 * 60000),
        },
        subscription: {
          providerCode: null,
          providerPlanCode: provider.plan?.plan_code,
        },
      },
      include: { subscription: true },
      take: 2,
    });
    if (matches.length !== 1) fail("Subscription association is pending.", 503);
    stored = matches[0].subscription;
  }
  if (
    provider.customer?.customer_code !== stored.customerCode ||
    provider.plan?.plan_code !== stored.providerPlanCode ||
    provider.plan?.amount !== stored.amount ||
    provider.plan?.currency !== stored.currency ||
    provider.plan?.interval !== "monthly"
  )
    fail("Subscription details could not be verified.", 409);
  const state =
    provider.status === "non-renewing"
      ? "NON_RENEWING"
      : ["cancelled", "completed", "complete"].includes(provider.status)
        ? "NON_RENEWING"
        : provider.status === "attention"
          ? "PAST_DUE"
          : provider.status === "active"
            ? "ACTIVE"
            : stored.status;
  await serializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM evote."Organization" WHERE id=${stored!.organizationId} FOR UPDATE`;
    const latest = await tx.billingPayment.findFirst({
      where: { subscriptionId: stored!.id, status: "PAID" },
      orderBy: { paidAt: "desc" },
    });
    const nextDate = new Date(provider.next_payment_date);
    const current = await tx.billingSubscription.findUniqueOrThrow({
      where: { id: stored!.id },
    });
    const maximum = latest?.paidAt
      ? nextBillingMonth(latest.paidAt).getTime() + 3 * 86400000
      : 0;
    const paidUntil =
      latest?.paidAt &&
      Number.isFinite(nextDate.getTime()) &&
      nextDate > latest.paidAt &&
      nextDate.getTime() <= maximum &&
      (!current.paidUntil || nextDate > current.paidUntil)
        ? nextDate
        : current.paidUntil;
    await tx.billingSubscription.update({
      where: { id: stored!.id },
      data: {
        providerCode: code,
        status: state,
        paidUntil,
        lastCheckedAt: new Date(),
      },
    });
    if (current.providerCode !== code || current.status !== state)
      await audit(
        "PAYSTACK",
        current.providerCode
          ? "SUBSCRIPTION_STATUS_SYNCED"
          : "SUBSCRIPTION_LINKED",
        current.organizationId,
        undefined,
        "SUCCESS",
        tx,
      );
    // A verified upgrade replaces renewal, while previous paid access remains until its expiry.
    if (
      stored!.paidUntil &&
      stored!.paidUntil > new Date() &&
      !stored!.providerCode
    )
      await tx.billingSubscription.updateMany({
        where: {
          organizationId: stored!.organizationId,
          id: { not: stored!.id },
          createdAt: { lt: stored!.createdAt },
          paidUntil: { gt: new Date() },
          status: { in: ["ACTIVE", "PAST_DUE", "NON_RENEWING"] },
        },
        data: { cancellationRequested: true },
      });
  });
  return { stored, provider };
}
const billingDeadline = new AsyncLocalStorage<number>();
export async function processBillingMaintenance(deadline = Infinity) {
  await billingDeadline.run(deadline, () => billingMaintenance(deadline));
}
async function billingMaintenance(deadline: number) {
  if (Date.now() + 20000 >= deadline) return;
  if (!/^sk_live_/.test(process.env.PAYSTACK_SECRET_KEY || "")) return;
  await processBillingCancellations();
  // Reconcile completed initial checkouts even if the subscription webhook was missed.
  for (const sub of await db.billingSubscription.findMany({
    where: {
      providerCode: null,
      status: { in: ["ACTIVE", "NON_RENEWING"] },
      customerCode: { not: null },
    },
    take: 5,
  })) {
    if (Date.now() + 20000 >= deadline) return;
    try {
      const customer = await paystack(
        "/customer/" + encodeURIComponent(sub.customerCode!),
      );
      const subscriptions = await paystack(
        `/subscription?customer=${encodeURIComponent(customer.id)}&perPage=50`,
      );
      for (const item of Array.isArray(subscriptions) ? subscriptions : []) {
        if (
          item.plan?.plan_code === sub.providerPlanCode &&
          /^SUB_/.test(item.subscription_code || "")
        )
          await syncSubscription(item.subscription_code);
      }
    } catch {
      /* A signed webhook or next maintenance pass can retry without changing access. */
    }
  }
  // Reconcile missed renewal events against the provider, without extending unpaid access.
  for (const sub of await db.billingSubscription.findMany({
    where: {
      providerCode: { not: null },
      status: { in: ["ACTIVE", "PAST_DUE"] },
      OR: [
        { lastCheckedAt: null },
        { lastCheckedAt: { lt: new Date(Date.now() - 3600000) } },
      ],
    },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: 3,
  })) {
    if (Date.now() + 20000 >= deadline) return;
    try {
      const { provider } = await syncSubscription(sub.providerCode!);
      const invoice = provider.most_recent_invoice;
      if (invoice && invoice.status === "success" && invoice.paid) {
        let reference =
          typeof invoice.transaction === "object"
            ? invoice.transaction?.reference
            : null;
        if (!reference && Number.isSafeInteger(invoice.transaction))
          reference = (await paystack("/transaction/" + invoice.transaction))
            .reference;
        if (typeof reference === "string") {
          await verifyPayment(reference, sub.id);
          await syncSubscription(sub.providerCode!);
        }
      }
    } catch {
      /* A later pass can retry, retaining only the verified paid period. */
    }
  }
}
async function processBillingCancellations() {
  for (const sub of await db.billingSubscription.findMany({
    where: {
      cancellationRequested: true,
      providerCode: { not: null },
      status: { in: ["ACTIVE", "PAST_DUE"] },
    },
    take: 10,
  })) {
    if (Date.now() + 20000 >= (billingDeadline.getStore() ?? Infinity)) return;
    try {
      const provider = await paystack(
        "/subscription/" + encodeURIComponent(sub.providerCode!),
      );
      if (["active", "attention"].includes(provider.status)) {
        if (!provider.email_token) continue;
        await paystack("/subscription/disable", {
          code: sub.providerCode,
          token: provider.email_token,
        });
      }
      await serializable(async (tx) => {
        const updated = await tx.billingSubscription.updateMany({
          where: {
            id: sub.id,
            cancellationRequested: true,
            status: { in: ["ACTIVE", "PAST_DUE"] },
          },
          data: { status: "NON_RENEWING" },
        });
        if (updated.count)
          await audit(
            "PAYSTACK",
            "SUBSCRIPTION_RENEWAL_CANCELLED",
            sub.organizationId,
            undefined,
            "SUCCESS",
            tx,
          );
      });
    } catch {
      /* Cancellation requests persist until confirmed, so a restart does not lose them. */
    }
  }
}
async function handleWebhook(event: any) {
  const data = event.data;
  if (event.event === "charge.success" && typeof data?.reference === "string") {
    await verifyPayment(data.reference);
  } else if (
    [
      "subscription.create",
      "subscription.disable",
      "subscription.not_renew",
    ].includes(event.event)
  ) {
    await syncSubscription(data?.subscription_code);
  } else if (
    ["invoice.update", "invoice.payment_failed"].includes(event.event)
  ) {
    const code =
      typeof data?.subscription === "object"
        ? data.subscription?.subscription_code
        : null;
    if (!code) return;
    const { stored } = await syncSubscription(code);
    if (
      event.event === "invoice.update" &&
      data.paid &&
      data.status === "success" &&
      typeof data.transaction?.reference === "string"
    ) {
      await verifyPayment(data.transaction.reference, stored.id);
      await syncSubscription(code);
    }
  }
}
export function mountBillingWebhook(app: Express) {
  app.post(
    "/api/billing/webhook",
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
    express.raw({ type: "application/json", limit: "256kb" }),
    route(async (req, res) => {
      if (
        !Buffer.isBuffer(req.body) ||
        !validWebhookSignature(
          req.body,
          req.get("x-paystack-signature") || "",
          process.env.PAYSTACK_SECRET_KEY || "",
        )
      )
        fail("Invalid payment signature.", 401);
      requireConfiguration();
      const id = digest(req.body.toString("utf8"));
      if (await db.billingWebhook.findUnique({ where: { id } }))
        return res.json({ ok: true });
      const event = z
        .object({ event: z.string().max(80), data: z.unknown() })
        .parse(JSON.parse(req.body.toString("utf8")));
      await handleWebhook(event);
      await db.billingWebhook.upsert({
        where: { id },
        create: { id, type: event.event },
        update: {},
      });
      res.json({ ok: true });
    }),
  );
}
export function mountBilling(
  app: Express,
  access: (req: any, org: string, roles?: string[]) => Promise<void>,
) {
  app.get("/api/public/plans", (_req, res) =>
    res.json({
      currency: "NGN",
      interval: "monthly",
      plans: plans.map((p) => ({
        ...p,
        checkoutAvailable: p.amount === 0 || providerReady(p.id),
      })),
    }),
  );
  app.get(
    "/api/organizations/:id/billing",
    route(async (req, res) => {
      await access(req, req.params.id, ["ADMIN"]);
      const organization = await db.organization.findUniqueOrThrow({
        where: { id: req.params.id },
      });
      const subscriptions = await db.billingSubscription.findMany({
        where: { organizationId: organization.id },
        orderBy: { createdAt: "desc" },
      });
      const plan = planById(effectivePlan(organization.plan, subscriptions));
      const payments = await db.billingPayment.findMany({
        where: { organizationId: organization.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          reference: true,
          amount: true,
          status: true,
          paidAt: true,
          createdAt: true,
        },
      });
      const usage = await db.election.findMany({
        where: {
          organizationId: organization.id,
          status: {
            in: [
              "DRAFT",
              "REGISTRATION_OPEN",
              "VOTING_UPCOMING",
              "VOTING_OPEN",
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          name: true,
          status: true,
          _count: { select: { eligibility: true } },
        },
      });
      res.json({
        plan,
        plans: plans.map((p) => ({
          ...p,
          checkoutAvailable: p.amount === 0 || providerReady(p.id),
        })),
        subscriptions: subscriptions
          .filter((s) => s.paidUntil && s.paidUntil > new Date())
          .map((s) => ({
            id: s.id,
            plan: s.plan,
            status: s.status,
            paidUntil: s.paidUntil,
            cancellationRequested: s.cancellationRequested,
            manageable: Boolean(s.providerCode),
          })),
        payments,
        usage: usage.map((e) => ({
          id: e.id,
          name: e.name,
          status: e.status,
          registered: e._count.eligibility,
        })),
      });
    }),
  );
  app.post(
    "/api/organizations/:id/billing/checkout",
    route(async (req, res) => {
      await access(req, req.params.id, ["ADMIN"]);
      const user = requireUser(req);
      if (!user.emailVerified)
        fail("Verify your email before subscribing.", 403);
      const { plan: planId } = z
        .object({ plan: paidPlan, acceptedRecurringBilling: z.literal(true) })
        .parse(req.body);
      if (!providerReady(planId))
        fail("Subscription checkout is not available yet.", 503);
      const plan = planById(planId),
        code = providerCode(planId);
      const actual = await paystack("/plan/" + encodeURIComponent(code));
      if (
        actual.plan_code !== code ||
        actual.amount !== plan.amount ||
        actual.currency !== "NGN" ||
        actual.interval !== "monthly"
      )
        fail(
          "This subscription plan is unavailable. Please contact support.",
          503,
        );
      const payment = await serializable(async (tx) => {
        // Serialize checkouts for the same payer as well as the organization.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.email},3849))`;
        await tx.$queryRaw`SELECT id FROM evote."Organization" WHERE id=${req.params.id} FOR UPDATE`;
        const org = await tx.organization.findUniqueOrThrow({
          where: { id: req.params.id },
        });
        const subs = await tx.billingSubscription.findMany({
          where: { organizationId: org.id },
        });
        const current = effectivePlan(org.plan, subs);
        if (planRank(planId) <= planRank(current))
          fail(
            "Your current plan already includes this capacity. Cancel renewal and wait for the paid period to end before choosing a smaller plan.",
            409,
          );
        if (
          await tx.billingPayment.findFirst({
            where: {
              OR: [
                { organizationId: org.id },
                { subscription: { payerEmail: user.email } },
              ],
              status: "PENDING",
              createdAt: { gt: new Date(Date.now() - 30 * 60000) },
            },
          })
        )
          fail(
            "You have a checkout awaiting confirmation. Check its payment status before starting another.",
            409,
          );
        if (
          await tx.billingSubscription.findFirst({
            where: {
              payerEmail: user.email,
              providerCode: null,
              status: { in: ["ACTIVE", "NON_RENEWING"] },
            },
          })
        )
          fail(
            "Your previous payment is being linked to its subscription. Please wait for confirmation before starting another checkout.",
            409,
          );
        const sub = await tx.billingSubscription.create({
          data: {
            organizationId: org.id,
            plan: planId,
            providerPlanCode: code,
            payerEmail: user.email,
            amount: plan.amount,
          },
        });
        const payment = await tx.billingPayment.create({
          data: {
            reference: "EVT-" + randomUUID(),
            organizationId: org.id,
            subscriptionId: sub.id,
            actorId: user.id,
            amount: plan.amount,
          },
        });
        await audit(
          user.id,
          "SUBSCRIPTION_CHECKOUT_STARTED",
          org.id,
          undefined,
          "SUCCESS",
          tx,
        );
        return payment;
      });
      try {
        const checkout = await paystack("/transaction/initialize", {
          email: user.email,
          amount: plan.amount,
          currency: "NGN",
          reference: payment.reference,
          plan: code,
          channels: ["card"],
          callback_url:
            (process.env.APP_ORIGIN || "http://localhost:5174") +
            "/workspace/billing?organization=" +
            encodeURIComponent(req.params.id),
          metadata: JSON.stringify({
            application: "evote",
            reference: payment.reference,
          }),
        });
        const url = new URL(checkout.authorization_url);
        if (
          url.protocol !== "https:" ||
          url.hostname !== "checkout.paystack.com" ||
          checkout.reference !== payment.reference
        )
          fail("Unexpected payment redirect.", 502);
        res.json({ url: url.toString(), reference: payment.reference });
      } catch (error) {
        // Timeout can occur after Paystack accepted the request. Keep it reconcilable rather than falsely marking it unpaid.
        throw error;
      }
    }),
  );
  app.post(
    "/api/organizations/:id/billing/verify",
    route(async (req, res) => {
      await access(req, req.params.id, ["ADMIN"]);
      const { reference } = z
        .object({ reference: z.string().regex(/^EVT-[a-f0-9-]{36}$/) })
        .parse(req.body);
      const payment = await db.billingPayment.findUnique({
        where: { reference },
      });
      if (!payment || payment.organizationId !== req.params.id)
        fail("Payment not found.", 404);
      const confirmed = await verifyPayment(reference);
      res.json({ status: confirmed?.status || "PENDING" });
    }),
  );
  app.post(
    "/api/organizations/:id/billing/manage",
    route(async (req, res) => {
      await access(req, req.params.id, ["ADMIN"]);
      const { subscriptionId } = z
        .object({ subscriptionId: z.string().uuid() })
        .parse(req.body);
      const sub = await db.billingSubscription.findUnique({
        where: { id: subscriptionId },
      });
      if (!sub || sub.organizationId !== req.params.id || !sub.providerCode)
        return fail("Subscription management is not available yet.", 409);
      const result = await paystack(
        "/subscription/" +
          encodeURIComponent(sub.providerCode) +
          "/manage/link",
      );
      const url = new URL(result.link);
      if (url.protocol !== "https:" || url.hostname !== "paystack.com")
        fail("Unexpected subscription redirect.", 502);
      await audit(req.user.id, "SUBSCRIPTION_MANAGEMENT_OPENED", req.params.id);
      res.json({ url: url.toString() });
    }),
  );
  app.post(
    "/api/organizations/:id/billing/cancel",
    route(async (req, res) => {
      await access(req, req.params.id, ["ADMIN"]);
      const { subscriptionId } = z
        .object({ subscriptionId: z.string().uuid() })
        .parse(req.body);
      const sub = await db.billingSubscription.findUnique({
        where: { id: subscriptionId },
      });
      if (!sub || sub.organizationId !== req.params.id)
        return fail("Subscription not found.", 404);
      await serializable(async (tx) => {
        await tx.billingSubscription.update({
          where: { id: sub.id },
          data: { cancellationRequested: true },
        });
        await audit(
          req.user.id,
          "SUBSCRIPTION_CANCELLATION_REQUESTED",
          req.params.id,
          undefined,
          "SUCCESS",
          tx,
        );
      });
      res.json({
        ok: true,
        message:
          "Cancellation requested. Your paid access continues until the end of the paid period.",
      });
    }),
  );
}
