# E-Vote

A React voting workspace with a TypeScript REST backend and Supabase PostgreSQL, Auth, and Storage. Organization permissions, eligibility, schedules, candidate rules, and participation limits are validated on the server.

**Latest verification (2026-10-03):** 31 application tables are present in the private `evote` schema, with all five reviewed migrations applied. Select `evote` in Supabase Table Editor. The API is healthy, and 25 live readiness checks passed, including restricted database permissions, bot protection, sign-out cookie cleanup and ballot/identity separation. Email confirmation, Google OAuth, SMTP, Turnstile and required deployment settings are configured. Supabase Cron drives protected maintenance. Session validation uses the authoritative Supabase Auth endpoint; the RLS-blocked SQL session view has been retired. Real-account email/auth/recovery/voting acceptance, paid Paystack setup, device rendering and full security acceptance remain unverified. No application data is seeded.

The 45-section requirement audit is in [docs/IMPLEMENTATION_AUDIT.md](docs/IMPLEMENTATION_AUDIT.md). Explicit external requirements, optional features, and remaining limitations are marked there.

## Run locally

The actual application directory is:

C:\Users\hp\Downloads\e-vote-react\e-vote-react

Run these commands there, after configuration:

```powershell
npm.cmd install
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run dev
```

Open http://localhost:5174. The API listens on 127.0.0.1:3001 and Vite proxies /api. The app intentionally reports unavailable data while the database connection is incomplete; it never falls back to local fixtures.

## Connect the selected Supabase project

Project dashboard: https://supabase.com/dashboard/project/mdtymdvybaurguflwktt

Use the actual **.env**, not .env.example. API keys and encryption keys are already saved locally and must not be committed. The Supabase secret key belongs only on the backend. Rotate any secret shared in a conversation or other non-secret channel and replace its private .env value.

1. In Supabase, open **Connect** and choose a direct PostgreSQL connection or **Session pooler**.
2. Copy the connection string into **DATABASE_URL** and **DIRECT_URL** in .env. Replace the entire `[YOUR-PASSWORD]` placeholder, including its square brackets, with the project’s database password. URL-encode reserved password characters such as `@`, `#`, `?`, and `%`, and quote the complete URL in `.env`. API keys cannot replace the database password.
3. Use port 5432 for DIRECT_URL. A session pooler is useful when the machine cannot reach the project’s IPv6 direct host. The selected project must appear in the host or pooler username.
4. If TLS certificate verification requires it, download the project CA certificate from Database settings, save it privately, and set **SUPABASE_CA_CERT_PATH**. The migration runner verifies TLS rather than disabling certificate checking.
5. Run **npm.cmd run db:migrate**. It checks the target, executes the prepared SQL in a transaction, records its checksum, and refuses to overwrite an unrelated existing evote schema. It never seeds accounts, organizations, candidates, or ballots.

The active Supabase migrations are `supabase/migrations/20261002122506_secure_voting_platform.sql` and `supabase/migrations/20261002145813_subscription_billing.sql`. Prisma migration history in prisma/migrations is retained as historical schema evidence and is not the active deployment route. Do not run the old public-schema migrations against this project.

The connector account currently cannot access this project. The supplied API keys allow Auth/Storage access, but do not grant PostgreSQL DDL or Supabase management access. Reconnecting the plugin with the owning account is another way to enable migration work.

## Auth and email

Supabase Auth owns password storage, email confirmation, Google OAuth, password reset, phone verification when enabled, and authenticator factors. The application uses server PKCE cookies with HttpOnly/SameSite protections. No Supabase access or refresh token is stored in browser localStorage or returned by the JSON API.

Configure these under Supabase Authentication:

