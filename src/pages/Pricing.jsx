import { Link } from "react-router-dom";
import { ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import { plans, planRank } from "../../shared/plans.ts";
export const money = (amount) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount / 100);
export function PlanCards({
  current,
  onSelect,
  busy = false,
  checkoutAvailable = true,
  availability,
}) {
  return (
    <div className="pricing-grid">
      {plans.map((plan) => (
        <article
          key={plan.id}
          className={
            "pricing-card" + (plan.id === "BUSINESS" ? " pricing-featured" : "")
          }
        >
          <div className="pricing-card-top">
            <span className="eyebrow">{plan.name}</span>
            {plan.id === "BUSINESS" && (
              <span className="plan-highlight">For growing communities</span>
            )}
          </div>
          <h3>
            {money(plan.amount)}
            <span>{plan.amount ? "/ month" : "forever"}</span>
          </h3>
          <p className="plan-description">{plan.description}</p>
          <div className="plan-capacity">
            <strong>
              {plan.voters === null
                ? "Unlimited"
                : plan.voters.toLocaleString()}
            </strong>
            <span>voters per election</span>
          </div>
          <ul>
            {[
              "Multiple positions & voting methods",
              "Private ballots & vote receipts",
              "Eligibility & duplicate-vote checks",
              "Results, reports & audit trail",
            ].map((feature) => (
              <li key={feature}>
                <Check size={16} aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
          {onSelect ? (
            <button
              className={"btn " + (plan.id === "BUSINESS" ? "" : "alt")}
              disabled={
                busy ||
                current === plan.id ||
                !plan.amount ||
                !checkoutAvailable ||
                (current && planRank(plan.id) < planRank(current)) ||
                (availability &&
                  !availability.find((p) => p.id === plan.id)
                    ?.checkoutAvailable)
              }
              onClick={() => onSelect(plan)}
            >
              {current === plan.id
                ? "Your current plan"
                : current &&
                    plan.amount &&
                    planRank(plan.id) < planRank(current)
                  ? "Available after your paid period"
                  : plan.amount
                    ? "Choose " + plan.name
                    : "Included with your account"}
              <ArrowUpRight size={17} />
            </button>
          ) : (
            <Link
              className={"btn " + (plan.id === "BUSINESS" ? "" : "alt")}
              to={
                plan.amount ? "/workspace/billing?plan=" + plan.id : "/register"
              }
            >
              {plan.amount ? "Choose " + plan.name : "Start for free"}
              <ArrowUpRight size={17} />
            </Link>
          )}
        </article>
      ))}
    </div>
  );
}
export default function Pricing() {
  return (
    <div className="pg pricing-page">
      <div className="pricing-heading">
        <span className="eyebrow">ROOM FOR EVERY VOICE</span>
        <h1>
          Small community?
          <br />
          <span className="serif">Big election? You’re covered.</span>
        </h1>
        <p>
          Start with 50 voters, free. Give your organization more room when it
          needs it. One monthly subscription covers your organization’s
          elections.
        </p>
      </div>
      <PlanCards />
      <p className="pricing-note">
        <ShieldCheck size={18} />
        Every plan includes the same ballot privacy and participation
        safeguards.
      </p>
      <div className="pricing-details">
        <div>
          <h3>One voter. Every position.</h3>
          <p>
            Limits count distinct registered voters per election, including
            pending registrations. A person voting for several positions still
            occupies one place. Voters never pay to cast a ballot.
          </p>
        </div>
        <div>
          <h3>A plan for your organization.</h3>
          <p>
            Paid plans renew monthly through Paystack. Manage or cancel renewal
            from your workspace. Access continues through your paid period.
            Existing registrations and ballots remain if your plan expires; new
            registrations follow your current limit.
          </p>
        </div>
        <div>
          <h3>Unlimited means no voter cap.</h3>
          <p>
            The Unlimited plan removes the subscription limit on voters. Normal
            eligibility rules and abuse protection still apply. Contact us ahead
            of unusually large events to discuss capacity.
          </p>
        </div>
      </div>
      <section className="pricing-faq">
        <h2>A few things to know.</h2>
        {[
          [
            "Does the limit apply to my entire organization?",
            "It applies separately to each election. On Business, each election can accept up to 1,000 distinct registered voters. Your organization can run multiple elections.",
          ],
          [
            "Can I upgrade while registration is open?",
            "Yes. A verified upgrade increases the registration limit immediately. A new monthly period starts when you pay, and renewal of your previous subscription is cancelled. The previous payment is not prorated.",
          ],
          [
            "What happens if a renewal fails?",
            "Your paid access lasts until the end of the paid period. After that, new registrations use the Free limit. Existing voters can still participate in their elections, and recorded ballots are kept.",
          ],
          [
            "Can I pay less when I need fewer voters?",
            "Cancel renewal in your billing workspace. Your current plan stays available until the paid period ends; you can then select a smaller plan.",
          ],
        ].map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
