import { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Vote,
  Users,
  UserRound,
  ShieldCheck,
  BarChart3,
  FileText,
  LockKeyhole,
  Settings,
  Building2,
  Plus,
  ArrowUpRight,
  CreditCard,
  Copy,
  Trash2,
} from "lucide-react";
import CreateElection from "./CreateElection.jsx";
import Billing from "./Billing.jsx";
import {
  OrganizationAdmin,
  OrganizationSettings,
  DraftExtras,
  PositionEditor,
  PlatformSettings,
  ElectionPeople,
  PageControls,
  RunoffDraft,
} from "./WorkspaceTools.jsx";
import { api, useStore } from "../store.jsx";
import {
  useLoad,
  Field,
  ActionForm,
  Feedback,
  date,
  status,
  Empty,
  ImageUpload,
} from "../components.jsx";
const next = {
  DRAFT: "REGISTRATION_OPEN",
  REGISTRATION_OPEN: "VOTING_UPCOMING",
  VOTING_UPCOMING: "VOTING_OPEN",
  VOTING_OPEN: "VOTING_CLOSED",
  VOTING_CLOSED: "RESULTS_PENDING",
  RESULTS_PENDING: "RESULTS_PUBLISHED",
  RESULTS_PUBLISHED: "ARCHIVED",
};
const labels = {
  REGISTRATION_OPEN: "Open registration",
  VOTING_UPCOMING: "Finalize registration",
  VOTING_OPEN: "Open voting",
  VOTING_CLOSED: "Close voting",
  RESULTS_PENDING: "Calculate results",
  RESULTS_PUBLISHED: "Publish results",
  ARCHIVED: "Archive election",
};
export default function Admin() {
  const go = useNavigate(),
    location = useLocation(),
    slug = location.pathname.split("/")[2] || "overview";
  const { user } = useStore(),
    [electionPage, setElectionPage] = useState(1),
    [electionSearch, setElectionSearch] = useState(""),
    dashboard = useLoad(
      `/admin/dashboard?page=${electionPage}&q=${encodeURIComponent(electionSearch)}`,
    ),
    tab =
      { "audit-logs": "Audit Logs", new: "Create election" }[slug] ||
      slug.charAt(0).toUpperCase() + slug.slice(1),
    setTab = (t) => go("/workspace/" + t.toLowerCase().replaceAll(" ", "-")),
    [selected, setSelected] = useState(""),
    [orgId, setOrg] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const d = dashboard.data,
    e = d?.elections.find((e) => e.id === selected) || d?.elections[0],
    org = orgId || d?.organizations[0]?.id;
  const reload = () => dashboard.load();
  const action = async (fn) => {
    try {
      setError("");
      await fn();
      setMessage("Action completed.");
      reload();
    } catch (err) {
      setError(err.message);
    }
  };
  const save = async (path, data, method) => {
    await api(path, data, method);
    await reload();
  };
  if (!user)
    return (
      <div className="pg">
        <h2>Your organization’s voting workspace</h2>
        <p>Create an account to set up an organization and manage elections.</p>
        <Link className="btn" to="/register">
          Get started
        </Link>
      </div>
    );
  const canAdmin = (organizationId) =>
    user?.role === "SUPER_ADMIN" ||
    d?.memberships.some(
      (m) => m.organizationId === organizationId && m.role === "ADMIN",
    );
  const mainTabs = [
    "Overview",
    "Organizations",
    "Elections",
    "Voters",
    "Candidates",
    "Results",
    "Settings",
    "Billing",
  ];
  const advancedTabs = [
    "Verification",
    "Analytics",
    "Audit Logs",
    "Security",
    ...(user.role === "SUPER_ADMIN" ? ["Platform"] : []),
  ];
  return (
    <div className="pg workspace">
      <aside className="workspace-sidebar">
        <span className="eyebrow">ORGANIZER WORKSPACE</span>
        <Link className="btn sidebar-create" to="/workspace/new">
          <Plus size={16} /> New election
        </Link>
        <nav aria-label="Workspace sections">
          {mainTabs.map((t) => (
            <NavLink
              key={t}
              to={"/workspace/" + t.toLowerCase().replaceAll(" ", "-")}
              className={t === tab ? "selected" : ""}
            >
              <WorkspaceIcon tab={t} />
              {t}
            </NavLink>
          ))}
          <details className="workspace-more" open={advancedTabs.includes(tab)}>
            <summary>More tools</summary>
            {advancedTabs.map((t) => (
              <NavLink
                key={t}
                to={"/workspace/" + t.toLowerCase().replaceAll(" ", "-")}
                className={t === tab ? "selected" : ""}
              >
                <WorkspaceIcon tab={t} />
                {t}
              </NavLink>
            ))}
          </details>
        </nav>
        <div className="sidebar-note">
          ◈<p>Every important action is checked by the server.</p>
        </div>
      </aside>
      <div className="workspace-content">
        <div className="row between">
          <div>
            <span className="eyebrow">E-VOTE / {tab.toUpperCase()}</span>
            <h2>
              {tab === "Overview"
                ? `Welcome, ${user.name.split(" ")[0]}.`
                : tab}
            </h2>
          </div>
          <button className="btn alt" onClick={reload}>
            Refresh
          </button>
        </div>
        <Feedback error={error || dashboard.error} message={message} />
        {dashboard.loading && !d && <p>Loading workspace…</p>}
        {d && (
          <>
            {![
              "Settings",
              "Platform",
              "Billing",
              "Organizations",
              "Create election",
            ].includes(tab) && (
              <ActionForm
                onSubmit={(f) => {
                  setElectionPage(1);
                  setSelected("");
                  setElectionSearch(f.q.trim());
                }}
              >
                <div className="row search-controls">
                  <Field
                    label="Find an election"
                    name="q"
                    type="search"
                    maxLength={100}
                    defaultValue={electionSearch}
                  />
                  <button className="btn alt">Search</button>
                </div>
              </ActionForm>
            )}
            {["Overview", "Analytics"].includes(tab) && (
              <>
                <p className="muted">
                  A clear view of your elections and participation.
                </p>
                <div className="stats">
                  {[
                    ["Active elections", d.stats.active],
                    ["Upcoming", d.stats.upcoming],
                    ["Completed", d.stats.completed],
                    ["Registrations", d.stats.registered],
                    ["Verified", d.stats.verified],
                    ["Ballots cast", d.stats.votes],
                    ["Review alerts", d.stats.alerts],
                  ].map(([label, n]) => (
                    <div className="panel" key={label}>
                      <b>{n}</b>
                      {label}
                    </div>
                  ))}
                </div>
                {tab === "Analytics" && (
                  <div className="panel">
                    <h3>Verification rate</h3>
                    <p>
                      {d.stats.registered
                        ? (
                            (d.stats.verified / d.stats.registered) *
                            100
                          ).toFixed(1)
                        : 0}
                      % of registrations verified
                    </p>
                    <div className="bar">
                      <i
                        style={{
                          width:
                            (d.stats.registered
                              ? (d.stats.verified / d.stats.registered) * 100
                              : 0) + "%",
                        }}
                      />
                    </div>
                    <p className="muted">
                      Download per-election turnout reports from Results.
                      Candidate performance appears after configured
                      publication. Participation counts represent submissions
                      across positions.
                    </p>
                  </div>
                )}
                {d.elections.length === 0 ? (
                  <Empty title="Create your first voting event">
                    Start with an organization, then build your ballot in
                    Elections.
                  </Empty>
                ) : (
                  <div className="grid">
                    {d.elections.map((el) => (
                      <div className="panel" key={el.id}>
                        <span className="pill">{status(el.status)}</span>
                        <h3>{el.name}</h3>
                        <p className="muted">
                          {el.organization.name} · {el.positions.length}{" "}
                          positions
                        </p>
                        <button
                          className="btn alt"
                          onClick={() => {
                            setSelected(el.id);
                            setTab("Elections");
                          }}
                        >
                          Manage election →
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {tab === "Organizations" && (
              <OrganizationAdmin
                organizations={d.organizations}
                reload={reload}
              />
            )}
            {tab === "Billing" && (
              <Billing
                organizations={d.organizations.filter((o) => canAdmin(o.id))}
              />
            )}
            {tab === "Create election" && (
              <CreateElection
                organizations={d.organizations.filter((o) => canAdmin(o.id))}
                onCreated={async (election) => {
                  setElectionPage(1);
                  setElectionSearch("");
                  setSelected(election.id);
                  await reload();
                  setTab("Candidates");
                }}
              />
            )}
            {tab === "Elections" && (
              <>
                <div className="row between">
                  <p className="muted">
                    Configure your ballot and manage the election lifecycle.
                  </p>
                  <Link className="btn" to="/workspace/new">
                    <Plus size={16} /> New election
                  </Link>
                </div>
                {d.elections.length === 0 && (
                  <Empty title="Create your first election">
                    Set up your organization, then build a ballot for your
                    community.
                  </Empty>
                )}
              </>
            )}
            {e &&
              ![
                "Overview",
                "Settings",
                "Platform",
                "Billing",

                "Organizations",
                "Create election",
              ].includes(tab) && (
                <div className="panel election-selector">
                  <Field label="Selected election">
                    <select
                      value={e.id}
                      onChange={(ev) => setSelected(ev.target.value)}
                    >
                      {d.elections.map((el) => (
                        <option key={el.id} value={el.id}>
                          {el.name} · {status(el.status)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="row">
                    <Link to={`/elections/${e.slug}`}>Public page ↗</Link>
                    <button
                      type="button"
                      className="text-link"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            window.location.origin + "/elections/" + e.slug,
                          );
                          setError("");
                          setMessage(
                            "Election link copied. Share it with voters.",
                          );
                        } catch {
                          setError(
                            "Copy the public election URL from the Public page.",
                          );
                        }
                      }}
                    >
                      <Copy size={15} /> Copy share link
                    </button>
                    <a href={`/api/elections/${e.id}/qr`} download="qr.png">
                      QR code ↓
                    </a>
                    <span className="pill">{status(e.status)}</span>
                  </div>
                </div>
              )}
            {tab === "Elections" && e && (
              <>
                <div className="panel">
                  <h3>Election lifecycle</h3>
                  <p className="muted">
                    Registration → upcoming → voting → closed → calculate →
                    publish → archive. Configuration locks when draft ends.
                  </p>
                  {next[e.status] && canAdmin(e.organizationId) && (
                    <button
                      className="btn"
                      onClick={() => {
                        if (
                          [
                            "VOTING_CLOSED",
                            "RESULTS_PUBLISHED",
                            "ARCHIVED",
                          ].includes(next[e.status]) &&
                          !window.confirm(
                            labels[next[e.status]] +
                              "? This changes the election for every participant.",
                          )
                        )
                          return;
                        action(() =>
                          api(`/elections/${e.id}/state`, {
                            status: next[e.status],
                          }),
                        );
                      }}
                    >
                      {labels[next[e.status]]}
                    </button>
                  )}
                  <p>
                    Voting: {date(e.votingStart, e.timezone)} –{" "}
                    {date(e.votingEnd, e.timezone)}
                  </p>
                </div>
                {e.status === "DRAFT" && canAdmin(e.organizationId) && (
                  <ActionForm
                    onSubmit={(f) =>
                      save(`/elections/${e.id}/positions`, {
                        ...f,
                        maxChoices: Number(f.maxChoices),
                        maxVotes: Number(f.maxVotes),
                        runoff: f.runoff === "on",
                      })
                    }
                  >
                    <h3>Add position / category</h3>
                    <Field label="Title" name="title" required />
                    <Field label="Voting method">
                      <select name="method">
                        {[
                          "SINGLE",
                          "MULTIPLE",
                          "APPROVAL",
                          "RANKED",
                          "WEIGHTED",
                        ].map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label="Maximum selections"
                      name="maxChoices"
                      type="number"
                      defaultValue={1}
                      min={1}
                      max={100}
                    />
                    <Field
                      label="Maximum submissions per voter"
                      name="maxVotes"
                      type="number"
                      defaultValue={1}
                      min={1}
                      max={100}
                    />
                    <label>
                      <input name="runoff" type="checkbox" /> Flag results
                      requiring a runoff
                    </label>
                    <button className="btn">Add position</button>
                  </ActionForm>
                )}
                <div className="panel">
                  <h3>Positions</h3>
                  {e.positions.map((p) => (
                    <p key={p.id}>
                      {p.title} · {p.method} · {p.candidates.length} candidates
                    </p>
                  ))}
                </div>
              </>
            )}
            {tab === "Candidates" && e && (
              <>
                {canAdmin(e.organizationId) &&
                  ["DRAFT", "REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(
                    e.status,
                  ) && (
                    <ActionForm
                      reset
                      success="Candidate added."
                      onSubmit={async (f, form) => {
                        const { image: _image, ...candidateInput } = f;
                        const candidate = await api(
                          `/elections/${e.id}/candidates`,
                          {
                            ...candidateInput,
                            accountEmail: f.accountEmail || undefined,
                          },
                        );
                        const file = form.elements.image?.files?.[0];
                        if (file) {
                          const image = new FormData();
                          image.set("type", "CANDIDATE");
                          image.set("candidateId", candidate.id);
                          image.set("image", file);
                          await api("/assets", image);
                        }
                        await reload();
                      }}
                    >
                      <h3>Add candidate</h3>
                      <Field
                        label="Candidate account email, if already an active member"
                        name="accountEmail"
                        type="email"
                      />
                      <Field label="Position">
                        <select name="positionId" required>
                          {e.positions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Name" name="name" required />
                      <Field label="Biography">
                        <textarea name="bio" />
                      </Field>
                      <Field label="Manifesto">
                        <textarea name="manifesto" />
                      </Field>
                      <Field label="Campaign statement">
                        <textarea name="campaign" />
                      </Field>
                      <Field
                        label="Candidate photo"
                        hint="Choose a JPEG or PNG from your device, up to 5 MB."
                      >
                        <input
                          name="image"
                          type="file"
                          accept="image/jpeg,image/png"
                        />
                      </Field>
                      <button className="btn">Add candidate</button>
                    </ActionForm>
                  )}
                <div className="panel">
                  {e.positions.map((p) => (
                    <div key={p.id}>
                      <h3>{p.title}</h3>
                      {p.candidates.map((c) => (
                        <div className="notification" key={c.id}>
                          <div>
                            <b>{c.name}</b>
                            <p>
                              {c.status} · {c.bio}
                            </p>
                            {canAdmin(e.organizationId) &&
                              [
                                "DRAFT",
                                "REGISTRATION_OPEN",
                                "VOTING_UPCOMING",
                              ].includes(e.status) && (
                                <details>
                                  <summary>Candidate photo</summary>
                                  <ImageUpload
                                    type="CANDIDATE"
                                    candidateId={c.id}
                                    onSaved={reload}
                                  />
                                </details>
                              )}
                          </div>
                          <div className="row">
                            {["APPROVED", "REJECTED", "WITHDRAWN"].map((s) => (
                              <button
                                className="btn alt"
                                key={s}
                                disabled={
                                  c.status === s ||
                                  ![
                                    "DRAFT",
                                    "REGISTRATION_OPEN",
                                    "VOTING_UPCOMING",
                                  ].includes(e.status)
                                }
                                onClick={() =>
                                  action(() =>
                                    api(
                                      `/candidates/${c.id}`,
                                      { status: s },
                                      "PATCH",
                                    ),
                                  )
                                }
                              >
                                {status(s)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
            {tab === "Voters" && e && (
              <ElectionPeople
                key={e.id + "voters"}
                election={e}
                canAdmin={canAdmin(e.organizationId)}
              />
            )}
            {tab === "Verification" && e && (
              <ElectionPeople
                key={e.id + "verification"}
                election={e}
                verification
                canAdmin={canAdmin(e.organizationId)}
              />
            )}
            {tab === "Results" && e && (
              <>
                <div className="panel">
                  <h3>Results & reports</h3>
                  <p className="muted">
                    Candidate totals follow publication settings. Eligibility
                    and turnout reports contain aggregate counts.
                  </p>
                  <Link className="btn" to={`/elections/${e.slug}/results`}>
                    View results dashboard
                  </Link>
                  {["results", "candidates", "turnout", "audit"].map((type) => (
                    <div className="notification" key={type}>
                      <b>{status(type)} report</b>
                      <div className="row">
                        {["csv", "xlsx", "pdf"].map((format) => (
                          <a
                            key={format}
                            href={`/api/elections/${e.id}/export?type=${type}&format=${format}`}
                          >
                            {format.toUpperCase()} ↓
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {canAdmin(e.organizationId) &&
                  ["RESULTS_PUBLISHED", "ARCHIVED"].includes(e.status) && (
                    <RunoffDraft
                      election={e}
                      key={e.id}
                      onCreated={async (runoff) => {
                        setElectionPage(1);
                        setElectionSearch("");
                        setSelected(runoff.id);
                        await reload();
                        setTab("Elections");
                      }}
                    />
                  )}
              </>
            )}
            {tab === "Analytics" && e && <Analytics electionId={e.id} />}
            {!e &&
              [
                "Voters",
                "Candidates",
                "Verification",
                "Results",
                "Analytics",
              ].includes(tab) && (
                <Empty title="Create an election to get started">
                  This section will show your election’s {tab.toLowerCase()}{" "}
                  once you create it.
                  <Link className="btn" to="/workspace/new">
                    Create an election
                  </Link>
                </Empty>
              )}
            {tab === "Elections" &&
              e?.status === "DRAFT" &&
              canAdmin(e.organizationId) && (
                <>
                  <DraftSettings
                    key={e.id}
                    election={e}
                    save={save}
                    onDelete={async () => {
                      if (
                        !window.confirm(
                          `Delete “${e.name}”? This permanently removes this draft and its candidates.`,
                        )
                      )
                        return;
                      await api(`/elections/${e.id}`, undefined, "DELETE");
                      setSelected("");
                      setMessage("Draft election deleted.");
                      await reload();
                    }}
                  />
                  <DraftExtras
                    key={e.id + "extras"}
                    election={e}
                    save={(...args) => (args.length ? save(...args) : reload())}
                  />
                  {e.positions.map((p) => (
                    <PositionEditor key={p.id} position={p} save={save} />
                  ))}
                </>
              )}
            {tab === "Audit Logs" && (
              <div className="panel table-scroll">
                <h3>Tamper-evident administrative history</h3>
                <p className="muted">
                  Hash-linked records exclude ballot selections.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.audits
                      .filter(
                        (a) => !e || a.electionId === e.id || !a.electionId,
                      )
                      .map((a) => (
                        <tr key={a.id}>
                          <td>{date(a.createdAt)}</td>
                          <td>
                            <code>{a.actor}</code>
                          </td>
                          <td>{a.event}</td>
                          <td>
                            <code title={a.hash}>{a.hash.slice(0, 16)}…</code>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "Security" && (
              <div className="panel">
                <h3>Activity requiring review</h3>
                <p className="muted">
                  Flags are review signals. They do not establish wrongdoing.
                </p>
                {d.security.length ? (
                  d.security.map((s) => (
                    <div className="notification" key={s.id}>
                      <div>
                        <b>{s.type}</b>
                        <p>{date(s.createdAt)}</p>
                        <small>{JSON.stringify(s.metadata)}</small>
                      </div>
                      <button
                        className="btn alt"
                        disabled={s.reviewed}
                        onClick={() =>
                          action(() => api(`/security/${s.id}/review`, {}))
                        }
                      >
                        {s.reviewed ? "Reviewed" : "Mark reviewed"}
                      </button>
                    </div>
                  ))
                ) : (
                  <p>No flagged events in your organization.</p>
                )}
              </div>
            )}
            {tab === "Settings" && (
              <>
                <Field label="Organization">
                  <select
                    value={org || ""}
                    onChange={(ev) => setOrg(ev.target.value)}
                  >
                    {d.organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <OrganizationSettings
                  key={org}
                  organization={d.organizations.find((o) => o.id === org)}
                  canAdmin={canAdmin(org)}
                  reload={reload}
                />
              </>
            )}
            {tab === "Platform" && (
              <>
                <PlatformSettings reload={reload} />
                <Platform action={action} />
                <Configuration
                  organizations={d.organizations}
                  action={action}
                />
              </>
            )}
            {![
              "Settings",
              "Platform",
              "Billing",
              "Organizations",
              "Create election",
            ].includes(tab) && (
              <PageControls
                data={d.pagination}
                page={electionPage}
                setPage={(page) => {
                  setSelected("");
                  setElectionPage(page);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
function Platform({ action }) {
  const users = useLoad("/platform/users");
  return (
    <div className="panel">
      <h3>Platform users</h3>
      <Feedback error={users.error} />
      {users.data?.map((u) => (
        <div className="notification" key={u.id}>
          <div>
            <b>{u.name}</b>
            <p>
              {u.email} · {u.role}
            </p>
          </div>
          <div className="row">
            <button
              className="btn alt"
              onClick={() =>
                action(async () => {
                  await api(
                    `/platform/users/${u.id}`,
                    { suspended: !u.suspended },
                    "PATCH",
                  );
                  users.load();
                })
              }
            >
              {u.suspended ? "Restore access" : "Suspend access"}
            </button>
            <button
              className="btn alt"
              onClick={() =>
                action(async () => {
                  await api(
                    `/platform/users/${u.id}`,
                    {
                      role: u.role === "SUPER_ADMIN" ? "VOTER" : "SUPER_ADMIN",
                    },
                    "PATCH",
                  );
                  users.load();
                })
              }
            >
              {u.role === "SUPER_ADMIN"
                ? "Remove platform role"
                : "Assign platform role"}
            </button>
          </div>
        </div>
      ))}
      <button
        className="btn"
        onClick={() =>
          action(async () => {
            const r = await api("/admin/audit-integrity", {});
            if (!r.valid)
              throw new Error("Audit integrity verification failed.");
          })
        }
      >
        Check audit chain
      </button>
    </div>
  );
}
function Analytics({ electionId }) {
  const { data: d, error } = useLoad(`/elections/${electionId}/analytics`);
  return (
    <div className="panel">
      <h3>Election participation</h3>
      <Feedback error={error} />
      {d && (
        <>
          <div className="stats">
            {[
              ["Eligible", d.eligible],
              ["Participating", d.voters],
              ["Turnout", d.turnout.toFixed(1) + "%"],
              ["Ballots", d.ballots],
            ].map(([label, n]) => (
              <div key={label}>
                <b>{n}</b>
                {label}
              </div>
            ))}
          </div>
          <h3>Ballots per hour</h3>
          {d.hours.length ? (
            d.hours.map((h) => (
              <div className="result-row" key={h.hour}>
                <div className="row between">
                  <span>{date(h.hour)}</span>
                  <b>{h.submissions}</b>
                </div>
                <div
                  className="bar"
                  role="img"
                  aria-label={`${date(h.hour)}: ${h.submissions} ballots`}
                >
                  <i
                    style={{
                      width:
                        (h.submissions /
                          Math.max(...d.hours.map((x) => x.submissions))) *
                          100 +
                        "%",
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="muted">Activity appears when voting begins.</p>
          )}
          <h3>Registration by region</h3>
          {Object.entries(d.geography).map(([region, n]) => (
            <p key={region}>
              {region}: {n}
            </p>
          ))}
          <p className="muted">
            Regions with fewer than 10 registered voters are omitted for
            privacy.
          </p>
        </>
      )}
    </div>
  );
}
function DraftSettings({ election: e, save, onDelete }) {
  const local = (s) => {
    if (!s) return "";
    const d = new Date(s);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  return (
    <details className="panel">
      <summary>Edit draft configuration</summary>
      <ActionForm
        onSubmit={(f) => {
          const data = {
            ...f,
            minAge: Number(f.minAge),
            maxAge: f.maxAge ? Number(f.maxAge) : null,
            membershipRequired: f.membershipRequired === "on",
            eventPassword: f.eventPassword || undefined,
          };
          for (const k of [
            "registrationStart",
            "registrationEnd",
            "votingStart",
            "votingEnd",
            "publishAt",
          ])
            data[k] = f[k] ? new Date(f[k]).toISOString() : null;
          return save(`/elections/${e.id}`, data, "PATCH");
        }}
      >
        <Field
          label="Election name"
          name="name"
          defaultValue={e.name}
          required
        />
        <Field label="Description">
          <textarea name="description" defaultValue={e.description} />
        </Field>
        <Field
          label="Timezone"
          name="timezone"
          defaultValue={e.timezone}
          required
        />
        {[
          "registrationStart",
          "registrationEnd",
          "votingStart",
          "votingEnd",
          "publishAt",
        ].map((k) => (
          <Field
            key={k}
            label={k.replace(/([A-Z])/g, " $1") + " · device local time"}
            name={k}
            type="datetime-local"
            defaultValue={local(e[k])}
            required={k.startsWith("voting")}
          />
        ))}
        <Field
          label="Minimum age"
          name="minAge"
          type="number"
          min={0}
          max={120}
          defaultValue={e.minAge}
        />
        <Field
          label="Maximum age"
          name="maxAge"
          type="number"
          min={0}
          max={120}
          defaultValue={e.maxAge ?? ""}
        />
        <label>
          <input
            name="membershipRequired"
            type="checkbox"
            defaultChecked={e.membershipRequired}
          />{" "}
          Active membership required
        </label>
        <Field
          label="Geographic requirement"
          name="geography"
          defaultValue={e.geography}
        />
        <Field label="Custom eligibility rules">
          <textarea name="customRules" defaultValue={e.customRules} />
        </Field>
        <Field label="Results visibility">
          <select name="resultVisibility" defaultValue={e.resultVisibility}>
            <option value="HIDDEN">Hidden</option>
            <option value="LIVE">Live</option>
            <option value="DELAYED">Delayed</option>
          </select>
        </Field>
        <Field label="Access">
          <select name="access" defaultValue={e.access}>
            {["PUBLIC", "PRIVATE", "ORGANIZATION", "PASSWORD"].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field
          label="New event password (leave blank to keep)"
          name="eventPassword"
          type="password"
          minLength={12}
        />
        <button className="btn">Save draft</button>
      </ActionForm>
      <div className="danger-zone compact-danger">
        <div>
          <b>Delete draft</b>
          <p className="muted">
            Available only before registration or participation begins.
          </p>
        </div>
        <button type="button" className="btn danger-outline" onClick={onDelete}>
          <Trash2 size={16} /> Delete election
        </button>
      </div>
    </details>
  );
}
function Configuration({ organizations, action }) {
  const { data, error } = useLoad("/platform/configuration");
  return (
    <div className="panel">
      <h3>Platform configuration</h3>
      <Feedback error={error} />
      {data && (
        <dl>
          {Object.entries(data)
            .filter(([key]) => key !== "plans")
            .map(([key, value]) => (
              <div key={key}>
                <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
        </dl>
      )}
      <p className="muted">
        Provider secrets and retention configuration are managed through server
        environment variables.
      </p>
      <h3>Organization administration</h3>
      {organizations.map((o) => (
        <div className="notification" key={o.id}>
          <div>
            <b>{o.name}</b>
            <p>
              {o.plan} · {o.suspended ? "Suspended" : "Active"} ·{" "}
              {o.verified ? "Verified" : "Unverified"}
            </p>
          </div>
          <div className="row">
            <button
              className="btn alt"
              onClick={() =>
                action(() =>
                  api(
                    `/platform/organizations/${o.id}`,
                    { suspended: !o.suspended },
                    "PATCH",
                  ),
                )
              }
            >
              {o.suspended ? "Restore" : "Suspend"}
            </button>
            <button
              className="btn alt"
              onClick={() =>
                action(() =>
                  api(
                    `/platform/organizations/${o.id}`,
                    { verified: !o.verified },
                    "PATCH",
                  ),
                )
              }
            >
              {o.verified ? "Remove badge" : "Verify organization"}
            </button>
            <select
              aria-label={`Plan for ${o.name}`}
              value={o.plan}
              onChange={(ev) =>
                action(() =>
                  api(
                    `/platform/organizations/${o.id}`,
                    { plan: ev.target.value },
                    "PATCH",
                  ),
                )
              }
            >
              {["FREE", "PRO", "BUSINESS", "ENTERPRISE"].map((plan) => (
                <option key={plan}>{plan}</option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkspaceIcon({ tab }) {
  const Icon =
    {
      Overview: LayoutDashboard,
      Organizations: Building2,
      Elections: Vote,
      Voters: Users,
      Candidates: UserRound,
      Verification: ShieldCheck,
      Results: BarChart3,
      Analytics: BarChart3,
      "Audit Logs": FileText,
      Security: LockKeyhole,
      Settings,
      Billing: CreditCard,
      Platform: Building2,
    }[tab] || LayoutDashboard;
  return <Icon size={18} />;
}