- Keep **Confirm email** enabled. The live project currently has it enabled; the application refuses registration if Supabase issues an unconfirmed signup session.
- Set the Site URL to APP_ORIGIN.
- Allow APP_ORIGIN/api/auth/callback as a redirect URL. Locally this is http://localhost:5174/api/auth/callback. Add the exact production HTTPS URL after deployment.
- Configure **custom SMTP** for dependable real-user delivery and appropriate sender/domain settings. Supabase’s default email service has restrictions and is not a production mail setup.
- Confirmation links use Supabase PKCE and should open in the browser where signup began. The verification page also accepts email OTP if the configured email includes a code. Recovery links open in the browser where recovery began.
- Optional TOTP setup is available at /account/security. Once enabled, voting and protected workspace operations require the stronger authentication level.
- Optional phone verification requires an SMS provider configured in Supabase plus ENABLE_PHONE_VERIFICATION=true.

### Google sign-in

Google is currently disabled in the live project. The button and server integration exist, but OAuth cannot work until the provider is configured.

1. Create a Google OAuth web client in Google Cloud and configure the consent screen.
2. Add http://localhost:5174 and the production origin as authorized JavaScript origins.
3. Add this authorized Google redirect URI: https://mdtymdvybaurguflwktt.supabase.co/auth/v1/callback
4. In Supabase **Authentication → Sign In / Providers → Google**, enable Google and enter the Google client ID and client secret.
5. Keep the application callback on Supabase’s allowed redirect list.
6. Test the real OAuth round trip. First-time Google accounts complete privacy consent on /onboarding. Provider metadata never assigns administrative roles.

