import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  MapPin,
  Search,
  ShieldCheck,
  Users,
  Trophy,
  ChevronLeft,
  ExternalLink,
  QrCode,
} from "lucide-react";
import { api, useStore } from "../store.jsx";
import {
  useLoad,
  Feedback,
  Empty,
  date,
  status,
  ActionForm,
  Field,
  PageHeading,
  Loading,
  LoadError,
  Badge,
} from "../components.jsx";
export function ElectionCard({ e }) {
  return (
    <article className="election-card">
      <div className="election-card-top">
        {e.banner ? (
          <img src={e.banner} alt="" loading="lazy" />
        ) : (
          <div
            className="election-cover"
            style={{ "--brand-color": e.organization.color }}
          >
            <span>{e.organization.name.slice(0, 2).toUpperCase()}</span>
            <QrCode size={24} strokeWidth={1.2} />
          </div>
        )}
        <Badge value={e.status} />
      </div>
      <div className="election-card-body">
        <span className="eyebrow">{e.organization.name}</span>
        <h3>
          <Link to={"/elections/" + e.slug}>{e.name}</Link>
        </h3>
        <p className="muted">
          {e.description.slice(0, 145) ||
            e.positions.length +
              " positions · " +
              (e.mode === "ELECTION_DEMO"
                ? "Formal-election demonstration"
                : "General voting")}
        </p>
        {e.viewerEligibility && (
          <p className="eligibility-line">
            <ShieldCheck size={15} />
            <span>
              {e.viewerEligibility.reason || "You are eligible to participate."}
            </span>
          </p>
        )}
        <div className="card-bottom">
          <span>
            <CalendarDays size={15} /> Closes {date(e.votingEnd, e.timezone)}
          </span>
          <Link aria-label={"View " + e.name} to={"/elections/" + e.slug}>
            <ArrowUpRight size={20} />
          </Link>
        </div>
      </div>
    </article>
  );
}
export function Explore() {
  const [q, setQ] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);
  const elections = useLoad(
    "/elections?q=" +
      encodeURIComponent(query) +
      "&page=" +
      page +
      (filter === "ALL" ? "" : "&status=" + filter),
  );
  return (
    <div className="pg">
      <PageHeading
        eyebrow="MAKE YOUR VOICE COUNT"
        title="Find your next election."
        action={
          <Link className="btn alt" to="/workspace/elections">
            Create an election <ArrowUpRight size={17} />
          </Link>
        }
      >
        Discover voting events, meet candidates, and take part in your
        community.
      </PageHeading>
      <div className="toolbar">
        <div className="search-input">
          <Search size={19} />
          <input
            aria-label="Search elections, organizations, candidates and categories"
            placeholder="Search elections, organizations, candidates…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter by election status"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All elections</option>
          {[
            "REGISTRATION_OPEN",
            "VOTING_UPCOMING",
            "VOTING_OPEN",
            "VOTING_CLOSED",
            "RESULTS_PUBLISHED",
            "ARCHIVED",
          ].map((s) => (
            <option key={s} value={s}>
              {status(s)}
            </option>
          ))}
        </select>
      </div>
      {elections.loading ? (
        <Loading>Finding elections…</Loading>
      ) : elections.error ? (
        <LoadError error={elections.error} retry={elections.load} />
      ) : elections.data?.length ? (
        <div className="grid election-grid">
          {elections.data.map((e) => (
            <ElectionCard key={e.id} e={e} />
          ))}
        </div>
      ) : (
        <Empty title="No matching elections">
          Try another search, or come back when your organization opens its next
          event.
        </Empty>
      )}
      {(page > 1 || elections.data?.length === 100) && (
        <div className="pagination">
          <button
            className="btn alt"
            disabled={page === 1 || elections.loading}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            className="btn alt"
            disabled={elections.data?.length !== 100 || elections.loading}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
export function Election() {
  const { id } = useParams(),
    election = useLoad("/elections/" + id),
    { user } = useStore(),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [registered, setRegistered] = useState(false),
    [busy, setBusy] = useState(false),
    [showApply, setApply] = useState(false);
  const e = election.data;
  const register = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/elections/" + e.id + "/register", {});
      setRegistered(true);
      setMessage(
        "Registration recorded. Continue to your voting page to review eligibility.",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  if (election.loading)
    return (
      <div className="pg">
        <Loading>Loading election…</Loading>
      </div>
    );
  if (!e)
    return (
      <div className="pg narrow">
        <LoadError error={election.error} retry={election.load} />
        {user && election.error?.includes("invitation") && (
          <details className="panel">
            <summary>Have an event password?</summary>
            <ActionForm
              className="f"
              onSubmit={async (f) => {
                await api("/elections/" + id + "/unlock", f);
                election.load();
              }}
            >
              <Field
                label="Event password"
                name="password"
                type="password"
                required
              />
              <button className="btn">Open event</button>
            </ActionForm>
          </details>
        )}
      </div>
    );
  const closed = [
    "VOTING_CLOSED",
    "RESULTS_PENDING",
    "RESULTS_PUBLISHED",
    "ARCHIVED",
  ].includes(e.status);
  return (
    <div className="pg">
      <Link className="back-link" to="/elections">
        <ChevronLeft size={16} /> All elections
      </Link>
      {e.banner && <img className="election-banner" src={e.banner} alt="" />}
      <div className="election-layout">
        <div>
          <div className="election-heading">
            <Badge value={e.status} />
            <Link
              className="organization-credit"
              to={"/organizations/" + e.organization.slug}
            >
              {e.organization.logo && <img src={e.organization.logo} alt="" />}
              {e.organization.name}
              {e.organization.verified && <CheckCircle2 size={17} />}
            </Link>
            <h1 className="page-title">{e.name}</h1>
            <p className="sub">{e.description}</p>
            {e.runoffOfElection && (
              <Link
                className="text-link"
                to={`/elections/${e.runoffOfElection.slug}`}
              >
                Preceding election: {e.runoffOfElection.name}{" "}
                <ArrowUpRight size={16} />
              </Link>
            )}
            {e.runoffElection && e.runoffElection.status !== "DRAFT" && (
              <Link
                className="text-link"
                to={`/elections/${e.runoffElection.slug}`}
              >
                View the runoff election <ArrowUpRight size={16} />
              </Link>
            )}
            <p className="meta-line">
              <MapPin size={16} />
              {e.location || "Online"}
              <span>·</span>
              {e.timezone}
            </p>
            {e.mode === "ELECTION_DEMO" && (
              <div className="notice">
                Formal-election demonstration. Official government use requires
                separate authorization and independent review.
              </div>
            )}
            <Feedback error={error} message={message} />
          </div>
          <section className="s">
            <div className="section-heading">
              <h2>Meet the candidates</h2>
              <span className="muted">{e.positions.length} position(s)</span>
            </div>
            {e.positions.length ? (
              e.positions.map((p) => (
                <section className="position-section" key={p.id}>
                  <div className="position-heading">
                    <h3>{p.title}</h3>
                    <span>
                      {status(p.method)} ·{" "}
                      {p.maxVotes === 1
                        ? "One submission per voter"
                        : "Up to " + p.maxVotes + " submissions"}
                    </span>
                  </div>
                  {p.candidates.length ? (
                    <div className="candidate-grid">
                      {p.candidates.map((c) => (
                        <article className="candidate-profile" key={c.id}>
                          {c.photo ? (
                            <img src={c.photo} alt={c.name} loading="lazy" />
                          ) : (
                            <div className="candidate-avatar">
                              {c.name
                                .split(" ")
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join("")}
                            </div>
                          )}
                          <div>
                            <h3>
                              <Link to={"/candidates/" + c.id}>{c.name}</Link>
                            </h3>
                            <p>{c.bio.slice(0, 180)}</p>
                            <Link
                              className="text-link"
                              to={"/candidates/" + c.id}
                            >
                              View profile <ArrowUpRight size={16} />
                            </Link>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <Empty title="Candidates are being finalized">
                      Approved candidates will appear here.
                    </Empty>
                  )}
                </section>
              ))
            ) : (
              <Empty title="The ballot is being prepared">
                Positions and candidates will appear once the organizer adds
                them.
              </Empty>
            )}
          </section>
          {user &&
            ["REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(e.status) && (
              <section className="s">
                <button
                  className="btn alt"
                  onClick={() => setApply(!showApply)}
                >
                  Stand as a candidate <ArrowRight size={17} />
                </button>
                {showApply && (
                  <ActionForm
                    onSubmit={(f) =>
                      api("/elections/" + e.id + "/candidates", {
                        ...f,
                        socialLinks: f.socialLinks
                          ? f.socialLinks.split("\n").filter(Boolean)
                          : [],
                      })
                    }
                    success="Your profile has been submitted for approval. You can upload your photo from Account."
                  >
                    <h3>Submit your candidate profile</h3>
                    <Field label="Position">
                      <select name="positionId" required>
                        {e.positions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label="Full name"
                      name="name"
                      defaultValue={user.name}
                      minLength={2}
                      required
                    />
                    <Field label="Biography">
                      <textarea name="bio" maxLength={2000} />
                    </Field>
                    <Field label="Manifesto">
                      <textarea name="manifesto" maxLength={5000} />
                    </Field>
                    <Field label="Campaign statement">
                      <textarea name="campaign" maxLength={2000} />
                    </Field>
                    <Field label="Campaign links, one URL per line">
                      <textarea name="socialLinks" />
                    </Field>
                    <button className="btn">Submit for approval</button>
                  </ActionForm>
                )}
              </section>
            )}
          <section className="s">
            <h2>Election questions</h2>
            {[
              ...(e.faq || []),
              {
                question: "Can I change my vote?",
                answer:
                  "Review your ballot carefully. Submitted votes are final.",
              },
              {
                question: "How is my eligibility checked?",
                answer:
                  "Your organization reviews election eligibility. Authoritative identity and date of birth require an authorized provider; an uploaded document alone does not establish identity.",
              },
            ].map((item, i) => (
              <details key={i}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </section>
        </div>
        <aside className="election-aside">
          <div className="panel voting-summary">
            <h3>Your election at a glance</h3>
            <div className="schedule-item">
              <CalendarDays size={20} />
              <div>
                <small>VOTING OPENS</small>
                <b>{date(e.votingStart, e.timezone)}</b>
              </div>
            </div>
            <div className="schedule-item">
              <CalendarDays size={20} />
              <div>
                <small>VOTING CLOSES</small>
                <b>{date(e.votingEnd, e.timezone)}</b>
              </div>
            </div>
            {e.registrationEnd && (
              <div className="schedule-item">
                <Users size={20} />
                <div>
                  <small>REGISTRATION CLOSES</small>
                  <b>{date(e.registrationEnd, e.timezone)}</b>
                </div>
              </div>
            )}
            {e.status === "REGISTRATION_OPEN" && user && (
              <button
                className="btn btn-full"
                disabled={busy || registered}
                onClick={register}
              >
                {registered
                  ? "Registration recorded"
                  : busy
                    ? "Registering…"
                    : "Register to participate"}
              </button>
            )}
            <Link
              className={"btn btn-full " + (closed ? "alt" : "")}
              to={"/elections/" + e.slug + "/vote"}
            >
              {e.status === "VOTING_OPEN" ? "Vote now" : "Your voting page"}{" "}
              <ArrowRight size={17} />
            </Link>
            <Link
              className="text-link"
              to={"/elections/" + e.slug + "/results"}
            >
              View results <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="panel eligibility-summary">
            <ShieldCheck size={24} />
            <h3>Who can participate?</h3>
            <ul>
              <li>Confirmed account and approved election registration</li>
              {e.minAge > 0 && (
                <li>
                  At least {e.minAge} years old, using verified date of birth
                </li>
              )}
              {e.maxAge !== null && <li>No older than {e.maxAge}</li>}
              {e.membershipRequired && <li>Active organization membership</li>}
              {e.geography && <li>Verified region: {e.geography}</li>}
              {e.groupId && (
                <li>
                  Approved membership of the configured group or constituency
                </li>
              )}
              {e.customRules && <li>{e.customRules}</li>}
            </ul>
            <p className="muted">
              Results: {status(e.resultVisibility)}
              {e.publishAt && " · " + date(e.publishAt, e.timezone)}
            </p>
          </div>
          <div className="share-election">
            <QrCode size={22} />
            <div>
              <h3>Bring others to the ballot</h3>
              <a
                href={"/api/elections/" + e.id + "/qr"}
                download="election-qr.png"
              >
                Download the election QR code <ArrowUpRight size={15} />
              </a>
              <button
                className="text-link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      window.location.origin + "/elections/" + e.slug,
                    );
                    setMessage("Election link copied.");
                  } catch {
                    setError(
                      "Copy the election page URL from your address bar.",
                    );
                  }
                }}
              >
                Copy election link
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
export function Results() {
  const { id } = useParams(),
    results = useLoad("/elections/" + id + "/results"),
    election = useLoad("/elections/" + id),
    data = results.data;
  useEffect(() => {
    if (!data || data.final) return;
    const timer = setInterval(results.load, 15000);
    return () => clearInterval(timer);
  }, [Boolean(data), data?.final, results.load]);
  return (
    <div className="pg">
      <Link className="back-link" to={"/elections/" + id}>
        <ChevronLeft size={16} /> Election details
      </Link>
      <PageHeading
        eyebrow="ELECTION RESULTS"
        title={election.data?.name || "Results dashboard"}
      >
        {data
          ? data.final
            ? "Published results · the final recorded count."
            : "Live count · updates every 15 seconds."
          : "Results are available according to the organizer’s publication settings."}
      </PageHeading>
      {results.loading && !data ? (
        <Loading />
      ) : results.error ? (
        <div className="panel results-pending">
          <LockIcon />
          <h2>Results are not available yet</h2>
          <p>{results.error}</p>
          <button className="btn alt" onClick={results.load}>
            Check again
          </button>
        </div>
      ) : (
        data && (
          <>
            <div className="stats">
              {[
                ["Registered voters", data.registered],
                ["Eligible voters", data.eligible],
                ["Participating voters", data.voters],
                ["Turnout", data.turnout.toFixed(1) + "%"],
                ["Ballots cast", data.ballots],
              ].map(([label, n]) => (
                <div className="stat" key={label}>
                  <b>{n}</b>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p className="muted">
              Ballots are counted across positions. Multiple-choice percentages
              show the share of all selections; weighted totals reflect approved
              voter weights.
            </p>
            {data.positions.map((p) => (
              <section className="panel position-section" key={p.id}>
                <div className="position-heading">
                  <h2>{p.title}</h2>
                  <Badge value={p.method} />
                </div>
                {p.candidates.map((c) => (
                  <div className="result-row" key={c.id}>
                    <div className="row between">
                      <div>
                        <b>{c.name}</b>
                        {data.final && p.winners.includes(c.id) && (
                          <span className="winner-label">
                            <Trophy size={14} />
                            {p.tie ? "Tied leader" : "Winner"}
                          </span>
                        )}
                      </div>
                      <span>
                        <b>{c.votes}</b>{" "}
                        <span className="muted">
                          · {c.percentage.toFixed(1)}%
                        </span>
                      </span>
                    </div>
                    <div
                      className="bar"
                      role="img"
                      aria-label={
                        c.name +
                        ": " +
                        c.votes +
                        " votes, " +
                        c.percentage.toFixed(1) +
                        " percent"
                      }
                    >
                      <i style={{ width: c.percentage + "%" }} />
                    </div>
                  </div>
                ))}
                <p className="muted">{p.ballots} submitted ballot(s)</p>
                {p.runoffRequired && (
                  <div className="notice">
                    A runoff or an authorized tie-resolution procedure is
                    required.
                  </div>
                )}
                {p.rounds?.length > 0 && (
                  <details>
                    <summary>Inspect ranked-choice rounds</summary>
                    {p.rounds.map((r, i) => (
                      <div className="round-detail" key={i}>
                        <h3>
                          Round {i + 1} · {r.total} active ballots
                        </h3>
                        {Object.entries(r.counts).map(([cid, n]) => (
                          <p key={cid}>
                            {p.candidates.find((c) => c.id === cid)?.name ||
                              cid}
                            : {n}
                          </p>
                        ))}
                        {r.unresolvedTie && (
                          <Feedback error="A tied elimination requires the organizer’s authorized resolution procedure." />
                        )}
                      </div>
                    ))}
                  </details>
                )}
              </section>
            ))}
          </>
        )
      )}
    </div>
  );
}
function LockIcon() {
  return <ShieldCheck size={34} strokeWidth={1.5} />;
}
export function Organizations() {
  const organizations = useLoad("/organizations"),
    [q, setQ] = useState(""),
    rows =
      organizations.data?.filter((o) =>
        (o.name + " " + o.description).toLowerCase().includes(q.toLowerCase()),
      ) || [];
  return (
    <div className="pg">
      <PageHeading
        eyebrow="COMMUNITIES THAT COUNT"
        title="Find your people."
        action={
          <Link className="btn alt" to="/workspace/organizations">
            Create an organization <ArrowUpRight size={17} />
          </Link>
        }
      >
        A home for your organization’s elections, events, and collective
        decisions.
      </PageHeading>
      <div className="search-input organization-search">
        <Search size={19} />
        <input
          aria-label="Search organizations"
          placeholder="Search by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {organizations.loading ? (
        <Loading />
      ) : organizations.error ? (
        <LoadError error={organizations.error} retry={organizations.load} />
      ) : rows.length ? (
        <div className="organization-grid">
          {rows.map((o) => (
            <article className="organization-card" key={o.id}>
              <div className="organization-card-heading">
                {o.logo ? (
                  <img
                    className="organization-logo"
                    src={o.logo}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="org-avatar" style={{ background: o.color }}>
                    {o.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                {o.verified && (
                  <span className="verified-line">
                    <CheckCircle2 size={16} /> Verified
                  </span>
                )}
              </div>
              <h3>
                <Link to={"/organizations/" + o.slug}>{o.name}</Link>
              </h3>
              <p className="muted">{o.description}</p>
              <Link className="text-link" to={"/organizations/" + o.slug}>
                Visit organization <ArrowUpRight size={17} />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="No organizations found">
          Try another search, or create your organization in the workspace.
        </Empty>
      )}
    </div>
  );
}
export function Organization() {
  const { id } = useParams(),
    organization = useLoad("/organizations/" + id),
    { user } = useStore(),
    o = organization.data;
  if (organization.loading)
    return (
      <div className="pg">
        <Loading />
      </div>
    );
  if (!o)
    return (
      <div className="pg">
        <LoadError error={organization.error} retry={organization.load} />
      </div>
    );
  const ended = [
    "VOTING_CLOSED",
    "RESULTS_PENDING",
    "RESULTS_PUBLISHED",
    "ARCHIVED",
  ];
  return (
    <div className="pg">
      <Link className="back-link" to="/organizations">
        <ChevronLeft size={16} /> Organizations
      </Link>
      <div className="organization-hero">
        {o.logo ? (
          <img className="organization-logo large-logo" src={o.logo} alt="" />
        ) : (
          <span
            className="org-avatar large-logo"
            style={{ background: o.color }}
          >
            {o.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div>
          <span className="eyebrow">ORGANIZATION PROFILE</span>
          <h1 className="page-title">{o.name}</h1>
          {o.verified && (
            <p className="verified-line">
              <CheckCircle2 size={17} /> Verified organization
            </p>
          )}
          <p className="sub">{o.description}</p>
          <p>{o.welcome}</p>
          {o.contact && <p className="muted">Contact: {o.contact}</p>}
        </div>
      </div>
      <details className="panel join-panel">
        <summary>Join this organization</summary>
        {user ? (
          <ActionForm
            className="f"
            onSubmit={(f) => api("/organizations/" + o.id + "/join", f)}
            success="Membership request sent for review."
          >
            <Field label="Message for the administrator">
              <textarea
                name="message"
                maxLength={1000}
                placeholder="Tell the administrator how you are connected to this organization."
              />
            </Field>
            <button className="btn">Request membership</button>
          </ActionForm>
        ) : (
          <p>
            <Link to="/login">Sign in</Link> to request membership.
          </p>
        )}
      </details>
      {[
        [
          "Active & upcoming",
          o.elections.filter((e) => !ended.includes(e.status)),
        ],
        ["Past elections", o.elections.filter((e) => ended.includes(e.status))],
      ].map(([title, rows]) => (
        <section className="s" key={title}>
          <h2>{title}</h2>
          {rows.length ? (
            <div className="grid election-grid">
              {rows.map((e) => (
                <ElectionCard key={e.id} e={e} />
              ))}
            </div>
          ) : (
            <Empty title="No elections to show">
              Visible events will appear here when the organization creates
              them.
            </Empty>
          )}
        </section>
      ))}
    </div>
  );
}
export function Candidate() {
  const { id } = useParams(),
    candidate = useLoad("/candidates/" + id),
    c = candidate.data;
  if (candidate.loading)
    return (
      <div className="pg">
        <Loading />
      </div>
    );
  if (!c)
    return (
      <div className="pg">
        <LoadError error={candidate.error} retry={candidate.load} />
      </div>
    );
  return (
    <div className="pg reading">
      <Link className="back-link" to={"/elections/" + c.election.slug}>
        <ChevronLeft size={16} /> {c.election.name}
      </Link>
      <div className="candidate-detail-heading">
        {c.photo ? (
          <img src={c.photo} alt={c.name} />
        ) : (
          <div className="candidate-avatar">
            {c.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </div>
        )}
        <div>
          <span className="eyebrow">
            {c.position.title} · {c.election.organization.name}
          </span>
          <h1 className="page-title">{c.name}</h1>
          <Badge value={c.status} />
        </div>
      </div>
      <section className="s">
        <h2>About the candidate</h2>
        <p className="preserve-lines">
          {c.bio || "A biography has not been provided."}
        </p>
      </section>
      {c.manifesto && (
        <section className="s">
          <h2>Manifesto</h2>
          <p className="preserve-lines">{c.manifesto}</p>
        </section>
      )}
      {c.campaign && (
        <section className="s">
          <h2>Campaign statement</h2>
          <p className="preserve-lines">{c.campaign}</p>
        </section>
      )}
      {c.socialLinks?.length > 0 && (
        <section className="s">
          <h3>Campaign links</h3>
          {c.socialLinks.map((url) => (
            <a
              className="campaign-link"
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {new URL(url).hostname} <ExternalLink size={16} />
            </a>
          ))}
        </section>
      )}
      <Link className="btn" to={"/elections/" + c.election.slug + "/vote"}>
        Your voting page <ArrowRight size={17} />
      </Link>
    </div>
  );
}
