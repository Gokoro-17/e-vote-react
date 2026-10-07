import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, ArrowUpRight, Users, Trash2 } from "lucide-react";
import { api } from "../store.jsx";
import {
  ActionForm,
  Field,
  useLoad,
  Loading,
  LoadError,
  Empty,
  Feedback,
  ImageUpload,
  date,
} from "../components.jsx";
export function EligibilityGroup({
  organizationId,
  defaultValue = "",
  options,
}) {
  const groups = useLoad(
    !options && organizationId
      ? `/organizations/${organizationId}/groups`
      : null,
  );
  const [value, setValue] = useState(defaultValue);
  return (
    <Field label="Verified constituency / group">
      <select
        name="groupId"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={groups.loading}
      >
        <option value="">No group assigned</option>
        {(options || groups.data || []).map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
      {groups.error && <Feedback error={groups.error} />}
    </Field>
  );
}
export function OrganizationAdmin({ organizations, reload, canAdmin }) {
  const [removing, setRemoving] = useState("");
  return (
    <>
      <div className="grid two-columns">
        <ActionForm
          reset
          onSubmit={async (f) => {
            await api("/organizations", f);
            reload();
          }}
          success="Organization created. You can now create its first election."
        >
          <h3>Create an organization</h3>
          <Field
            label="Organization name"
            name="name"
            required
            minLength={2}
            maxLength={100}
          />
          <Field label="Description">
            <textarea name="description" maxLength={1000} />
          </Field>
          <button className="btn">
            <Plus size={16} /> Create organization
          </button>
        </ActionForm>
        <div className="panel">
          <Users size={29} />
          <h3>A workspace for your community</h3>
          <p className="muted">
            Create your organization, invite administrators and moderators, then
            define your election’s eligibility rules. Membership and election
            eligibility are reviewed separately.
          </p>
          <Link className="text-link" to="/workspace/settings">
            Manage team access <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
      <section className="s">
        <h3>Your organizations</h3>
        {organizations.length ? (
          <div className="organization-grid">
            {organizations.map((o) => (
              <article className="organization-card" key={o.id}>
                <span className="org-avatar" style={{ background: o.color }}>
                  {o.name.slice(0, 2).toUpperCase()}
                </span>
                <h3>{o.name}</h3>
                <p>{o.description}</p>
                <Link className="text-link" to={"/organizations/" + o.slug}>
                  Public profile <ArrowUpRight size={16} />
                </Link>
                {canAdmin(o.id) &&
                  (removing === o.id ? (
                    <ActionForm
                      className="f organization-delete"
                      success=""
                      onSubmit={async (form) => {
                        await api(
                          "/organizations/" + o.id,
                          { confirmation: form.confirmation },
                          "DELETE",
                        );
                        setRemoving("");
                        await reload();
                      }}
                    >
                      <p className="muted">
                        This removes the profile, members, requests, and draft
                        elections. Organizations with active elections or
                        billing records cannot be deleted.
                      </p>
                      <Field
                        label={`Type ${o.name} to confirm`}
                        name="confirmation"
                        autoComplete="off"
                        required
                      />
                      <div className="row">
                        <button className="btn danger">
                          Permanently delete
                        </button>
                        <button
                          type="button"
                          className="btn alt"
                          onClick={() => setRemoving("")}
                        >
                          Cancel
                        </button>
                      </div>
                      <small className="muted">
                        If you signed in more than 10 minutes ago, sign in again
                        before retrying.
                      </small>
                    </ActionForm>
                  ) : (
                    <button
                      type="button"
                      className="text-link danger-link"
                      onClick={() => setRemoving(o.id)}
                    >
                      <Trash2 size={15} /> Delete organization
                    </button>
                  ))}
              </article>
            ))}
          </div>
        ) : (
          <Empty title="Start with your organization">
            Create a workspace for the people who will participate in your
            elections.
          </Empty>
        )}
      </section>
    </>
  );
}
export function PageControls({ data, page, setPage }) {
  if (!data || data.pages < 2) return null;
  return (
    <nav className="row between pagination" aria-label="Result pages">
      <button
        className="btn alt"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} of {data.pages} · {data.total} records
      </span>
      <button
        className="btn alt"
        disabled={page >= data.pages}
        onClick={() => setPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
export function RunoffDraft({ election, onCreated }) {
  const results = useLoad(`/elections/${election.id}/results`);
  const positions =
    results.data?.positions.filter((p) => p.runoffRequired && p.ballots > 0) ||
    [];
  if (results.loading) return <Loading />;
  if (results.error)
    return <LoadError error={results.error} retry={results.load} />;
  if (!positions.length) return null;
  return (
    <ActionForm
      onSubmit={async (f, form) => {
        const data = {
          name: f.name,
          votingStart: new Date(f.votingStart).toISOString(),
          votingEnd: new Date(f.votingEnd).toISOString(),
          positions: new FormData(form).getAll("positions"),
        };
        const runoff = await api(`/elections/${election.id}/runoff`, data);
        await onCreated(runoff);
      }}
    >
      <span className="eyebrow">RUNOFF</span>
      <h3>Schedule a deciding round</h3>
      <p className="muted">
        A new draft carries forward the two leading candidates and anyone tied
        at the cutoff. Verified registrations carry forward; voting eligibility
        is checked again for the new election. Review the draft before opening
        it.
      </p>
      <Field
        label="Runoff election name"
        name="name"
        defaultValue={election.name + " — Runoff"}
        required
        minLength={3}
        maxLength={140}
      />
      {positions.map((p) => (
        <label className="checkbox-row" key={p.id}>
          <input name="positions" value={p.id} type="checkbox" defaultChecked />
          <span>{p.title}</span>
        </label>
      ))}
      <div className="grid two-columns">
        <Field
          label="Voting start · device local time"
          name="votingStart"
          type="datetime-local"
          required
        />
        <Field
          label="Voting end · device local time"
          name="votingEnd"
          type="datetime-local"
          required
        />
      </div>
      <button className="btn">Create runoff draft</button>
    </ActionForm>
  );
}
export function ElectionPeople({ election, canAdmin, verification = false }) {
  const [page, setPage] = useState(1),
    [q, setQuery] = useState(""),
    [message, setMessage] = useState("");
  const kind = verification ? "verification" : "voters";
  const rows = useLoad(
    `/elections/${election.id}/${kind}?page=${page}&q=${encodeURIComponent(q)}`,
  );
  const groupList = useLoad(
    verification ? `/organizations/${election.organizationId}/groups` : null,
  );
  const canReview = ["REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(
    election.status,
  );
  return (
    <>
      {!verification && canAdmin && (
        <ActionForm
          reset
          onSubmit={async (f) => {
            const result = await api(
              `/elections/${election.id}/invitations`,
              f,
            );
            setMessage("Invitation created: " + result.link);
          }}
        >
          <h3>Invite a voter</h3>
          <Field label="Email" name="email" type="email" required />
          <button className="btn">Create invitation</button>
        </ActionForm>
      )}
      <Feedback message={message} />
      {verification && <Feedback error={groupList.error} />}
      {verification && !canReview && (
        <p className="notice">Eligibility reviews close when voting starts.</p>
      )}
      <ActionForm
        onSubmit={(f) => {
          setPage(1);
          setQuery(f.q.trim());
        }}
      >
        <div className="row search-controls">
          <Field
            label={
              verification
                ? "Search verification requests"
                : "Search registered voters"
            }
            name="q"
            type="search"
            maxLength={100}
          />
          <button className="btn alt">Search</button>
        </div>
      </ActionForm>
      {rows.loading ? (
        <Loading />
      ) : rows.error ? (
        <LoadError error={rows.error} retry={rows.load} />
      ) : (
        rows.data && (
          <>
            {!rows.data.items.length && (
              <Empty
                title={
                  q
                    ? "No matching records"
                    : verification
                      ? "No verification requests yet"
                      : "No voters registered yet"
                }
              >
                {q
                  ? "Try another name or email address."
                  : verification
                    ? "Requests appear here when voters submit their eligibility information."
                    : "Share the election link or invite voters by email."}
              </Empty>
            )}
            {!verification && rows.data.items.length > 0 && (
              <div className="panel table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Eligibility</th>
                      <th>Group</th>
                      <th>Review reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.data.items.map((v) => (
                      <tr key={v.userId}>
                        <td>{v.user.name}</td>
                        <td>{v.user.email}</td>
                        <td>{statusLabel(v.status)}</td>
                        <td>{v.group?.name || "—"}</td>
                        <td>{v.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {verification &&
              rows.data.items.map((v) => (
                <ActionForm
                  key={v.id}
                  success="Review recorded."
                  onSubmit={async (f) => {
                    await api(`/verification/${v.id}/review`, {
                      ...f,
                      weight: Number(f.weight),
                      groupId: f.groupId || null,
                    });
                    await rows.load();
                  }}
                >
                  <div className="row between">
                    <h3>{v.user.name}</h3>
                    <span className="pill">{statusLabel(v.status)}</span>
                  </div>
                  <p className="muted">
                    {v.user.email} · {statusLabel(v.type)} · {date(v.createdAt)}
                  </p>
                  {v.note && <p>{v.note}</p>}
                  {v.document && (
                    <a href={`/api/documents/${v.document.id}`}>
                      Download protected document
                    </a>
                  )}
                  {v.status === "PENDING" &&
                    canReview &&
                    (v.type === "IDENTITY" ? (
                      canAdmin ? (
                        <ProviderReview requestId={v.id} reload={rows.load} />
                      ) : (
                        <p className="muted">
                          An organization administrator must send this request
                          to the authorized identity provider.
                        </p>
                      )
                    ) : (
                      <>
                        <Field label="Decision">
                          <select name="status">
                            <option value="VERIFIED">
                              Verify election eligibility
                            </option>
                            <option value="REJECTED">Reject with reason</option>
                          </select>
                        </Field>
                        <Field
                          label="Review reason"
                          name="reason"
                          required
                          minLength={3}
                          maxLength={500}
                        />
                        <Field
                          label="Verified geographic eligibility"
                          name="geography"
                          maxLength={100}
                        />
                        <EligibilityGroup
                          organizationId={election.organizationId}
                          defaultValue={election.groupId || ""}
                          options={groupList.data || []}
                        />
                        <Field
                          label="Voting weight (weighted categories only)"
                          name="weight"
                          type="number"
                          min={1}
                          max={100}
                          defaultValue={1}
                          required
                        />
                        <button
                          className="btn"
                          disabled={
                            groupList.loading || Boolean(groupList.error)
                          }
                        >
                          Record review
                        </button>
                      </>
                    ))}
                </ActionForm>
              ))}
            <PageControls data={rows.data} page={page} setPage={setPage} />
          </>
        )
      )}
    </>
  );
}
function statusLabel(value) {
  return value.replaceAll("_", " ").toLowerCase();
}
function ProviderReview({ requestId, reload }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      <Feedback error={error} />
      <button
        className="btn"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api(`/verification/${requestId}/provider`, {});
            await reload();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking provider…" : "Verify with authorized provider"}
      </button>
    </div>
  );
}
export function OrganizationSettings({ organization, canAdmin, reload }) {
  const members = useLoad(
      organization ? "/organizations/" + organization.id + "/members" : null,
    ),
    requests = useLoad(
      organization && canAdmin
        ? "/organizations/" + organization.id + "/join-requests"
        : null,
    ),
    groups = useLoad(
      organization ? "/organizations/" + organization.id + "/groups" : null,
    );
  if (!organization)
    return (
      <Empty title="Create an organization first">
        You can set up your organization from the Organizations section.
      </Empty>
    );
  if (!canAdmin)
    return (
      <div className="panel">
        <h3>Organization settings</h3>
        <p>
          Organization administrators manage branding, group configuration, and
          team access.
        </p>
      </div>
    );
  const save = async (path, body, method) => {
    await api(path, body, method);
    reload();
    members.load();
    requests.load();
    groups.load();
  };
  return (
    <>
      <div className="grid two-columns">
        <ActionForm
          key={organization.id}
          onSubmit={(f) =>
            save("/organizations/" + organization.id, f, "PATCH")
          }
        >
          <h3>Organization identity</h3>
          <Field
            label="Name"
            name="name"
            defaultValue={organization.name}
            required
          />
          <Field label="Description">
            <textarea
              name="description"
              defaultValue={organization.description}
              maxLength={2000}
            />
          </Field>
          <Field
            label="Brand color"
            name="color"
            type="color"
            defaultValue={organization.color}
          />
          <Field
            label="Welcome message"
            name="welcome"
            defaultValue={organization.welcome}
            maxLength={500}
          />
          <Field
            label="Contact information"
            name="contact"
            defaultValue={organization.contact}
            maxLength={200}
          />
          <button className="btn">Save organization</button>
        </ActionForm>
        <div className="panel">
          <h3>Organization logo</h3>
          {organization.logo && (
            <img
              className="organization-logo"
              src={organization.logo}
              alt="Current organization logo"
            />
          )}
          <ImageUpload
            type="LOGO"
            organizationId={organization.id}
            onSaved={reload}
          />
          <h3>Groups & constituencies</h3>
          <p className="muted">
            Use groups to restrict an election to a verified part of your
            organization.
          </p>
          <Feedback error={groups.error} />
          {groups.data?.map((g) => (
            <p key={g.id}>{g.name}</p>
          ))}
          <ActionForm
            className="f"
            reset
            onSubmit={(f) =>
              save("/organizations/" + organization.id + "/groups", f)
            }
          >
            <Field label="Group name" name="name" required minLength={2} />
            <button className="btn alt">
              <Plus size={16} /> Add group
            </button>
          </ActionForm>
        </div>
      </div>
      <section className="s">
        <h3>Team & membership</h3>
        <ActionForm
          onSubmit={(f) =>
            save("/organizations/" + organization.id + "/members", {
              ...f,
              active: f.active === "on",
            })
          }
        >
          <div className="grid two-columns">
            <Field
              label="Existing account email"
              name="email"
              type="email"
              required
            />
            <Field label="Organization role">
              <select name="role">
                {["VOTER", "CANDIDATE", "MODERATOR", "ADMIN"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
          </div>
          <label className="check-label">
            <input name="active" type="checkbox" defaultChecked />
            <span>Active membership</span>
          </label>
          <button className="btn">Save access</button>
        </ActionForm>
        {members.loading ? (
          <Loading />
        ) : members.error ? (
          <LoadError error={members.error} retry={members.load} />
        ) : (
          <div className="panel table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {members.data?.map((m) => (
                  <tr key={m.userId}>
                    <td>{m.user.name}</td>
                    <td>{m.user.email}</td>
                    <td>{m.role.toLowerCase()}</td>
                    <td>{m.active ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="s">
        <h3>Membership requests</h3>
        {requests.loading ? (
          <Loading />
        ) : requests.error ? (
          <LoadError error={requests.error} retry={requests.load} />
        ) : requests.data?.filter((r) => r.status === "PENDING").length ? (
          requests.data
            .filter((r) => r.status === "PENDING")
            .map((r) => (
              <ActionForm
                key={r.userId}
                onSubmit={(f) =>
                  save(
                    "/organizations/" +
                      organization.id +
                      "/join-requests/" +
                      r.userId,
                    f,
                  )
                }
              >
                <h3>{r.user.name}</h3>
                <p>{r.user.email}</p>
                <p>{r.message}</p>
                <small>{date(r.createdAt)}</small>
                <Field label="Decision">
                  <select name="status">
                    <option value="APPROVED">Approve membership</option>
                    <option value="REJECTED">Decline request</option>
                  </select>
                </Field>
                <button className="btn">Record decision</button>
              </ActionForm>
            ))
        ) : (
          <Empty title="No requests awaiting review">
            Membership requests from your public profile will appear here.
          </Empty>
        )}
      </section>
    </>
  );
}
export function DraftExtras({ election, save }) {
  const groups = useLoad(
      "/organizations/" + election.organizationId + "/groups",
    ),
    [faq, setFaq] = useState(election.faq || []);
  return (
    <details className="panel">
      <summary>Banner, constituency & election questions</summary>
      <ImageUpload
        type="BANNER"
        electionId={election.id}
        onSaved={() => save()}
      />
      <ActionForm
        className="f"
        onSubmit={(f) =>
          save(
            "/elections/" + election.id,
            { groupId: f.groupId || null, faq },
            "PATCH",
          )
        }
      >
        <Field label="Eligible group or constituency">
          <select name="groupId" defaultValue={election.groupId || ""}>
            <option value="">All approved voters</option>
            {groups.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Feedback error={groups.error} />
        <h3>Election questions</h3>
        {faq.map((item, i) => (
          <div className="position-editor" key={i}>
            <Field
              label="Question"
              value={item.question}
              required
              minLength={3}
              maxLength={200}
              onChange={(ev) =>
                setFaq((old) =>
                  old.map((q, index) =>
                    i === index ? { ...q, question: ev.target.value } : q,
                  ),
                )
              }
            />
            <Field label="Answer">
              <textarea
                value={item.answer}
                required
                minLength={3}
                maxLength={1000}
                onChange={(ev) =>
                  setFaq((old) =>
                    old.map((q, index) =>
                      i === index ? { ...q, answer: ev.target.value } : q,
                    ),
                  )
                }
              />
            </Field>
            <button
              className="btn alt"
              type="button"
              onClick={() =>
                setFaq((old) => old.filter((_q, index) => i !== index))
              }
            >
              Remove question
            </button>
          </div>
        ))}
        {faq.length < 12 && (
          <button
            className="btn alt"
            type="button"
            onClick={() =>
              setFaq((old) => [...old, { question: "", answer: "" }])
            }
          >
            <Plus size={16} /> Add question
          </button>
        )}
        <button className="btn">Save public page details</button>
      </ActionForm>
    </details>
  );
}
export function PositionEditor({ position, save }) {
  return (
    <details className="panel">
      <summary>
        {position.title} · {position.method.toLowerCase()}
      </summary>
      <ActionForm
        className="f"
        onSubmit={(f) =>
          save(
            "/positions/" + position.id,
            {
              ...f,
              maxChoices: Number(f.maxChoices),
              maxVotes: Number(f.maxVotes),
              runoff: f.runoff === "on",
            },
            "PATCH",
          )
        }
      >
        <Field
          label="Position title"
          name="title"
          defaultValue={position.title}
          required
        />
        <Field label="Voting method">
          <select name="method" defaultValue={position.method}>
            {["SINGLE", "MULTIPLE", "APPROVAL", "RANKED", "WEIGHTED"].map(
              (m) => (
                <option key={m}>{m}</option>
              ),
            )}
          </select>
        </Field>
        <div className="grid two-columns">
          <Field
            label="Maximum selections"
            name="maxChoices"
            type="number"
            min={1}
            max={100}
            defaultValue={position.maxChoices}
            required
          />
          <Field
            label="Submissions per voter"
            name="maxVotes"
            type="number"
            min={1}
            max={100}
            defaultValue={position.maxVotes}
            required
          />
        </div>
        <label className="check-label">
          <input
            name="runoff"
            type="checkbox"
            defaultChecked={position.runoff}
          />
          <span>Flag outcomes requiring a runoff</span>
        </label>
        <button className="btn">Save position</button>
      </ActionForm>
      <ActionForm
        className="f"
        onSubmit={async (f) => {
          if (f.confirm !== position.title)
            throw new Error("Enter the position title exactly.");
          await save("/positions/" + position.id, undefined, "DELETE");
        }}
      >
        <Field
          label={
            "Type " +
            position.title +
            " to remove this draft position and its candidates"
          }
          name="confirm"
          required
        />
        <button className="btn danger-outline">Remove position</button>
      </ActionForm>
    </details>
  );
}
export function PlatformSettings({ reload }) {
  const settings = useLoad("/platform/settings");
  return (
    <div className="panel">
      <h3>Platform preferences</h3>
      {settings.loading ? (
        <Loading />
      ) : settings.error ? (
        <LoadError error={settings.error} retry={settings.load} />
      ) : (
        <ActionForm
          className="f"
          onSubmit={async (f) => {
            await api(
              "/platform/settings",
              { ...f, documentRetentionDays: Number(f.documentRetentionDays) },
              "PATCH",
            );
            settings.load();
            reload();
          }}
        >
          <Field
            label="Document retention in days"
            name="documentRetentionDays"
            type="number"
            min={1}
            max={90}
            required
            defaultValue={settings.data?.documentRetentionDays || 30}
          />
          <Field
            label="Privacy / support contact email"
            name="contactEmail"
            type="email"
            defaultValue={settings.data?.contactEmail || ""}
          />
          <Field
            label="Welcome message"
            name="welcomeMessage"
            maxLength={500}
            defaultValue={settings.data?.welcomeMessage || ""}
          />
          <button className="btn">Save platform settings</button>
        </ActionForm>
      )}
    </div>
  );
}
