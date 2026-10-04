import { useState } from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
  useParams,
} from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  MailCheck,
  ShieldCheck,
  KeyRound,
  Bell,
  LockKeyhole,
  CheckCircle2,
  Copy,
  ExternalLink,
} from "lucide-react";
import { api, useStore } from "../store.jsx";
import {
  ActionForm,
  Field,
  Captcha,
  useLoad,
  date,
  Feedback,
  PageHeading,
  Loading,
  LoadError,
  Empty,
  Badge,
  ImageUpload,
} from "../components.jsx";
const localReturnPath = (value) =>
  value?.startsWith("/") &&
  !value.startsWith("//") &&
  !value.includes("\\") &&
  !/[\r\n]/.test(value)
    ? value
    : "";
const withReturnPath = (path, next) =>
  path + (next ? "?next=" + encodeURIComponent(next) : "");
function GoogleMark() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92c-.25 1.27-1 2.35-2.11 3.07v2.56h3.4c1.98-1.83 3.35-4.52 3.35-7.5Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.83 0 5.2-.94 6.93-2.54l-3.4-2.56c-.94.63-2.14 1.01-3.53 1.01-2.72 0-5.03-1.84-5.86-4.3H2.63v2.64A10.99 10.99 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M6.14 14.61a6.6 6.6 0 0 1 0-4.22V7.75H2.63a11 11 0 0 0 0 9.5l3.51-2.64Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.09c1.54 0 2.91.53 4 1.57l3-3A10.6 10.6 0 0 0 12 1a11 11 0 0 0-9.37 6.75l3.51 2.64C6.97 6.93 9.28 5.09 12 5.09Z"
      />
    </svg>
  );
}
export function Auth({ register = false }) {
  const { auth, configured } = useStore(),
    providers = useLoad("/public/config"),
    go = useNavigate(),
    [params] = useSearchParams(),
    [googleError, setGoogleError] = useState(""),
    [googleBusy, setGoogleBusy] = useState(false);
  const safeNext = localReturnPath(params.get("next"));
  const google = async (form) => {
    setGoogleBusy(true);
    setGoogleError("");
    try {
      const data = await api("/auth/google", {
        captcha: new FormData(form).get("captcha") || "",
        next: safeNext || undefined,
      });
      window.location.assign(data.url);
    } catch (e) {
      setGoogleError(e.message);
      setGoogleBusy(false);
      form.dispatchEvent(new Event("evote:captcha-reset"));
    }
  };
  return (
    <div className="pg auth-layout auth-simple">
      <ActionForm
        className="f auth-panel"
        success=""
        onSubmit={async (f) => {
          if (googleBusy)
            throw new Error("Google sign-in is opening. Please wait.");
          const result = await auth(register ? "register" : "login", {
            ...f,
            consent: f.consent === "on",
            next: safeNext || undefined,
          });
          if (register)
            go(
              "/verify-email?email=" +
                encodeURIComponent(f.email) +
                (safeNext ? "&next=" + encodeURIComponent(safeNext) : ""),
            );
          else
            go(
              result.needsMfa
                ? withReturnPath("/two-factor", safeNext)
                : result.user.consentAt
                  ? safeNext || "/dashboard"
                  : withReturnPath("/onboarding", safeNext),
            );
        }}
      >
        <Link className="auth-back" to="/">
          <ArrowLeft size={15} /> Back to home
        </Link>
        <h2>{register ? "Create an account" : "Sign in to E-Vote"}</h2>
        <p className="muted">
          {register
            ? "Use Google or your email address."
            : "Use Google or enter your email and password."}
        </p>
        {!configured && (
          <Feedback error="Account access is awaiting the administrator’s Supabase configuration." />
        )}
        {params.has("error") && (
          <Feedback
            error={
              params.get("error") === "access_denied"
                ? "Sign-in was cancelled. You can try again or sign in with email."
                : "The sign-in link could not be completed. Please try again."
            }
          />
        )}
        {params.has("reset") && (
          <Feedback message="Password updated. Sign in with your new password." />
        )}
        <button
          type="button"
          className="btn google-btn"
          disabled={googleBusy || providers.data?.googleEnabled === false}
          onClick={(ev) => google(ev.currentTarget.form)}
        >
          <GoogleMark />
          {googleBusy ? "Connecting…" : "Continue with Google"}
        </button>
        <Feedback error={googleError} />
        {providers.data?.googleEnabled === false && (
          <small className="muted">
            Google sign-in is being configured. You can use email once account
            setup is complete.
          </small>
        )}
        <div className="divider">
          <span>or continue with email</span>
        </div>
        {register && (
          <Field
            label="Full name"
            name="name"
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
          />
        )}
        <Field
          label="Email address"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@organization.com"
        />
        <Field
          label={register ? "Create a password" : "Password"}
          name="password"
          type="password"
          minLength={register ? 12 : 1}
          maxLength={128}
          required
          autoComplete={register ? "new-password" : "current-password"}
          hint={register ? "Use at least 12 characters." : undefined}
        />
        {register ? (
          <label className="check-label">
            <input name="consent" type="checkbox" required />
            <span>
              I agree to the <Link to="/terms">terms</Link> and the{" "}
              <Link to="/privacy">privacy notice</Link>.
            </span>
          </label>
        ) : (
          <Link className="small-link" to="/forgot-password">
            Forgot your password?
          </Link>
        )}
        <Captcha />
        <button className="btn btn-full" disabled={googleBusy}>
          {register ? "Create account" : "Sign in"} <ArrowRight size={17} />
        </button>
        <p className="auth-switch">
          {register ? (
            <>
              Have an account?{" "}
              <Link to={withReturnPath("/login", safeNext)}>Sign in</Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link to={withReturnPath("/register", safeNext)}>
                Create an account
              </Link>
            </>
          )}
        </p>
      </ActionForm>
    </div>
  );
}
export function VerifyEmail() {
  const [params] = useSearchParams(),
    { auth } = useStore(),
    go = useNavigate();
  const safeNext = localReturnPath(params.get("next"));
  return (
    <div className="pg narrow">
      <div className="auth-icon">
        <MailCheck size={30} />
      </div>
      <PageHeading eyebrow="EMAIL CONFIRMATION" title="Check your inbox.">
        Open the message from E-Vote and select Confirm email. We’ll bring you
        back here and sign you in.
      </PageHeading>
      {params.has("expired") && (
        <Feedback error="We couldn’t finish this sign-in link. If your email is already confirmed, sign in with your password. Otherwise, request a new confirmation email below." />
      )}
      <div className="panel email-next-step">
        <MailCheck size={24} />
        <div>
          <b>Use the confirmation link in your email</b>
          <p className="muted">
            Keep this page open. If you already confirmed your address, return
            to sign in.
          </p>
        </div>
        <Link className="btn alt" to={withReturnPath("/login", safeNext)}>
          Go to sign in
        </Link>
      </div>
      <details className="panel">
        <summary>My email contains a confirmation code</summary>
        <ActionForm
          className="f"
          onSubmit={async (f) => {
            const result = await auth("verify-email", f);
            go(
              result.needsMfa
                ? withReturnPath("/two-factor", safeNext)
                : result.user.consentAt
                  ? safeNext || "/dashboard"
                  : withReturnPath("/onboarding", safeNext),
            );
          }}
          success=""
        >
          <Field
            label="Email address"
            name="email"
            type="email"
            defaultValue={params.get("email") || ""}
            autoComplete="email"
            required
          />
          <Field
            label="Confirmation code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            required
          />
          <button className="btn btn-full">
            Confirm email <ArrowRight size={16} />
          </button>
        </ActionForm>
      </details>
      <details className="panel">
        <summary>Didn’t receive the email?</summary>
        <p className="muted">
          Check your spam folder and make sure your address is correct.
        </p>
        <ActionForm
          className="f"
          success="If confirmation is needed, another email will arrive shortly."
          onSubmit={(f) => api("/auth/resend-verification", f)}
        >
          <Field
            label="Email address"
            name="email"
            type="email"
            defaultValue={params.get("email") || ""}
            required
          />
          <Captcha />
          <button className="btn alt">Resend confirmation</button>
        </ActionForm>
      </details>
      <Link className="text-link" to={withReturnPath("/login", safeNext)}>
        <ArrowLeft size={16} /> Back to sign in
      </Link>
    </div>
  );
}
export function ForgotPassword() {
  return (
    <div className="pg narrow">
      <div className="auth-icon">
        <KeyRound size={28} />
      </div>
      <PageHeading eyebrow="ACCOUNT RECOVERY" title="Forgot your password?">
        We’ll send you a link to choose a new one. Open it in the same browser.
      </PageHeading>
      <ActionForm
        success="If this account exists, a password reset email will arrive shortly."
        onSubmit={(f) => api("/auth/forgot-password", f)}
      >
        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <Captcha />
        <button className="btn btn-full">
          Send reset link <ArrowRight size={16} />
        </button>
      </ActionForm>
      <Link className="text-link" to="/login">
        <ArrowLeft size={16} /> Back to sign in
      </Link>
    </div>
  );
}
export function ResetPassword() {
  const { refresh } = useStore(),
    go = useNavigate();
  return (
    <div className="pg narrow">
      <PageHeading eyebrow="ACCOUNT RECOVERY" title="Choose a new password.">
        Use a strong password you haven’t used before.
      </PageHeading>
      <ActionForm
        success=""
        onSubmit={async (f) => {
          if (f.password !== f.confirm)
            throw new Error("The passwords do not match.");
          try {
            await api("/auth/reset-password", { password: f.password });
          } finally {
            await refresh();
          }
          go("/login?reset=1");
        }}
      >
        <Field
          label="New password"
          name="password"
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
        <Field
          label="Confirm password"
          name="confirm"
          type="password"
          minLength={12}
          autoComplete="new-password"
          required
        />
        <button className="btn btn-full">Update password</button>
      </ActionForm>
    </div>
  );
}
export function Onboarding() {
  const { user, auth } = useStore(),
    go = useNavigate(),
    [params] = useSearchParams();
  const safeNext = localReturnPath(params.get("next"));
  return (
    <div className="pg narrow">
      <PageHeading eyebrow="WELCOME TO E-VOTE" title="One last step.">
        Review how your account information is used before joining your
        community.
      </PageHeading>
      {user ? (
        <ActionForm
          success=""
          onSubmit={async (f) => {
            await auth("consent", {
              name: f.name,
              consent: f.consent === "on",
            });
            go(safeNext || "/dashboard");
          }}
        >
          <Field
            label="Your name"
            name="name"
            defaultValue={user.name}
            minLength={2}
            required
          />
          <p className="muted">
            We use your account to check access and eligibility, send
            confirmations, and maintain participation records. Your ballots are
            stored separately.
          </p>
          <label className="check-label">
            <input name="consent" type="checkbox" required />
            <span>
              I agree to the <Link to="/terms">terms of use</Link> and{" "}
              <Link to="/privacy">privacy notice</Link>.
            </span>
          </label>
          <button className="btn btn-full">
            Finish creating account <ArrowRight size={16} />
          </button>
        </ActionForm>
      ) : (
        <Link className="btn" to={withReturnPath("/login", safeNext)}>
          Sign in to continue
        </Link>
      )}
    </div>
  );
}
export function TwoFactor() {
  const { user, refresh } = useStore(),
    security = useLoad(user ? "/auth/security" : null),
    go = useNavigate(),
    [params] = useSearchParams();
  const safeNext = localReturnPath(params.get("next"));
  const factors =
    security.data?.factors.filter((f) => f.status === "verified") || [];
  return (
    <div className="pg narrow">
      <div className="auth-icon">
        <LockKeyhole size={28} />
      </div>
      <PageHeading eyebrow="TWO-STEP VERIFICATION" title="Verify it’s you.">
        Enter the six-digit code from your authenticator app.
      </PageHeading>
      {!user ? (
        <Link className="btn" to={withReturnPath("/login", safeNext)}>
          Sign in
        </Link>
      ) : security.loading ? (
        <Loading />
      ) : security.error ? (
        <LoadError error={security.error} retry={security.load} />
      ) : (
        <ActionForm
          success=""
          onSubmit={async (f) => {
            await api("/auth/mfa/verify", f);
            await refresh();
            go(
              user.consentAt
                ? safeNext || "/dashboard"
                : withReturnPath("/onboarding", safeNext),
            );
          }}
        >
          <Field label="Authenticator">
            <select name="factorId" required>
              {factors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.friendly_name || "Authenticator"}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Verification code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            required
            autoFocus
          />
          <button className="btn btn-full">Verify and continue</button>
        </ActionForm>
      )}
    </div>
  );
}
function AccountNav() {
  return (
    <div className="account-nav">
      <Link to="/account">Profile & privacy</Link>
      <Link to="/account/security">Account security</Link>
      <Link to="/notifications">Notifications</Link>
      <Link to="/dashboard">Voting dashboard</Link>
    </div>
  );
}
export function Account() {
  const { user, refresh } = useStore(),
    verification = useLoad("/verification/status"),
    memberships = useLoad("/account/memberships"),
    membershipRequests = useLoad("/account/membership-requests"),
    [remove, setRemove] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="pg">
      <PageHeading eyebrow="YOUR ACCOUNT" title="Profile & privacy">
        Your details, your documents, and control over your data.
      </PageHeading>
      <AccountNav />
      <div className="grid two-columns">
        <ActionForm
          onSubmit={async (f) => {
            await api(
              "/account",
              {
                name: f.name,
                emailNotifications: f.emailNotifications === "on",
              },
              "PATCH",
            );
            await refresh();
          }}
        >
          <h3>Personal details</h3>
          <Field
            label="Full name"
            name="name"
            defaultValue={user.name}
            minLength={2}
            required
          />
          <Field label="Verified email" value={user.email} readOnly />
          <p className="verified-line">
            <CheckCircle2 size={16} /> Email confirmed
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              name="emailNotifications"
              defaultChecked={user.emailNotifications}
            />
            <span>Email me about elections and account activity.</span>
          </label>
          <button className="btn">Save changes</button>
        </ActionForm>
        <div className="panel">
          <ShieldCheck size={26} />
          <h3>Your data, under your control</h3>
          <p className="muted">
            Download your profile, eligibility records, and voting receipts.
            Your export contains no ballot selections.
          </p>
          <a className="btn alt" href="/api/account/export">
            Download my data <ExternalLink size={16} />
          </a>
          <p className="muted">
            Learn more about{" "}
            <Link to="/privacy">retention and data processing</Link>.
          </p>
        </div>
      </div>
      <section className="s">
        <h2>Organization memberships</h2>
        {memberships.loading || membershipRequests.loading ? (
          <Loading />
        ) : memberships.error || membershipRequests.error ? (
          <LoadError
            error={memberships.error || membershipRequests.error}
            retry={() => {
              memberships.load();
              membershipRequests.load();
            }}
          />
        ) : memberships.data?.length || membershipRequests.data?.length ? (
          <div className="panel">
            {memberships.data?.map((membership) => (
              <div className="notification" key={membership.organizationId}>
                <div>
                  <b>{membership.organization.name}</b>
                  <p>{statusType(membership.role)} membership</p>
                </div>
                <Badge value="APPROVED" />
              </div>
            ))}
            {membershipRequests.data
              ?.filter((request) => request.status !== "APPROVED")
              .map((request) => (
                <div className="notification" key={request.organizationId}>
                  <div>
                    <b>{request.organization.name}</b>
                    <p>
                      {request.status === "PENDING"
                        ? "Waiting for an organization administrator"
                        : "Membership request declined"}
                    </p>
                  </div>
                  <Badge value={request.status} />
                </div>
              ))}
          </div>
        ) : (
          <Empty title="No organization memberships yet">
            Request to join from an organization’s public page.
          </Empty>
        )}
      </section>
      <section className="s">
        <h2>Verification documents</h2>
        {verification.loading ? (
          <Loading />
        ) : verification.error ? (
          <LoadError error={verification.error} retry={verification.load} />
        ) : verification.data?.length ? (
          <div className="panel">
            {verification.data.map((v) => (
              <div className="notification" key={v.id}>
                <div>
                  <Badge value={v.status} />
                  <h3>{statusType(v.type)}</h3>
                  <p>{v.note}</p>
                  {v.document && (
                    <small className="muted">
                      Expires {date(v.document.expiresAt)}
                    </small>
                  )}
                </div>
                {v.document && (
                  <button
                    className="btn alt"
                    onClick={async () => {
                      try {
                        await api(
                          "/documents/" + v.document.id,
                          undefined,
                          "DELETE",
                        );
                        verification.load();
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    Delete document
                  </button>
                )}
              </div>
            ))}
            <Feedback error={error} />
          </div>
        ) : (
          <Empty title="No verification requests">
            Eligibility checks for your elections will appear here.
          </Empty>
        )}
      </section>
      <CandidateProfiles />
      <section className="s">
        <div className="panel danger-zone">
          <h3>Delete your account</h3>
          <p className="muted">
            Your profile and verification documents will be removed.
            Pseudonymous participation records and anonymous ballots are
            retained to protect election integrity. Transfer any organization
            you administer first.
          </p>
          {remove ? (
            <ActionForm
              className="f"
              success=""
              onSubmit={async (f) => {
                await api("/account", f, "DELETE");
                await refresh();
              }}
            >
              <p>
                Sign in again if your last sign-in was more than 10 minutes ago.
              </p>
              <Field
                label="Type DELETE MY ACCOUNT to confirm"
                name="confirmation"
                required
              />
              <div className="row">
                <button className="btn danger">
                  Permanently delete account
                </button>
                <button
                  type="button"
                  className="btn alt"
                  onClick={() => setRemove(false)}
                >
                  Cancel
                </button>
              </div>
            </ActionForm>
          ) : (
            <button
              className="btn danger-outline"
              onClick={() => setRemove(true)}
            >
              Delete account
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
const statusType = (type) => type.charAt(0) + type.slice(1).toLowerCase();
function CandidateProfiles() {
  const { data, error, loading, load } = useLoad("/account/candidates");
  return (
    <section className="s">
      <h2>Your candidate profiles</h2>
      {loading ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={load} />
      ) : data?.length ? (
        data.map((c) => (
          <details className="panel" key={c.id}>
            <summary>
              {c.name} · {c.position.title} · {statusType(c.status)}
            </summary>
            <p className="muted">{c.position.election.name}</p>
            {["DRAFT", "REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(
              c.position.election.status,
            ) ? (
              <>
                <ActionForm
                  className="f"
                  onSubmit={async (f) => {
                    await api(
                      "/candidates/" + c.id,
                      {
                        ...f,
                        socialLinks: f.socialLinks
                          ? f.socialLinks.split("\n").filter(Boolean)
                          : [],
                      },
                      "PATCH",
                    );
                    load();
                  }}
                  success="Your changes have been submitted for approval."
                >
                  <Field
                    label="Name"
                    name="name"
                    defaultValue={c.name}
                    required
                  />
                  <Field label="Biography">
                    <textarea
                      name="bio"
                      defaultValue={c.bio}
                      maxLength={2000}
                    />
                  </Field>
                  <Field label="Manifesto">
                    <textarea
                      name="manifesto"
                      defaultValue={c.manifesto}
                      maxLength={5000}
                    />
                  </Field>
                  <Field label="Campaign statement">
                    <textarea
                      name="campaign"
                      defaultValue={c.campaign}
                      maxLength={2000}
                    />
                  </Field>
                  <Field label="Campaign links, one URL per line">
                    <textarea
                      name="socialLinks"
                      defaultValue={c.socialLinks?.join("\n")}
                    />
                  </Field>
                  <button className="btn">Save for review</button>
                </ActionForm>
                <ImageUpload
                  type="CANDIDATE"
                  candidateId={c.id}
                  onSaved={load}
                />
              </>
            ) : (
              <p>Profile changes are locked because voting has started.</p>
            )}
          </details>
        ))
      ) : (
        <Empty title="Ready to stand for election?">
          Apply from an election page while candidate registration is open.
        </Empty>
      )}
    </section>
  );
}
export function AccountSecurity() {
  const { refresh } = useStore(),
    security = useLoad("/auth/security"),
    [enrollment, setEnrollment] = useState(null),
    [error, setError] = useState("");
  const act = async (fn) => {
    try {
      setError("");
      await fn();
      security.load();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <div className="pg">
      <PageHeading eyebrow="YOUR ACCOUNT" title="Account security">
        Add another layer of protection to your account.
      </PageHeading>
      <AccountNav />
      <Feedback error={error} />
      {security.loading ? (
        <Loading />
      ) : security.error ? (
        <LoadError error={security.error} retry={security.load} />
      ) : (
        <div className="grid two-columns">
          <div className="panel">
            <LockKeyhole size={28} />
            <h3>Authenticator verification</h3>
            <p className="muted">
              Once enabled, an authenticator code is required before voting or
              accessing your workspace.
            </p>
            {security.data?.factors.map((f) => (
              <div className="notification" key={f.id}>
                <div>
                  <b>{f.friendly_name || "Authenticator"}</b>
                  <p>{f.status}</p>
                </div>
                <button
                  className="btn alt"
                  onClick={() =>
                    act(() => api("/auth/mfa/" + f.id, undefined, "DELETE"))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            {enrollment ? (
              <div className="mfa-enrollment">
                <img
                  className="qr-code"
                  src={
                    enrollment.qr.startsWith("data:")
                      ? enrollment.qr
                      : "data:image/svg+xml;charset=UTF-8," +
                        encodeURIComponent(enrollment.qr)
                  }
                  alt="Scan this QR code in your authenticator app"
                />
                <details>
                  <summary>Can’t scan the code?</summary>
                  <code className="secret">{enrollment.secret}</code>
                </details>
                <ActionForm
                  className="f"
                  onSubmit={async (f) => {
                    await api("/auth/mfa/verify", {
                      factorId: enrollment.id,
                      code: f.code,
                    });
                    setEnrollment(null);
                    await refresh();
                    security.load();
                  }}
                  success="Authenticator protection enabled."
                >
                  <Field
                    label="Six-digit code"
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    autoComplete="one-time-code"
                    required
                  />
                  <button className="btn">Enable authenticator</button>
                </ActionForm>
              </div>
            ) : (
              <button
                className="btn"
                onClick={() =>
                  act(async () =>
                    setEnrollment(await api("/auth/mfa/enroll", {})),
                  )
                }
              >
                Set up authenticator
              </button>
            )}
          </div>
          <div className="panel">
            <KeyRound size={28} />
            <h3>Password & sessions</h3>
            <p className="muted">
              Resetting your password signs you out of all sessions.
            </p>
            <p>{security.data?.sessions} active application session(s).</p>
            <Link className="btn alt" to="/forgot-password">
              Reset password
            </Link>
            {security.data?.phoneEnabled && (
              <>
                <h3>Phone verification</h3>
                {security.data.phone && <p>Verified: {security.data.phone}</p>}
                <ActionForm
                  className="f"
                  onSubmit={(f) => api("/auth/phone", f)}
                  success="A verification code has been sent."
                >
                  <Field
                    label="Phone number with country code"
                    name="phone"
                    type="tel"
                    placeholder="+234…"
                    required
                  />
                  <button className="btn alt">Send code</button>
                </ActionForm>
                <ActionForm
                  className="f"
                  onSubmit={async (f) => {
                    await api("/auth/phone/verify", f);
                    security.load();
                  }}
                >
                  <Field
                    label="Phone number"
                    name="phone"
                    type="tel"
                    required
                  />
                  <Field
                    label="Verification code"
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    required
                  />
                  <button className="btn">Verify phone</button>
                </ActionForm>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export function Notifications() {
  const { data, error, loading, load } = useLoad("/notifications"),
    [actionError, setError] = useState("");
  return (
    <div className="pg">
      <PageHeading eyebrow="YOUR ACCOUNT" title="Notifications">
        Election updates, verification decisions, and account activity.
      </PageHeading>
      <AccountNav />
      <Feedback error={actionError} />
      {loading ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={load} />
      ) : data?.length ? (
        <div className="panel">
          {data.map((n) => (
            <div
              className={"notification " + (!n.read ? "unread" : "")}
              key={n.id}
            >
              <Bell size={20} />
              <div className="notification-body">
                <b>{n.title}</b>
                <p>{n.message}</p>
                <small className="muted">{date(n.createdAt)}</small>
              </div>
              {!n.read && (
                <button
                  className="btn alt"
                  onClick={async () => {
                    try {
                      await api("/notifications/" + n.id + "/read", {});
                      load();
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Mark as read
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty title="You’re all caught up">
          Updates will appear here as your elections progress.
        </Empty>
      )}
    </div>
  );
}
export function Invitation() {
  const { token } = useParams(),
    { user } = useStore(),
    go = useNavigate();
  return (
    <div className="pg narrow">
      <PageHeading eyebrow="ELECTION INVITATION" title="You’re invited.">
        Sign in with the email address that received this invitation.
      </PageHeading>
      {user ? (
        <ActionForm
          success=""
          onSubmit={async () => {
            const result = await api("/invitations/accept", { token });
            go("/elections/" + result.electionId);
          }}
        >
          <p>
            Accepting an invitation gives you access to the event. Election
            eligibility checks still apply.
          </p>
          <button className="btn btn-full">
            Accept invitation <ArrowRight size={16} />
          </button>
        </ActionForm>
      ) : (
        <>
          <Link className="btn" to="/login">
            Sign in
          </Link>
          <p>Return to this invitation link after signing in.</p>
        </>
      )}
    </div>
  );
}
