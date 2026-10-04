import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Bell, FileCheck2, Users, Vote } from "lucide-react";
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
    [tab, setTab] = useState("Active");
  const ended = [
    "VOTING_CLOSED",
    "RESULTS_PENDING",
    "RESULTS_PUBLISHED",
    "ARCHIVED",
  ];
  const rows =
    elections.data?.filter((e) =>
      tab === "Active"
        ? e.status === "VOTING_OPEN"
        : tab === "Upcoming"
          ? ["REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(e.status)
          : tab === "Completed"
            ? ended.includes(e.status)
            : true,
    ) || [];
  return (
    <div className="pg">
      <PageHeading
        eyebrow="YOUR VOTING DASHBOARD"
        title={"Welcome, " + user.name.split(" ")[0] + "."}
        action={
          <Link className="btn alt" to="/notifications">
            <Bell size={17} /> Notifications
          </Link>
        }
      >
        Your elections, communities, and participation in one place.
      </PageHeading>
      <div className="dashboard-actions">
        <Link to="/elections">
          <Vote size={23} />
          <div>
            <b>Find an election</b>
            <span>Explore events and check your eligibility</span>
          </div>
          <ArrowUpRight size={18} />
        </Link>
        <Link to="/organizations">
          <Users size={23} />
          <div>
            <b>Join your community</b>
            <span>Find your organization and request access</span>
          </div>
          <ArrowUpRight size={18} />
        </Link>
        <Link to="/account">
          <FileCheck2 size={23} />
          <div>
            <b>Manage your profile</b>
            <span>Review verification and privacy settings</span>
          </div>
          <ArrowUpRight size={18} />
        </Link>
      </div>
      <section className="s">
        <div className="section-heading">
          <h2>Your elections</h2>
          <Link className="text-link" to="/elections">
            Browse all elections <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="tabs" role="tablist" aria-label="Election status">
          {["Active", "Upcoming", "Completed", "All"].map((t) => (
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
              Events available to you will appear here. Explore organizations to
              find your community.
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
