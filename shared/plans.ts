export const plans = [
  {
    id: "FREE",
    name: "Free",
    voters: 50,
    amount: 0,
    description: "A good place to bring your first community together.",
  },
  {
    id: "PRO",
    name: "Pro",
    voters: 100,
    amount: 1500000,
    description: "More room for clubs, classes, and growing associations.",
  },
  {
    id: "BUSINESS",
    name: "Business",
    voters: 1000,
    amount: 2500000,
    description: "For coordinators bringing larger communities to the ballot.",
  },
  {
    id: "ENTERPRISE",
    name: "Unlimited",
    voters: null,
    amount: 4000000,
    description: "Room for every eligible voice in your organization.",
  },
] as const;
export type PlanId = (typeof plans)[number]["id"];
export const planById = (id: string) =>
  plans.find((p) => p.id === id) || plans[0];
export const planRank = (id: string) => plans.findIndex((p) => p.id === id);
export function effectivePlan(
  manual: string,
  subscriptions: readonly {
    plan: string;
    status: string;
    paidUntil: Date | string | null;
  }[],
  now = new Date(),
) {
  return subscriptions.reduce(
    (current, sub) =>
      sub.paidUntil &&
      new Date(sub.paidUntil) > now &&
      ["ACTIVE", "NON_RENEWING", "PAST_DUE"].includes(sub.status) &&
      planRank(sub.plan) > planRank(current)
        ? sub.plan
        : current,
    planById(manual).id as string,
  );
}
export function nextBillingMonth(value: Date) {
  const result = new Date(value);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const last = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}
