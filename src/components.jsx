import { useCallback, useEffect, useState, useRef, useId } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Inbox,
  LoaderCircle,
  ArrowUpRight,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { api, useStore } from "./store.jsx";
export const status = (s) => s?.replaceAll("_", " ").toLowerCase();
export const date = (s, timezone) =>
  s
    ? new Intl.DateTimeFormat("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone || "Africa/Lagos",
      }).format(new Date(s))
    : "Not set";
export function useLoad(path) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(Boolean(path)),
    ref = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++ref.current;
    if (!path) {
      setData(null);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api(path);
      if (ticket === ref.current) setData(result);
    } catch (e) {
      if (ticket === ref.current) {
        setError(e.message);
        setData(null);
      }
    } finally {
      if (ticket === ref.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setData(null);
    load();
    return () => {
      ref.current++;
    };
  }, [load]);
  return { data, error, loading, load };
}
export function Feedback({ error, message }) {
  return (
    <>
      {error && (
        <div className="feedback error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="feedback success" role="status">
          <CheckCircle2 size={18} />
          <span>{message}</span>
        </div>
      )}
    </>
  );
}
export function Field({
  label,
  hint,
  name,
  type = "text",
  children,
  ...props
}) {
  const id = useId();
  return (
    <label className="l" htmlFor={children ? undefined : id}>
      <span>{label}</span>
      {children || <input id={id} name={name} type={type} {...props} />}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
export function ActionForm({
  onSubmit,
  children,
  className = "f panel",
  success = "Saved successfully.",
  reset = false,
}) {
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className={className}
      onSubmit={async (ev) => {
        ev.preventDefault();
        const form = ev.currentTarget,
          data = Object.fromEntries(new FormData(form));
        setBusy(true);
        setError("");
        setMessage("");
        try {
          await onSubmit(data, form);
          setMessage(success);
          if (reset) form.reset();
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
      aria-busy={busy}
    >
      <fieldset disabled={busy}>{children}</fieldset>
      <Feedback error={error} message={message} />
      {busy && (
        <span className="loading" role="status">
          <LoaderCircle size={16} className="spin" /> Please wait…
        </span>
      )}
    </form>
  );
}
let captchaScript;
export function Captcha() {
  const ref = useRef(null),
    [value, setValue] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      widget;
    api("/public/config")
      .then(async (config) => {
        if (!config.captchaSiteKey || !active) return;
        if (!window.turnstile)
          captchaScript ??= new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src =
              "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.onload = resolve;
            script.onerror = reject;
            document.head.append(script);
          });
        if (captchaScript) await captchaScript;
        if (active && ref.current && window.turnstile)
          widget = window.turnstile.render(ref.current, {
            sitekey: config.captchaSiteKey,
            size: "flexible",
            callback: setValue,
            "expired-callback": () => setValue(""),
            "error-callback": () =>
              setError("The security check could not load. Please refresh."),
          });
      })
      .catch(
        () =>
          active &&
          setError("The security check could not load. Please refresh."),
      );
    return () => {
      active = false;
      if (widget !== undefined && window.turnstile)
        window.turnstile.remove(widget);
    };
  }, []);
  return (
    <>
      <div ref={ref} className="captcha" />
      <input type="hidden" name="captcha" value={value} />
      {error && <Feedback error={error} />}
    </>
  );
}
export function Empty({ title = "Nothing here yet", children }) {
  return (
    <div className="empty">
      <Inbox size={30} strokeWidth={1.4} />
      <h3>{title}</h3>
      <p className="muted">{children}</p>
    </div>
  );
}
export function Loading({ children = "Loading…" }) {
  return (
    <div className="loading block" role="status">
      <LoaderCircle size={20} className="spin" />
      {children}
    </div>
  );
}
export function LoadError({ error, retry }) {
  return (
    <div className="panel load-error">
      <AlertCircle size={26} />
      <h3>We couldn’t load this page</h3>
      <p>{error}</p>
      {retry && (
        <button className="btn alt" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function PageHeading({ eyebrow, title, children, action }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="page-title">{title}</h1>
        {children && <p className="sub">{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function Badge({ value }) {
  return (
    <span className={"pill state-" + value?.toLowerCase()}>
      {status(value)}
    </span>
  );
}
export function RequireAccount({ children }) {
  const { user, needsMfa, loading } = useStore();
  if (loading) return <Loading>Checking your account…</Loading>;
  if (!user)
    return (
      <div className="pg narrow">
        <ShieldCheck size={36} />
        <h1>Sign in to continue</h1>
        <p className="sub">
          Your account connects you to your organizations, elections, and voting
          history.
        </p>
        <Link className="btn" to="/login">
          Sign in <ArrowUpRight size={17} />
        </Link>
      </div>
    );
  if (needsMfa)
    return (
      <div className="pg narrow">
        <h1>One more security check</h1>
        <p>Enter the code from your authenticator to continue.</p>
        <Link className="btn" to="/two-factor">
          Verify authenticator
        </Link>
      </div>
    );
  if (!user.consentAt)
    return (
      <div className="pg narrow">
        <h1>Finish creating your account</h1>
        <Link className="btn" to="/onboarding">
          Continue
        </Link>
      </div>
    );
  return children;
}
export function ImageUpload({
  type,
  organizationId,
  electionId,
  candidateId,
  onSaved,
}) {
  return (
    <ActionForm
      className="f upload-form"
      success="Image uploaded."
      onSubmit={async (_f, form) => {
        const data = new FormData(form);
        data.set("type", type);
        if (organizationId) data.set("organizationId", organizationId);
        if (electionId) data.set("electionId", electionId);
        if (candidateId) data.set("candidateId", candidateId);
        await api("/assets", data);
        onSaved?.();
      }}
    >
      <Field
        label="Upload an image"
        hint="JPEG or PNG, up to 5 MB. Public campaign and brand images are visible to everyone."
      >
        <input
          type="file"
          name="image"
          accept="image/png,image/jpeg"
          required
        />
      </Field>
      <button className="btn alt">
        <Upload size={16} /> Upload image
      </button>
    </ActionForm>
  );
}
