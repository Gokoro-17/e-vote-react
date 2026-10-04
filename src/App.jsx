import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Vote as VoteIcon,
  Menu,
  X,
  ArrowUpRight,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useStore } from "./store.jsx";
import Home from "./pages/Home.jsx";
import {
  Auth,
  Account,
  VerifyEmail,
  ForgotPassword,
  ResetPassword,
  Onboarding,
  TwoFactor,
  AccountSecurity,
  Notifications,
  Invitation,
} from "./pages/Auth.jsx";
import {
  Explore,
  Election,
  Results,
  Organizations,
  Organization,
  Candidate,
} from "./pages/Public.jsx";
import Vote from "./pages/Vote.jsx";
import Admin from "./pages/Admin.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Pricing from "./pages/Pricing.jsx";
import { Information, Contact } from "./pages/Information.jsx";
import { RequireAccount, Feedback, useLoad } from "./components.jsx";
export default function App() {
  const { user, logout } = useStore(),
    configuration = useLoad("/public/config"),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    location = useLocation(),
    navigate = useNavigate(),
    menuButton = useRef(null),
    navRef = useRef(null);
  useEffect(() => {
    const providerError = new URLSearchParams(location.hash.slice(1)).get(
      "error",
    );
    if (providerError)
      navigate(
        "/login?error=" +
          (providerError === "access_denied" ? "access_denied" : "provider"),
        { replace: true },
      );
  }, [location.hash, navigate]);
  useEffect(() => {
    setOpen(false);
    setError("");
    window.scrollTo({ top: 0 });
    document.title = "E-Vote — Every voice, a better decision";
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const handler = (ev) => {
      if (ev.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    navRef.current?.querySelector("a")?.focus();
    return () => document.removeEventListener("keydown", handler);
  }, [open]);
  const privatePage = (element) => <RequireAccount>{element}</RequireAccount>;
  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="wrap header-inner">
          <Link className="brand" to="/" aria-label="E-Vote home">
            <span className="brand-mark">
              <VoteIcon size={22} />
            </span>
            E-Vote
            <span className="brand-divider" />
            <span className="brand-tag">Every voice matters</span>
          </Link>
          <button
            className="menu-toggle"
            ref={menuButton}
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="main-nav"
            aria-label={open ? "Close navigation" : "Open navigation"}
          >
            {open ? <X /> : <Menu />}
          </button>
          <nav
            id="main-nav"
            ref={navRef}
            className={open ? "open" : ""}
            aria-label="Main navigation"
          >
            <NavLink to="/elections">Find elections</NavLink>
            <NavLink to="/organizations">Organizations</NavLink>
            <NavLink to="/pricing">Pricing</NavLink>
            {user ? (
              <>
                <NavLink to="/dashboard">My votes</NavLink>
                <NavLink className="nav-cta" to="/workspace">
                  Organize <ArrowUpRight size={16} />
                </NavLink>
                <button
                  className="nav-button"
                  aria-label="Sign out"
                  onClick={() => logout().catch((e) => setError(e.message))}
                >
                  <LogOut size={18} />
                  <span>Sign out</span>
                </button>
              </>
            ) : (
              <>
                <NavLink className="nav-signin" to="/login">
                  Sign in
                </NavLink>
                <Link className="nav-cta" to="/register">
                  Create account <ArrowUpRight size={16} />
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      {error && (
        <div className="wrap">
          <Feedback error={error} />
        </div>
      )}
      {configuration.data?.welcomeMessage && (
        <div className="site-announcement">
          <div className="wrap">{configuration.data.welcomeMessage}</div>
        </div>
      )}
      <main
        id="content"
        className={
          "wrap main-content " +
          (location.pathname.startsWith("/workspace") ? "workspace-main" : "")
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/register" element={<Auth register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/two-factor" element={<TwoFactor />} />
          <Route path="/dashboard" element={privatePage(<Dashboard />)} />
          <Route path="/account" element={privatePage(<Account />)} />
          <Route
            path="/account/security"
            element={privatePage(<AccountSecurity />)}
          />
          <Route
            path="/notifications"
            element={privatePage(<Notifications />)}
          />
          <Route path="/invitations/:token" element={<Invitation />} />
          <Route path="/elections" element={<Explore />} />
          <Route path="/elections/:id" element={<Election />} />
          <Route path="/elections/:id/vote" element={privatePage(<Vote />)} />
          <Route path="/elections/:id/results" element={<Results />} />
          <Route path="/candidates/:id" element={<Candidate />} />
          <Route path="/organizations" element={<Organizations />} />
          <Route path="/organizations/:id" element={<Organization />} />
          <Route
            path="/admin/*"
            element={<Navigate to="/workspace" replace />}
          />
          <Route path="/workspace/*" element={privatePage(<Admin />)} />
          {["security", "privacy", "terms", "faq"].map((page) => (
            <Route
              key={page}
              path={"/" + page}
              element={<Information page={page} />}
            />
          ))}
          <Route path="/contact" element={<Contact />} />
          <Route
            path="*"
            element={
              <div className="pg narrow">
                <span className="eyebrow">404 / PAGE NOT FOUND</span>
                <h1>This page isn’t here.</h1>
                <p className="sub">
                  The link may have changed, or the page may no longer be
                  available.
                </p>
                <Link className="btn" to="/">
                  Return home
                </Link>
              </div>
            }
          />
        </Routes>
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <div className="footer-grid">
            <div>
              <Link className="brand" to="/">
                <span className="brand-mark">
                  <VoteIcon size={22} />
                </span>
                E-Vote
              </Link>
              <p>
                Bring people together.
                <br />
                Make every decision count.
              </p>
            </div>
            <div>
              <span className="footer-label">PLATFORM</span>
              <Link to="/elections">Explore elections</Link>
              <Link to="/organizations">Organizations</Link>
              <Link to="/workspace">Organizer workspace</Link>
            </div>
            <div>
              <span className="footer-label">RESOURCES</span>
              <Link to="/security">Security & trust</Link>
              <Link to="/pricing">Plans & pricing</Link>
              <Link to="/faq">Help & FAQ</Link>
              <Link to="/contact">Contact</Link>
            </div>
            <div>
              <span className="footer-label">YOUR ACCOUNT</span>
              <Link to="/account">Account & privacy</Link>
              <Link to="/privacy">Privacy notice</Link>
              <Link to="/terms">Terms of use</Link>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} E-Vote</span>
            <p>
              <ShieldCheck size={16} /> Organization and community voting.
              Formal-election mode requires separate authorization and
              independent review before official use.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
