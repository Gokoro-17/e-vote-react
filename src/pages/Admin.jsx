import { useEffect, useState } from "react";
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
  CheckCircle2,
  CircleAlert,
  ChevronDown,
  LoaderCircle,
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
  Toast,
} from "../components.jsx";
const next = {
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
function electionWorkflow(e) {
  const now = Date.now(),
    votingStart = new Date(e.votingStart).getTime(),
    votingEnd = new Date(e.votingEnd).getTime(),
    ballotReady = e.positions.length > 0,
    candidatesReady =
      ballotReady &&
      e.positions.every((position) =>
        position.candidates.some(
          (candidate) => candidate.status === "APPROVED",
        ),
      );
  if (e.status === "DRAFT") {
    if (!ballotReady)
      return {
        title: "Add the ballot",
        detail: "Create at least one position or category before launch.",
        label: "Add ballot position",
        kind: "position",
        ballotReady,
        candidatesReady,
        datesReady: now < votingEnd,
      };
    if (!candidatesReady)
      return {
        title: "Add the candidates",
        detail: "Every position needs at least one approved candidate.",
        label: "Add candidates",
        kind: "candidates",
        ballotReady,
        candidatesReady,
        datesReady: now < votingEnd,
      };
    if (now >= votingEnd)
      return {
        title: "Your voting dates have passed",
        detail:
          "Choose a new opening and closing time, save the draft, then launch it.",
        label: "Update voting dates",
        kind: "dates",
        ballotReady,
        candidatesReady,
        datesReady: false,
      };
    const registrationStart = e.registrationStart
      ? new Date(e.registrationStart).getTime()
      : null;
    const registrationEnd = e.registrationEnd
      ? new Date(e.registrationEnd).getTime()
      : null;
    const registrationIsOpen =
      now < votingStart &&
      (registrationStart || registrationEnd) &&
      (!registrationEnd || now < registrationEnd);
    return {
      title:
        now >= votingStart
          ? "Ready to start voting"
          : registrationIsOpen
            ? "Ready to open registration"
            : "Ready to publish",
      detail:
        now >= votingStart
          ? "One click will publish the election and let eligible voters cast ballots."
          : registrationIsOpen
            ? "Publish the election and begin accepting voter registrations."
            : "Publish the election page now. Voting will open automatically at the scheduled time.",
      label:
        now >= votingStart
          ? "Start voting now"
          : registrationIsOpen
            ? "Open voter registration"
            : "Publish and schedule",
      kind: "state",
      target: "LAUNCH",
      ballotReady,
      candidatesReady,
      datesReady: true,
    };
  }
  if (e.status === "VOTING_UPCOMING" && now < votingStart)
    return {
      title: "Election is scheduled",
      detail: `Voting will open automatically on ${date(e.votingStart, e.timezone)}. Share the election link with voters now.`,
      label: "Waiting for voting time",
      kind: "waiting",
    };
  if (e.status === "VOTING_UPCOMING" && now >= votingEnd)
    return {
      title: "The voting window has ended",
      detail: "Refresh the workspace to update the election status.",
      label: "Refresh status",
      kind: "refresh",
    };
  const target = next[e.status];
  return {
    title: target ? `Next: ${labels[target]}` : "Election complete",
    detail:
      e.status === "REGISTRATION_OPEN"
        ? "Invite voters and review eligibility requests, then finish registration."
        : e.status === "VOTING_UPCOMING"
          ? "The voting window is open. Start accepting ballots now."
          : e.status === "VOTING_OPEN"
            ? "Voting is live. Share the link and monitor participation."
            : e.status === "VOTING_CLOSED"
              ? "Voting is closed. Calculate the final result totals."
              : e.status === "RESULTS_PENDING"
                ? "Review the totals, then publish them for voters."
                : e.status === "RESULTS_PUBLISHED"
                  ? "Results are public. Archive the election when your work is finished."
                  : "This election is archived and available for your records.",
    label: target ? labels[target] : "",
    kind: target ? "state" : "complete",
    target,
  };
}
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
      {
        overview: "Home",
        "audit-logs": "Audit Logs",
        new: "Create election",
      }[slug] || slug.charAt(0).toUpperCase() + slug.slice(1),
    setTab = (t) =>
      go(
        t === "Home"
          ? "/workspace/overview"
          : "/workspace/" + t.toLowerCase().replaceAll(" ", "-"),
      ),
    [selected, setSelected] = useState(""),
    [orgId, setOrg] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  const d = dashboard.data,
    e = d?.elections.find((e) => e.id === selected) || d?.elections[0],
    org = orgId || d?.organizations[0]?.id,
    workflow = e ? electionWorkflow(e) : null;
  const reload = () => dashboard.load();
  const refreshWorkspace = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    setMessage("");
    const refreshed = await reload();
    if (refreshed) setMessage("Workspace refreshed.");
    setRefreshing(false);
  };
  const action = async (fn, success = "Action completed.") => {
    try {
      setError("");
      setMessage("");
      await fn();
      setMessage(success);
      await reload();
    } catch (err) {
      setMessage("");
      setError(err.message);
    }
  };
  const save = async (path, data, method) => {
    await api(path, data, method);
    await reload();
  };
  useEffect(() => {
    setError("");
    setMessage("");
  }, [slug]);
  useEffect(() => {
    if (
      user &&
      user.role !== "SUPER_ADMIN" &&
      ["Audit Logs", "Security", "Platform"].includes(tab)
    )
      go("/workspace/overview", { replace: true });
  }, [go, tab, user]);
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
  const adminOrganizations =
      d?.organizations.filter((organization) => canAdmin(organization.id)) ||
      [],
    firstDraft = d?.elections.find((election) => election.status === "DRAFT"),
    mainTabs = ["Home", "Elections", "Organizations", "Billing"];
  const advancedTabs = [
    "Settings",
    "Verification",
    "Analytics",
    ...(user.role === "SUPER_ADMIN"
      ? ["Audit Logs", "Security", "Platform"]
      : []),
  ];
  return (
    <div className="pg workspace">
      <aside className="workspace-sidebar">
        <span className="eyebrow">ORGANIZER WORKSPACE</span>
        <Link
          className="btn sidebar-create"
          to={
            d && !adminOrganizations.length
              ? "/workspace/organizations"
              : "/workspace/new"
          }
        >
          <Plus size={16} />
          {d && !adminOrganizations.length
            ? "Create organization"
            : "New election"}
        </Link>
        <details className="workspace-mobile-nav">
          <summary>
            <span>
              <WorkspaceIcon tab={tab} />
              <span>
                <small>Workspace</small>
                <b>{tab}</b>
              </span>
            </span>
            <ChevronDown size={18} />
          </summary>
          <div className="workspace-mobile-links">
            {[...mainTabs, ...advancedTabs].map((t) => (
              <NavLink
                key={t}
                to={
                  t === "Home"
                    ? "/workspace/overview"
                    : "/workspace/" + t.toLowerCase().replaceAll(" ", "-")
                }
                className={t === tab ? "selected" : ""}
                onClick={(event) =>
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open")
                }
              >
                <WorkspaceIcon tab={t} />
                {t}
              </NavLink>
            ))}
          </div>
        </details>
        <nav className="workspace-desktop-nav" aria-label="Workspace sections">
          {mainTabs.map((t) => (
            <NavLink
              key={t}
              to={
                t === "Home"
                  ? "/workspace/overview"
                  : "/workspace/" + t.toLowerCase().replaceAll(" ", "-")
              }
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
              {tab === "Home" ? `Welcome, ${user.name.split(" ")[0]}.` : tab}
            </h2>
          </div>
          <button
            className="btn alt"
            onClick={refreshWorkspace}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            {refreshing && <LoaderCircle className="spin" size={16} />}
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <Toast
          error={error || dashboard.error}
          message={message}
          onClose={() => {
            setError("");
            setMessage("");
          }}
        />
        {dashboard.loading && !d && <p>Loading workspace…</p>}
        {d && (
          <>
            {tab === "Home" && (
              <>
                <div className="panel workspace-guide">
                  <div>
                    <span className="eyebrow">YOUR NEXT STEP</span>
                    <h3>
                      {!adminOrganizations.length
                        ? "Create your organization"
                        : !d.elections.length
                          ? "Create your first election"
                          : firstDraft
                            ? "Finish your draft election"
                            : "Your workspace is ready"}
                    </h3>
                    <p className="muted">
                      {!adminOrganizations.length
                        ? "Add the school, club, company, or community that will run the election."
                        : !d.elections.length
                          ? "Set the voting dates and add the positions people will vote for."
                          : firstDraft
                            ? "Open the election checklist. E-Vote will show exactly what is missing and the one button to launch it."
                            : "Review participation or create another election whenever you need one."}
                    </p>
                  </div>
                  <Link
                    className="btn"
                    to={
                      !adminOrganizations.length
                        ? "/workspace/organizations"
                        : !d.elections.length
                          ? "/workspace/new"
                          : firstDraft
                            ? "/workspace/elections"
                            : "/workspace/elections"
                    }
                    onClick={() => firstDraft && setSelected(firstDraft.id)}
                  >
                    {!adminOrganizations.length
                      ? "Create organization"
                      : !d.elections.length
                        ? "Create election"
                        : firstDraft
                          ? "Continue setup"
                          : "Manage elections"}
                    <ArrowUpRight size={16} />
                  </Link>
                </div>
                <div className="stats">
                  {[
                    ["Your elections", d.elections.length],
                    ["Registrations", d.stats.registered],
                    ["Ballots cast", d.stats.votes],
                    ["Active now", d.stats.active],
                  ].map(([label, n]) => (
                    <div className="panel" key={label}>
                      <b>{n}</b>
                      {label}
                    </div>
                  ))}
                </div>
                {d.elections.length === 0 ? (
                  <Empty title="No elections yet">
                    Follow the next step above to get started.
                  </Empty>
                ) : (
                  <div className="grid workspace-election-list">
                    {d.elections.slice(0, 4).map((el) => (
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
                canAdmin={canAdmin}
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
              [
                "Elections",
                "Candidates",
                "Voters",
                "Verification",
                "Results",
                "Analytics",
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
                          setMessage("");
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
            {e &&
              ["Elections", "Candidates", "Voters", "Results"].includes(
                tab,
              ) && (
                <nav className="election-flow-nav" aria-label="Election setup">
                  {[
                    ["Elections", "1", "Setup"],
                    ["Candidates", "2", "Candidates"],
                    ["Voters", "3", "Voters"],
                    ["Results", "4", "Results"],
                  ].map(([target, number, label]) => (
                    <button
                      type="button"
                      key={target}
                      className={tab === target ? "current" : ""}
                      aria-current={tab === target ? "step" : undefined}
                      onClick={() => setTab(target)}
                    >
                      <span>{number}</span>
                      {label}
                    </button>
                  ))}
                </nav>
              )}
            {tab === "Elections" && e && (
              <>
                <div className="panel election-next-step">
                  <div>
                    <span className="eyebrow">CURRENT STATUS</span>
                    <span className="pill">{status(e.status)}</span>
                    <h3>{workflow.title}</h3>
                    <p className="muted">{workflow.detail}</p>
                    {e.status === "DRAFT" && (
                      <ul className="launch-checklist">
                        {[
                          [workflow.ballotReady, "Ballot position added"],
                          [
                            workflow.candidatesReady,
                            "Approved candidate added to every position",
                          ],
                          [workflow.datesReady, "Voting dates are still valid"],
                        ].map(([ready, label]) => (
                          <li
                            className={ready ? "ready" : "needs-work"}
                            key={label}
                          >
                            {ready ? (
                              <CheckCircle2 size={17} />
                            ) : (
                              <CircleAlert size={17} />
                            )}
                            {label}
                          </li>
                        ))}
                      </ul>
                    )}
                    <small className="muted">
                      Voting: {date(e.votingStart, e.timezone)} –{" "}
                      {date(e.votingEnd, e.timezone)}
                    </small>
                    {e.access === "PRIVATE" && (
                      <p className="private-election-note">
                        <b>Private election:</b> invite voters from the Voters
                        step before sharing the link. The link alone does not
                        grant access.
                      </p>
                    )}
                  </div>
                  {workflow.kind !== "complete" &&
                    canAdmin(e.organizationId) && (
                      <button
                        className="btn"
                        disabled={
                          workflow.kind === "waiting" ||
                          (workflow.kind === "refresh" && refreshing)
                        }
                        onClick={() => {
                          if (workflow.kind === "candidates") {
                            setTab("Candidates");
                            return;
                          }
                          if (workflow.kind === "position") {
                            document
                              .querySelector(".ballot-position-form")
                              ?.scrollIntoView({ behavior: "smooth" });
                            return;
                          }
                          if (workflow.kind === "dates") {
                            const settings = document.getElementById(
                              `draft-settings-${e.id}`,
                            );
                            if (settings) {
                              settings.open = true;
                              settings.scrollIntoView({ behavior: "smooth" });
                            }
                            return;
                          }
                          if (workflow.kind === "refresh") {
                            refreshWorkspace();
                            return;
                          }
                          if (
                            [
                              "VOTING_CLOSED",
                              "RESULTS_PUBLISHED",
                              "ARCHIVED",
                            ].includes(workflow.target) &&
                            !window.confirm(
                              workflow.label +
                                "? This changes the election for every participant.",
                            )
                          )
                            return;
                          action(
                            () =>
                              api(`/elections/${e.id}/state`, {
                                status: workflow.target,
                              }),
                            workflow.target === "LAUNCH"
                              ? e.access === "PRIVATE"
                                ? "Election launched. Invite voters, then share its link."
                                : "Election launched. You can now share its link with voters."
                              : `${workflow.label} completed.`,
                          );
                        }}
                      >
                        {workflow.kind === "refresh" && refreshing && (
                          <LoaderCircle className="spin" size={16} />
                        )}
                        {workflow.kind === "refresh" && refreshing
                          ? "Refreshing…"
                          : workflow.label}
                      </button>
                    )}
                </div>
                {e.status === "DRAFT" && canAdmin(e.organizationId) && (
                  <ActionForm
                    className="f panel ballot-position-form"
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
                    <p className="muted">
                      For example: President, Treasurer, or People’s Choice.
                    </p>
                    <details className="advanced-options compact-options">
                      <summary>Change voting rules</summary>
                      <div className="advanced-options-body">
                        <Field label="Voting method">
                          <select name="method">
                            {[
                              ["SINGLE", "Choose one"],
                              ["MULTIPLE", "Choose several"],
                              ["APPROVAL", "Approve any number"],
                              ["RANKED", "Rank by preference"],
                              ["WEIGHTED", "Weighted vote"],
                            ].map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
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
                          label="Submissions allowed per voter"
                          name="maxVotes"
                          type="number"
                          defaultValue={1}
                          min={1}
                          max={100}
                        />
                        <label className="check-label">
                          <input name="runoff" type="checkbox" />
                          <span>Flag outcomes that may need a runoff</span>
                        </label>
                      </div>
                    </details>
                    <button className="btn">Add position</button>
                  </ActionForm>
                )}
                <div className="panel position-summary-list">
                  <div className="row between">
                    <h3>Ballot positions</h3>
                    <button
                      className="text-link"
                      onClick={() => setTab("Candidates")}
                    >
                      Manage candidates <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {e.positions.length ? (
                    e.positions.map((p) => (
                      <div key={p.id}>
                        <b>{p.title}</b>
                        <span>
                          {status(p.method)} · {p.candidates.length}{" "}
                          {p.candidates.length === 1
                            ? "candidate"
                            : "candidates"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      Add the first position on the ballot.
                    </p>
                  )}
                </div>
              </>
            )}
            {tab === "Candidates" && e && (
              <>
                {e.status === "DRAFT" && (
                  <div className="panel candidate-setup-guide">
                    <div>
                      <span className="eyebrow">STEP 2 OF 3</span>
                      <h3>
                        {workflow.candidatesReady
                          ? "Your candidates are ready"
                          : "Add the candidates voters can choose"}
                      </h3>
                      <p className="muted">
                        {workflow.candidatesReady
                          ? "Review the checklist and launch the election when your dates are ready."
                          : "Add at least one candidate to every ballot position."}
                      </p>
                    </div>
                    {workflow.candidatesReady && (
                      <button
                        className="btn"
                        onClick={() => setTab("Elections")}
                      >
                        Review and launch <ArrowUpRight size={16} />
                      </button>
                    )}
                  </div>
                )}
                {canAdmin(e.organizationId) &&
                  ["DRAFT", "REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(
                    e.status,
                  ) && (
                    <ActionForm
                      reset
                      success="Candidate added."
                      onSubmit={async (f, form) => {
                        const { image: _image, ...candidateInput } = f;
                        const file = form.elements.image?.files?.[0];
                        const candidate = await api(
                          `/elections/${e.id}/candidates`,
                          {
                            ...candidateInput,
                            accountEmail: f.accountEmail || undefined,
                          },
                        );
                        form.reset();
                        if (file) {
                          try {
                            const image = new FormData();
                            image.set("type", "CANDIDATE");
                            image.set("candidateId", candidate.id);
                            image.set("image", file);
                            await api("/assets", image);
                          } catch (uploadError) {
                            await reload();
                            throw new Error(
                              `Candidate added, but the photo could not upload: ${uploadError.message}`,
                            );
                          }
                        }
                        await reload();
                      }}
                    >
                      <h3>Add candidate</h3>
                      {!e.positions.length && (
                        <Feedback error="Add a ballot position before adding candidates." />
                      )}
                      <Field label="Position">
                        <select
                          name="positionId"
                          required
                          disabled={!e.positions.length}
                        >
                          {e.positions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Candidate name" name="name" required />
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
                      <details className="advanced-options compact-options">
                        <summary>Add profile details</summary>
                        <div className="advanced-options-body">
                          <Field
                            label="Candidate account email (optional)"
                            hint="Use this only when the candidate already has an active member account."
                            name="accountEmail"
                            type="email"
                          />
                          <Field label="Short biography">
                            <textarea name="bio" maxLength={2000} />
                          </Field>
                          <Field label="Manifesto">
                            <textarea name="manifesto" maxLength={5000} />
                          </Field>
                          <Field label="Campaign statement">
                            <textarea name="campaign" maxLength={2000} />
                          </Field>
                        </div>
                      </details>
                      <button className="btn" disabled={!e.positions.length}>
                        Add candidate
                      </button>
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
                            {(c.status === "PENDING"
                              ? ["APPROVED", "REJECTED"]
                              : c.status === "APPROVED"
                                ? ["WITHDRAWN"]
                                : ["APPROVED"]
                            ).map((s) => (
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
                                {s === "APPROVED"
                                  ? "Approve"
                                  : s === "REJECTED"
                                    ? "Reject"
                                    : "Withdraw"}
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
      <div className="notice">
        <ShieldCheck size={18} />
        <span>
          Platform access requires a verified authenticator. Re-verify before
          changing roles or suspending accounts.{" "}
          <Link to="/two-factor?next=%2Fworkspace%2Fplatform">
            Verify authenticator
          </Link>
        </span>
      </div>
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
    <details className="panel" id={`draft-settings-${e.id}`}>
      <summary>Edit election</summary>
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
      Home: LayoutDashboard,
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
