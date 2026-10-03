# Vercel deployment

The Vite site and Express API deploy together. `api/index.ts` exports the existing
backend, and `vercel.json` sends `/api/*` requests to it before the SPA fallback.
The build regenerates Prisma Client and includes the public Supabase CA certificate.
No migrations run during deployment.

## Production settings

In the **e-vote-react** Vercel project, open **Settings → Environment Variables**.
Import the private `.artifacts/vercel-production.env` file into **Production**.
This file contains real credentials: do not commit, share or upload it anywhere
except this project's private environment-variable settings.

Values already configured locally are copied into that private file. Complete
these remaining settings using your real providers before redeploying:

- `SMTP_URL`: the application's authenticated SMTP transport URL.
- `MAIL_FROM`: an address approved by that SMTP provider.
- `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET`: a real Cloudflare Turnstile widget
  with `e-vote-react.vercel.app` allowed as a hostname.
- `CONTACT_EMAIL`: the real support/privacy contact address.

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

Vercel does not run the persistent server's 30-second timers. Run
`npm run worker:once` through a protected scheduled worker at least every minute
before relying on scheduled elections, document deletion, email notifications or
subscription maintenance. Configure this runner separately; deployment alone
does not create it. Do not use an unauthenticated public maintenance endpoint.

Paystack's live key and three monthly plan codes are separate from Auth setup.
Configure them using `docs/BILLING.md`, and set the live webhook URL to
`https://e-vote-react.vercel.app/api/billing/webhook` before offering paid checkout.
