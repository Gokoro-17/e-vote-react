import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Bell, Building2, Users, Vote } from "lucide-react";
import { useStore } from "../store.jsx";
import {
  useLoad,
  PageHeading,
  Loading,
  LoadError,
  Empty,
  date,
  Badge,
} from "../components.jsx";
import { ElectionCard } from "./Public.jsx";
export default function Dashboard() {
  const { user } = useStore(),
    elections = useLoad("/elections"),
    receipts = useLoad("/account/receipts"),
    memberships = useLoad("/account/memberships"),
    membershipRequests = useLoad("/account/membership-requests"),
    [tab, setTab] = useState("Open now");
  const ended = [
    "VOTING_CLOSED",
    "RESULTS_PENDING",
    "RESULTS_PUBLISHED",
    "ARCHIVED",
  ];
  const rows =
    elections.data?.filter((e) =>
      tab === "Open now"
        ? e.status === "VOTING_OPEN"
        : tab === "Upcoming"
          ? ["REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(e.status)
          : tab === "Past"
            ? ended.includes(e.status)
            : false,
    ) || [];
  return (
    <div className="pg">
      <PageHeading
        eyebrow="YOUR VOTING DASHBOARD"
        title={"Hi, " + user.name.split(" ")[0] + "."}
        action={
          <Link className="btn alt" to="/notifications">
            <Bell size={17} /> Notifications
          </Link>
        }
      >
        Choose what you want to do next.
      </PageHeading>
      <h2 className="dashboard-prompt">What would you like to do?</h2>
      <div className="dashboard-actions">
        <Link to="/elections">
          <Vote size={23} />
          <div>
            <b>Vote in an election</b>
            <span>Find an open event and review your eligibility</span>
          </div>
          <ArrowUpRight size={18} />
        </Link>
        <Link to="/organizations">
          <Users size={23} />
          <div>
            <b>Join an organization</b>
            <span>Request access to your school, club, or community</span>
          </div>
          <ArrowUpRight size={18} />
        </Link>
        <Link to="/workspace">
          <Building2 size={23} />
          <div>
            <b>Organize an election</b>
            <span>Create an organization or manage an existing vote</span>
          </div>
          <ArrowUpRight size={18} />
        </Link>
      </div>
      <section className="s">
        <div className="section-heading">
          <h2>Elections available to you</h2>
          <Link className="text-link" to="/elections">
            Browse all elections <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="tabs" role="tablist" aria-label="Election status">
          {["Open now", "Upcoming", "Past"].map((t) => (
            <button
              key={t}
              id={"tab-" + t}
              role="tab"
              aria-selected={t === tab}
              aria-controls="dashboard-elections"
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div
          id="dashboard-elections"
          role="tabpanel"
          aria-labelledby={"tab-" + tab}
        >
          {elections.loading ? (
            <Loading />
          ) : elections.error ? (
            <LoadError error={elections.error} retry={elections.load} />
          ) : rows.length ? (
            <div className="grid election-grid">
              {rows.map((e) => (
                <ElectionCard key={e.id} e={e} />
              ))}
            </div>
          ) : (
            <Empty title={"No " + tab.toLowerCase() + " elections yet"}>
              Events available to you will appear here. Browse elections or join
              your organization to get started.
            </Empty>
          )}
        </div>
      </section>
      <div className="grid two-columns">
        <section className="panel">
          <h3>Your organizations</h3>
          {memberships.loading ? (
            <Loading />
          ) : memberships.error ? (
            <LoadError error={memberships.error} retry={memberships.load} />
          ) : memberships.data?.length ? (
            memberships.data.map((m) => (
              <Link
                className="organization-row"
                key={m.organizationId}
                to={"/organizations/" + m.organization.slug}
              >
                <span
                  className="org-avatar"
                  style={{ background: m.organization.color }}
                >
                  {m.organization.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <b>{m.organization.name}</b>
                  <small>Membership approved · {m.role.toLowerCase()}</small>
                </div>
                <ArrowUpRight size={16} />
              </Link>
            ))
          ) : (
            <p className="muted">Your active memberships will appear here.</p>
          )}
          {membershipRequests.loading ? (
            <Loading>Checking membership requests…</Loading>
          ) : membershipRequests.error ? (
            <LoadError
              error={membershipRequests.error}
              retry={membershipRequests.load}
            />
          ) : (
            membershipRequests.data
              ?.filter((request) => request.status !== "APPROVED")
              .map((request) => (
                <Link
                  className="organization-row"
                  key={request.organizationId}
                  to={"/organizations/" + request.organization.slug}
                >
                  <span
                    className="org-avatar"
                    style={{ background: request.organization.color }}
                  >
                    {request.organization.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <b>{request.organization.name}</b>
                    <small>
                      {request.status === "PENDING"
                        ? "Waiting for an administrator"
                        : "Request declined"}
                    </small>
                  </div>
                  <Badge value={request.status} />
                </Link>
              ))
          )}
        </section>
        <section className="panel">
          <h3>Voting confirmations</h3>
          {receipts.loading ? (
            <Loading />
          ) : receipts.error ? (
            <LoadError error={receipts.error} retry={receipts.load} />
          ) : receipts.data?.length ? (
            receipts.data.map((r) => (
              <div className="receipt-row" key={r.id}>
                <Link to={"/elections/" + r.position.election.slug}>
                  <b>{r.position.election.name}</b>
                </Link>
                <span>{r.position.title}</span>
                <code>{r.id}</code>
                <small>{date(r.recordedAt)}</small>
              </div>
            ))
          ) : (
            <p className="muted">
              Your receipts will appear after you vote. They never contain
              candidate selections.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
