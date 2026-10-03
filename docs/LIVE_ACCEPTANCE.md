# Live acceptance without fictional seed data

Use only the actual organization and real consenting accounts designated by the project owner. No script should create fake users or sample elections. Before submitting any live ballot, the designated organizer must confirm the event and participation are authorized; submitted ballots cannot be changed.

## Setup checks

1. Save PostgreSQL connection strings privately; apply the prepared migration once. Confirm private schema tables, RLS, role grants, immutable triggers and private bucket settings.
2. Configure callback URLs, custom Auth SMTP and Google OAuth. Verify a real inbox receives the confirmation link and duplicate signup does not disclose account details.
3. Confirm an unverified account cannot sign in or receive a voting session. Confirm the first Google account completes consent and cannot assign roles through profile metadata.
4. Run auth:check, typecheck, build, security:scan and test:live. Record any failure as outstanding rather than passing.

## Real workflow

1. A confirmed organizer creates their real organization, sets branding, creates a draft election and its positions.
2. Add actual authorized candidates, review profile fields and uploaded image limits, then approve them.
3. Check invalid schedule/timezone/rule combinations are rejected by the server. Add real organization groups if required.
4. Open registration; invite a real designated voter. Confirm the invitation is bound to its recipient email and cannot grant eligibility alone.
5. The voter joins/registers and submits the organization’s actual required evidence. Confirm a manual upload cannot verify identity or date of birth. Use only a legally authorized provider for those claims.
6. An authorized reviewer approves election eligibility and the correct group/weight. Test moderator restrictions and document owner deletion/expiration.
7. Open voting at its configured time. Review single/multiple/approval/ranked/weighted rules for the actual configured positions, including keyboard preference ordering.
8. The authorized voter reviews and confirms the intended ballot. Verify the receipt contains no choice. Attempting another submission beyond the configured limit must be rejected, including simultaneous requests.
9. Close voting. Candidate, election and position edits must remain locked. Calculate and publish according to the configured policy; hidden totals must be unavailable even to admins before permitted publication.
10. Check recorded counts, participation denominators, winner/tie/round explanations, exports, announcements and audit integrity. The receipt must remain available in the participant dashboard.

## Security and usability acceptance

- Use real authorized accounts in two separate organizations to verify every admin/member/document/candidate/election/result/export/audit endpoint rejects cross-tenant IDs. Do not scan other organizations without authorization.
- Verify suspended/revoked sessions are rejected immediately, expired app sessions require fresh sign-in, CSRF failures reject mutations, role metadata cannot elevate access, and secrets never appear in JSON, browser bundles or logs.
- Test expected rate limits and abuse review notices during a controlled maintenance window. Do not flood a real election. Review CAPTCHA failures without treating a flag as an accusation.
- Check script-like names/biographies render as text, CSV/Excel values cannot become spreadsheet formulas, and rejected file types/large or malformed images cannot bypass upload checks.
- Test keyboard-only and screen-reader flows, visible focus, error announcements, login/OAuth redirects, and dialogs.
- Render at 320, 360, 390, 768, 1024, 1440 and 1920 pixels, landscape orientations and 200% zoom. Confirm no page-level horizontal scrolling, table scrolling stays inside its panel, menus work by keyboard, and controls remain usable on touch.
- Verify real password recovery, authenticator enrollment/challenge/removal, notifications, profile export, account deletion cleanup, and expiration worker execution.
- Perform a documented backup/restore drill on separate authorized recovery infrastructure. Include Auth and Storage bytes, role/RLS policies and separate key custody.

These procedures are an acceptance plan. The database is connected, all four migrations are applied, and 24 live readiness checks passed against the corrected API and real Supabase database. Email confirmation, Google OAuth, SMTP and Turnstile are configured. The protected scheduler supports recurring election/retention/outbox work. The owner is testing with an existing real account. Full real-user email/auth/recovery/voting acceptance, Paystack configuration and payment acceptance, and rendered browser/device verification remain outstanding.
