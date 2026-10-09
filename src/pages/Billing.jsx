import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  CreditCard,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import { api } from "../store.jsx";
import { date, Empty, Toast, Field, useLoad } from "../components.jsx";
import { PlanCards, money } from "./Pricing.jsx";
import { planById, planRank } from "../../shared/plans.ts";

export default function Billing({ organizations }) {
  const [params, setParams] = useSearchParams();
  const organization =
    organizations.find((o) => o.id === params.get("organization")) ||
    organizations[0];
  const billing = useLoad(
    organization ? `/organizations/${organization.id}/billing` : null,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [consent, setConsent] = useState(false);
  const verifiedRef = useRef("");
  const reference = params.get("reference") || params.get("trxref");
  const run = async (fn) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!organization || !reference || verifiedRef.current === reference)
      return;
    verifiedRef.current = reference;
    run(async () => {
      const result = await api(
        `/organizations/${organization.id}/billing/verify`,
        { reference },
      );
      if (result.status === "PAID")
        setMessage(
          "Payment verified. Your organization’s new voter limit is now available.",
        );
      await billing.load();
      const next = new URLSearchParams(params);
      next.delete("reference");
      next.delete("trxref");
      setParams(next, { replace: true });
    });
  }, [reference, organization?.id]);
  if (!organization)
    return (
      <Empty title="Create an organization first">
        Subscriptions belong to organizations.{" "}
        <Link to="/workspace/organizations">Create your organization</Link> to
        choose a plan.
      </Empty>
    );
  const data = billing.data;
  const choose = (plan) =>
    run(async () => {
      if (!consent)
        throw new Error("Please accept monthly renewal before continuing.");
      if (planRank(plan.id) <= planRank(data.plan.id))
        throw new Error(
          "Your current plan includes this capacity. Cancel renewal and choose a smaller plan after your paid period ends.",
        );
      if (!data.plans.find((p) => p.id === plan.id)?.checkoutAvailable)
        throw new Error(
          "Subscription checkout is not available yet. Please contact the team.",
        );
      const checkout = await api(
        `/organizations/${organization.id}/billing/checkout`,
        { plan: plan.id, acceptedRecurringBilling: true },
      );
      window.location.assign(checkout.url);
    });
  return (
    <>
      <p className="muted">
        A little more room for your community. Manage your organization’s plan,
        participation capacity, and monthly subscription.
      </p>
      <Field label="Organization">
        <select
          value={organization.id}
          onChange={(ev) => {
            setError("");
            setMessage("");
            setConsent(false);
            setParams({ organization: ev.target.value });
          }}
        >
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      <Toast
        error={error || billing.error}
        message={message}
        onClose={() => {
          setError("");
          setMessage("");
        }}
      />
      <button
        className="btn alt"
        disabled={busy || billing.loading}
        aria-busy={billing.loading}
        onClick={async () => {
          setError("");
          setMessage("");
          if (await billing.load()) setMessage("Billing refreshed.");
        }}
      >
        {billing.loading && <LoaderCircle className="spin" size={16} />}
        {billing.loading ? "Refreshing…" : "Refresh billing"}
      </button>
      {billing.loading && !data && <p>Loading your plan…</p>}
      {data && (
        <>
          <div className="panel billing-summary">
            <div>
              <span className="eyebrow">CURRENT PLAN</span>
              <h3>{data.plan.name}</h3>
              <p>
                {data.plan.voters === null
                  ? "Unlimited"
                  : data.plan.voters.toLocaleString()}{" "}
                registered voters per election
              </p>
            </div>
            <div>
              <CreditCard size={22} />
              <h3>
                {money(data.plan.amount)}
                {data.plan.amount ? " / month" : " — forever"}
              </h3>
              <p>Your voters participate free of charge.</p>
            </div>
          </div>
          {data.subscriptions.map((sub) => (
            <div className="panel billing-summary" key={sub.id}>
              <div>
                <h3>{planById(sub.plan).name} subscription</h3>
                <p>
                  Paid access through {date(sub.paidUntil)}
                  <br />
                  {sub.cancellationRequested || sub.status === "NON_RENEWING"
                    ? "Renewal cancelled or cancellation pending."
                    : sub.status === "PAST_DUE"
                      ? "Renewal needs attention. Update your payment method."
                      : "Renews monthly."}
                </p>
              </div>
              <div className="row">
                <button
                  className="btn alt"
                  disabled={busy || !sub.manageable}
                  onClick={() =>
                    run(async () => {
                      const response = await api(
                        `/organizations/${organization.id}/billing/manage`,
                        { subscriptionId: sub.id },
                      );
                      window.location.assign(response.url);
                    })
                  }
                >
                  Manage in Paystack <ArrowUpRight size={16} />
                </button>
                <button
                  className="btn alt"
                  disabled={
                    busy ||
                    sub.cancellationRequested ||
                    sub.status === "NON_RENEWING"
                  }
                  onClick={() =>
                    run(async () => {
                      const response = await api(
                        `/organizations/${organization.id}/billing/cancel`,
                        { subscriptionId: sub.id },
                      );
                      setMessage(response.message);
                      await billing.load();
                    })
                  }
                >
                  Cancel renewal
                </button>
              </div>
            </div>
          ))}
          <div className="billing-usage">
            <h3>Your election capacity</h3>
            <p className="muted">
              Each election has its own limit. Pending, verified, and rejected
              registrations all count as occupied places.
            </p>
            {data.usage.length ? (
              data.usage.map((e) => (
                <div className="panel" key={e.id}>
                  <div className="row between">
                    <span>{e.name}</span>
                    <strong>
                      {e.registered.toLocaleString()} /{" "}
                      {data.plan.voters === null
                        ? "Unlimited"
                        : data.plan.voters.toLocaleString()}{" "}
                      voters
                    </strong>
                  </div>
                  {data.plan.voters !== null && (
                    <progress
                      aria-label={`Registered voters in ${e.name}`}
                      value={Math.min(e.registered, data.plan.voters)}
                      max={data.plan.voters}
                    />
                  )}
                  {data.plan.voters !== null &&
                    e.registered >= data.plan.voters && (
                      <p className="muted">
                        New registration is full. Upgrade to add more voters.
                      </p>
                    )}
                </div>
              ))
            ) : (
              <p className="muted">
                Your election participation will appear here when you create an
                election.
              </p>
            )}
          </div>
          <h3>Choose how much room you need.</h3>
          {!data.plans.some((p) => p.amount && p.checkoutAvailable) && (
            <p className="muted">
              Paid checkout is not available yet. You can start with the Free
              plan.
            </p>
          )}
          <div className="billing-consent">
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(ev) => setConsent(ev.target.checked)}
              />
              <span>
                I agree to monthly automatic renewal at the price of the plan I
                select. I can cancel future renewal in this workspace. Upgrades
                begin a new paid month, cancel renewal of the previous plan, and
                are not prorated. <Link to="/terms">Subscription terms</Link>
              </span>
            </label>
          </div>
          <PlanCards
            current={data.plan.id}
            busy={busy}
            availability={data.plans}
            onSelect={choose}
            checkoutAvailable={data.plans.some(
              (p) => p.amount && p.checkoutAvailable,
            )}
          />
          <p className="pricing-note">
            <ShieldCheck size={17} />
            Payment details are handled by Paystack. E-Vote does not store card
            numbers.
          </p>
          <h3>Recent payments</h3>
          {data.payments.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Reference</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.reference}>
                      <td>{date(p.paidAt || p.createdAt)}</td>
                      <td>{money(p.amount)}</td>
                      <td>{p.status.toLowerCase()}</td>
                      <td className="payment-reference">{p.reference}</td>
                      <td>
                        {p.status === "PENDING" && (
                          <button
                            className="btn alt"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                const result = await api(
                                  `/organizations/${organization.id}/billing/verify`,
                                  { reference: p.reference },
                                );
                                setMessage(
                                  result.status === "PAID"
                                    ? "Payment verified. Your plan is active."
                                    : "Payment has not completed.",
                                );
                                await billing.load();
                              })
                            }
                          >
                            Check payment
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No payments yet.</p>
          )}
        </>
      )}
    </>
  );
}