Official reference: [Supabase Google OAuth guide](https://supabase.com/docs/guides/auth/social-login/auth-google).

### Election notifications

Application SMTP is separate from Supabase Auth email configuration. Set SMTP_URL and MAIL_FROM on the API host for invitations, verification decisions, voting receipts and published-results notifications. Outbox bodies are encrypted. Election announcements are batched through durable campaigns; account settings control optional email notices. In-app notices work without an email transport.

A real confirmed user can create an organization. There are no default login credentials. Before appointing the first platform administrator, the user must verify their email, finish onboarding, and enable an authenticator from **Account security**. Then run:

```powershell
npm.cmd run admin:bootstrap -- their-registered-email
```

The bootstrap tool refuses when an existing platform administrator is present or the target account has no verified authenticator. Subsequent assignments use the platform dashboard. Platform-wide reads require authenticator assurance, and role, suspension, organization, and platform-setting changes require a verification completed within the previous ten minutes.

## Storage and identity

The two buckets are already configured in the selected project. `npm.cmd run storage:setup` verifies their settings or creates them when absent. The migration also declares them:

- verification-documents: private; only encrypted ciphertext is uploaded by the server. No anonymous or authenticated browser Storage policy grants access.
- campaign-images: public organization/campaign imagery. JPEG/PNG inputs are decoded with pixel limits, normalized, resized and stripped of metadata before upload.

Verification documents accept PDF, JPEG or PNG up to 5 MB. Signature/MIME checks, access checks and encryption are server-side. Downloads are attachments through authorized API routes. Retention defaults to 30 days and can be configured from 1–90 days by platform administrators. A worker removes expired objects.

Document review can establish organization/student/geographic eligibility; it **cannot** establish authoritative identity or DOB. Configure a legally authorized HTTPS IDENTITY_PROVIDER_URL and its server-only token for identity verification. The interface receives requestId, userId and electionId and returns:

```json
{
  "requestId": "the-existing-request-id",
  "status": "VERIFIED | PENDING | REJECTED",
  "subject": "provider-stable-pseudonymous-identity-reference",
  "verifiedDob": "YYYY-MM-DD",
  "reference": "provider-reference"
}
```

These values describe the interface, not demo identity records. A verified response must include a stable subject. The platform HMACs it into a unique fingerprint; changing an established identity requires an authorized correction procedure. Age calculations use verified DOB and the election timezone. No fake government database or identity provider is shipped.

The provider contract must authenticate its requests/results, define correction/recovery/privacy procedures, and receive independent integration review. Formal-election demonstrations require that provider before voting.

## Pages

Public: /, /pricing, /elections, /elections/:id, /elections/:id/results, /candidates/:id, /organizations, /organizations/:id, /security, /faq, /contact, /privacy, /terms.

Auth: /login, /register, /verify-email, /forgot-password, /reset-password, /onboarding, /two-factor.

Participant: /dashboard, /elections/:id/vote, /account, /account/security, /notifications, /invitations/:token.

Organizer: /workspace/overview, /workspace/organizations, /workspace/new, /workspace/elections, /workspace/voters, /workspace/candidates, /workspace/verification, /workspace/results, /workspace/analytics, /workspace/audit-logs, /workspace/security, /workspace/settings, /workspace/billing.

Platform administrator: /workspace/platform. /admin redirects into the new workspace.

## Server and database boundaries

App tables are in private schema evote with RLS enabled and no schema/table grants for anon/authenticated. Keep evote out of the exposed Supabase Data API schemas. The migration defines NOLOGIN role evote_server with backend-only policies and restricted append-only grants. For production, use a dedicated login role inheriting evote_server; its password must be provisioned privately. Database owner credentials are for migration, not routine application hosting.

Each authenticated request calls Supabase Auth `getUser` to validate the signed token, identity and active session. The project's Auth v2.197.0 rejects deleted session IDs at its `/user` endpoint. The private application Session adds expiration, CSRF, consent and role checks. The old SQL session view was retired because managed Auth RLS hides its rows from the restricted app login; no application grants or bypass policies remain on Auth sessions. See [the deployed Auth version's session validation](https://github.com/supabase/auth/blob/v2.197.0/internal/api/auth.go#L108) and [getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

The API validates the current user through Supabase Auth; application sessions expire after eight hours. Server-owned database roles determine platform and organization permissions. State transitions are constrained by code and database triggers. Draft rules/positions lock before voting; candidate profiles lock when voting begins.

Database connections require TLS and strict certificate validation. If the project requires a custom CA, download its certificate through the Supabase dashboard and set SUPABASE_CA_CERT_PATH privately. The migration runner and backup tools also verify certificates; they do not disable verification to bypass connection errors. See the [Prisma PostgreSQL connection reference](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql).

The workspace searches and pages elections, voters and verification requests. Aggregate statistics cover the authorized scope, independent of the current page. Published positions configured for a runoff can create a linked draft with the two leading candidates and any candidates tied at the cutoff. Existing verified registrations carry forward; eligibility and schedules are rechecked for voting. The preceding election and its ballots remain closed and unchanged.

Ballot records contain no voter, receipt, IP, session or exact timestamp. Participation and receipts are separate. A serializable transaction, election row lock, composite participation key and count trigger prevent concurrent excess submissions. Ballot ciphertext is immutable and integrity-checked before tallying.

This is not blind-signature or end-to-end verifiable voting. Privileged operators, database transaction/WAL metadata and infrastructure timing can create correlation risks. See [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md). Independent security review is required; software correctness does not certify government election suitability.

General votes enforce account/organization eligibility. One verified account is not necessarily one person. Formal demonstration mode additionally requires a provider-verified unique identity, equal weighting and one submission per position.

Result visibility is enforced on the server, including for admins. Public live totals refresh every 15 seconds. Closed results are snapshotted before publication. Multiple-choice/approval percentages are shares of selections; weighted totals use approved weights. Ranked elimination ties are reported instead of broken arbitrarily. Runoff requirements are flagged for an organizer’s authorized further election.

## Live verification

No script creates fictional application data. These checks are available:

```powershell
npm.cmd run auth:check
npm.cmd run typecheck
npm.cmd run build
npm.cmd run security:scan
npm.cmd run test:live
```

auth:check only reads provider and bucket settings and does not print keys. test:live checks real running API headers, unauthenticated access, Origin protection, provider settings, private schema RLS and ballot columns. It exits unsuccessfully if setup/checks are incomplete. It never creates voters or casts ballots.

The pure calculation/cryptography test source is retained for CI under npm.cmd test. It does not seed a database. The previous fake-account integration writers were removed. Per your instruction, this change is being verified with live readiness checks and build/type checks; real-account workflow acceptance is described in [docs/LIVE_ACCEPTANCE.md](docs/LIVE_ACCEPTANCE.md).

Browser control is unavailable in this session. Responsive CSS was rebuilt for small mobile, tablet and desktop layouts, but rendered device/screenshots/accessibility testing is still required before claiming universal compatibility.

## Deployment and operations

The frontend is a Vite build, and the backend requires a Node runtime. A static frontend deployment must proxy /api to the same-origin backend. APP_ORIGIN must be the exact public origin; OAuth and cookie endpoints must share it.

Vercel deployment is configured in `vercel.json` and `api/index.ts`, so the Vite website and Express API are deployed together. Follow [docs/VERCEL.md](docs/VERCEL.md) for production environment variables, Auth URLs and scheduled-worker setup.

Production requests require HTTPS APP_ORIGIN, app SMTP and both Turnstile credentials. Missing configuration returns a JSON setup response and blocks sensitive operations. Set HOST as appropriate for a persistent API host and TRUST_PROXY only when the deployment really has a trusted proxy. Do not expose the backend across unrestricted proxy chains.

The persistent API runs cleanup/scheduling/outbox maintenance every 30 seconds. Supabase Cron invokes the protected production maintenance endpoint every minute; a database lease prevents overlapping workers. Provision or update it with **npm.cmd run db:migrate -- --schedule**, using the production HTTPS APP_ORIGIN and the same private WORKER_SECRET as Vercel. The scheduler token is stored in Vault. **npm.cmd run worker:once** is also available for a dedicated runner. Document expiration, notification campaigns, account deletion cleanup and scheduled election transitions depend on successful worker execution.

Supabase database backups do not automatically include Storage object bytes. Coordinate PostgreSQL, Auth, private object snapshots and encryption keys. The optional db:backup command creates an encrypted application-schema dump; it is not a complete Supabase project backup. db:restore refuses the live host/database and restores transactionally into a separate empty recovery database. Restore objects/policies/roles/Auth mapping separately and perform a documented recovery drill.

Configure alert thresholds, backup retention, capacity monitoring, incident response, legal identity, privacy contact and approved deployment-specific terms before real public use. Obtain applicable Nigerian data-protection/legal review before collecting real voter identity data.

## Subscriptions

The organization plans are Free (50 registered voters per election), Pro (100, ₦15,000/month), Business (1,000, ₦25,000/month), and Unlimited (no subscription voter cap, ₦40,000/month). Each distinct registration, including pending/rejected eligibility, occupies one place across all positions. Voters do not pay. All plans include the existing election safeguards; the capacity is what changes.

Billing uses Paystack hosted recurring card checkout. Add the live secret key to **PAYSTACK_SECRET_KEY in .env**, then run **npm.cmd run billing:setup** to create/reuse the three correctly priced monthly provider plans and save their codes privately. This setup does not subscribe or charge a customer. Restart the API and configure Paystack's live webhook to **https://YOUR_DOMAIN/api/billing/webhook**. See [docs/BILLING.md](docs/BILLING.md).

Apply the application baseline and billing migrations using **npm.cmd run db:migrate** after setting the correct private PostgreSQL connection. All five migrations were applied to the selected Supabase project on 2026-10-03; live checks confirmed the capacity trigger and database privacy controls. Real checkout, recurring renewal, capacity concurrency, and provider cancellation still require live acceptance testing. Source implementation and successful build checks are not payment acceptance tests.

Payment amounts/currency, tenant access, signatures, provider transactions and payment references are checked on the server. A redirect cannot activate a plan. Payment records are unique and confirmed ledger entries are immutable. Registration capacity is guarded by an election row lock and database trigger shared by all eligibility insertion paths. Cancellation is durable and processed by maintenance; keep the API worker running. Expiry changes new-registration limits without revoking existing voters or ballots. Upgrades start a new full-price monthly period and request cancellation of older renewal after the new provider subscription is linked. There is no proration or automated refund workflow.
