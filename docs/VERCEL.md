# Vercel deployment

The Vite site and Express API deploy together. `api/index.ts` exports the existing
backend, and `vercel.json` sends `/api/*` requests to it before the SPA fallback.
The build regenerates Prisma Client and includes the public Supabase CA certificate.
No migrations run during deployment.

## Production settings

In the **e-vote** Vercel project (the one serving `e-vote-react.vercel.app`), open
**Settings → Environment Variables**.
The Supabase, encryption, SMTP, Turnstile, contact and worker variables are saved
in **Production**. The local `.env` remains private; temporary environment exports
have been removed. When changing credentials, update the relevant production
variable directly and redeploy. Never upload `.env` to GitHub.

These provider values must remain configured:

- `SMTP_URL`: the application's authenticated SMTP transport URL.
- `MAIL_FROM`: an address approved by that SMTP provider.
- `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET`: a real Cloudflare Turnstile widget
  with `e-vote-react.vercel.app` allowed as a hostname.
- `CONTACT_EMAIL`: the real support/privacy contact address.
- `WORKER_SECRET`: the dedicated scheduler bearer secret, also protected in Supabase Vault.

Keep these deployment values:

```dotenv
APP_ORIGIN=https://e-vote-react.vercel.app
NODE_ENV=production
TRUST_PROXY=1
NODEJS_HELPERS=0
SUPABASE_CA_CERT_PATH=supabase/certs/prod-ca-2021.crt
```

`NODEJS_HELPERS=0` preserves Express's request parsing, including the raw bytes
needed for Paystack signature checks. Use the exact origin without a trailing
slash. Keep secret values in server environment variables, never `VITE_*`.

Production requests fail closed if the database, Auth, encryption, HTTPS origin,
SMTP or bot-protection configuration is missing. `/api/health` returns JSON
`setup_required` instead of a function startup crash while setup is incomplete.

In **Supabase → Authentication → URL Configuration**, save:

- Site URL: `https://e-vote-react.vercel.app`
- Redirect URL: `https://e-vote-react.vercel.app/api/auth/callback`
- Keep `http://localhost:5174/api/auth/callback` for local development.

The Google Cloud OAuth redirect URI remains
`https://mdtymdvybaurguflwktt.supabase.co/auth/v1/callback`. Email confirmation must
remain enabled. Supabase Auth's custom SMTP is configured separately from the
application's `SMTP_URL`.

After changing variables, redeploy the latest commit. Existing deployments do
not pick up environment changes. Check `/api/health` for `status: "ok"`, then
complete a real Google sign-in and a real email-confirmation registration.

## Scheduled work and billing

Vercel does not run the persistent server's 30-second timers. Supabase Cron calls
`POST /api/internal/maintenance` every minute with a dedicated bearer token read
from Vault. The endpoint rejects unauthenticated requests before database work,
uses a shared lease to prevent overlapping jobs and processes bounded batches.
It handles scheduled election states, document expiration, account cleanup,
notification campaigns, application email and configured billing reconciliation.

The scheduler extensions are versioned in the Supabase migrations. To provision
or update the job after a deployment or worker-secret rotation, run
`npm.cmd run db:migrate -- --schedule` with `APP_ORIGIN` set to the production
HTTPS origin and the same private `WORKER_SECRET` as Vercel. `DIRECT_URL` must be
the migration-owner connection. The token is never embedded in migration SQL or
cron command text. Inspect **Supabase → Integrations → Cron** for execution history;
the actual HTTP response is in `net._http_response`. Application-job history is
retained for seven days. A larger deployment should use a dedicated worker and
measure its processing capacity. `npm.cmd run worker:once` remains available.

Paystack's live key and three monthly plan codes are separate from Auth setup.
Configure them using `docs/BILLING.md`, and set the live webhook URL to
`https://e-vote-react.vercel.app/api/billing/webhook` before offering paid checkout.
