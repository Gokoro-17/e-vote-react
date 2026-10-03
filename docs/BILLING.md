# Organization subscriptions

| Plan      | Registered voters per election | Monthly amount |
| --------- | -----------------------------: | -------------: |
| Free      |                             50 |             ₦0 |
| Pro       |                            100 |        ₦15,000 |
| Business  |                          1,000 |        ₦25,000 |
| Unlimited |            No subscription cap |        ₦40,000 |

The coordinator pays for their organization. Each election has its own capacity; a registered person occupies one place across all positions. Pending/rejected registrations also occupy places. All plans have the same implemented ballot protections. Unlimited removes the product cap, not the need to plan infrastructure capacity.

## Configure the actual providers

1. Fill `DATABASE_URL` and `DIRECT_URL` privately in the project's `.env` with the PostgreSQL connection details for **mdtymdvybaurguflwktt**. API publishable/secret keys are different from a database connection password. Apply both reviewed migrations using `npm.cmd run db:migrate`.
2. Set `PAYSTACK_SECRET_KEY` in that same private `.env` to the live secret key from your Paystack integration. This key is separate from Supabase's secret key. Never use a `VITE_` variable for it.
3. Run `npm.cmd run billing:setup`. It creates or reuses the three monthly NGN plans at the approved prices, validates their settings, and writes `PAYSTACK_PLAN_PRO`, `PAYSTACK_PLAN_BUSINESS`, and `PAYSTACK_PLAN_ENTERPRISE` into `.env`. It does not subscribe or charge anyone, edit unrelated plans, or change existing customer prices. Supplied plan codes must match the approved currency, amount, and interval.
4. Set the production `APP_ORIGIN` to the site's actual HTTPS origin. In the Paystack live integration settings, set the webhook to `https://YOUR_DOMAIN/api/billing/webhook`. A localhost address cannot receive Paystack webhooks. Restart the API when changing environment configuration.
5. Keep maintenance running: the persistent API runs it every 30 seconds, and Supabase Cron invokes the protected production endpoint every minute. A dedicated runner can also use `npm.cmd run worker:once`. Subscription association and durable cancellation requests depend on it.

Checkout stays unavailable until a live key and the matching plan code exist. The application has no pretend successful checkout, test subscriptions, fictitious payment ledger, or seeded users.

## Behavior and boundaries

- Only organization admins and super admins can view billing or initiate/manage/cancel that organization's subscription. All browser mutations require the existing Origin, session, CSRF, rate-limit, and role checks.
- Prices, plan codes, tenant IDs, recurring consent and verified account email are validated server-side. The server fetches the configured provider plan before starting checkout and checks amount, NGN, and monthly interval.
- Paystack hosts card collection and recurring payment management. No card number, CVV, reusable card authorization code, provider email token or full payment payload is saved in application tables. A hashed authorization signature is used to match a verified initial checkout to the correct provider subscription; ambiguous matches are refused.
- Payment activation requires a server-to-server verified live successful transaction, exact reference/amount/currency/customer match and valid paid timestamp. A return URL, request body, or subscription-created event cannot grant paid access by itself.
- Signed raw-body webhooks use timing-safe HMAC-SHA512 verification before processing. Event digests and unique transaction references make accepted duplicate events harmless. Failed processing remains retryable. Successful ledger entries are protected from changes/deletion by grants and triggers.
- The database checks registration capacity while locking the election row. Invitations, public registration, password entry, manual/provider verification and runoff creation all use that guard. An existing registration can be updated without consuming a second place. Capacity changes do not expose individual votes.
- A successful upgrade starts a new full-price paid monthly period. Once its provider subscription is matched, previous renewal is queued for cancellation. There is no proration; this is disclosed before checkout. Cancellation is a durable request until the provider confirms it. Original paid access continues through expiry.
- Plan expiry uses paid-through dates, so a missed renewal cannot leave indefinite paid entitlement. Existing registration/ballot records remain; voting does not depend on a current subscription. New registrations are subject to the current effective plan.
- Smaller-plan changes require cancellation and the end of the current paid period. Platform super admins can explicitly grant a manual organization plan; this is audited and is independent of paid subscriptions.
- Automated refunds, disputes, tax invoices, annual plans, grace-period credits, and multi-currency billing are not implemented. Real commercial terms and a refund/support policy must be supplied by the platform owner.

## Live acceptance

Use actual authorized organizations, accounts and approved live payments only. No script provisions test voters or payments.

1. Complete the database and provider configuration, then run `npm.cmd run test:live`. Its checks do not create records or make charges.
2. Use a confirmed organization admin to accept recurring billing and complete a chosen real payment. Verify the matching plan becomes active, the receipt appears in billing history, and another organization's admin cannot retrieve or verify that payment.
3. Confirm the public catalog advertises exactly the four approved tiers. Invite/register real designated participants. At each applicable boundary (50/100/1,000), a further distinct registration must fail, including simultaneous requests and alternate invitation/verification routes. Unlimited should have no subscription cap. Do not generate fictional participants to reach a boundary.
4. Re-deliver the legitimate signed event through the provider's event controls. Check one ledger row and one entitlement, with no additional month granted on duplicate processing. A forged/altered request must fail before any mutation.
5. Verify a genuine monthly renewal extends paid access, a failed renewal does not extend it, cancellation stops later debits, and an upgrade cancels the older renewal after the new subscription is associated. Verify existing voter access/results are retained after expiry.
6. Check mobile/touch and keyboard use, readable price/capacity/consent, Paystack return/cancellation paths, pending and failed payment feedback, and reduced-motion/paused hero animation.

**Not executed:** real checkout, recurring renewal, database capacity concurrency, and provider cancellation. All five database migrations are applied; these checks still require live Paystack credentials and real authorized accounts/payments. A successful build is not a payment acceptance test.

Provider references: [Paystack subscriptions](https://paystack.com/docs/payments/subscriptions/), [raw-body webhook signatures and retries](https://paystack.com/docs/payments/webhooks/), [transaction verification](https://paystack.com/docs/api/transaction/#verify), [subscription management API](https://paystack.com/docs/api/subscription/).
