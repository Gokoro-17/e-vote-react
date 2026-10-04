import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { api } from "../store.jsx";
import { Field, Feedback, useLoad } from "../components.jsx";

const methods = ["SINGLE", "MULTIPLE", "APPROVAL", "RANKED", "WEIGHTED"];
const blankPosition = () => ({
  title: "",
  method: "SINGLE",
  maxChoices: 1,
  maxVotes: 1,
  runoff: false,
});

export default function CreateElection({ organizations, onCreated }) {
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [input, setInput] = useState({
      organizationId: organizations[0]?.id || "",
      name: "",
      description: "",
      mode: "GENERAL",
      location: "",
      timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos",
      registrationStart: "",
      registrationEnd: "",
      votingStart: "",
      votingEnd: "",
      publishAt: "",
      minAge: 0,
      maxAge: "",
      membershipRequired: false,
      geography: "",
      customRules: "",
      groupId: "",
      resultVisibility: "HIDDEN",
      access: "PUBLIC",
      eventPassword: "",
      faq: [],
    }),
    [positions, setPositions] = useState([blankPosition()]);
  const groups = useLoad(
    input.organizationId
      ? "/organizations/" + input.organizationId + "/groups"
      : null,
  );
  const phases = ["Basics", "Ballot", "Review"];
  const set = (key, value) => setInput((old) => ({ ...old, [key]: value }));
  const field = (label, key, type = "text", required = false) => (
    <Field
      label={label}
      type={type}
      required={required}
      value={input[key]}
      onChange={(event) => set(key, event.target.value)}
    />
  );
  const updatePosition = (index, key, value) =>
    setPositions((old) =>
      old.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const data = {
        ...input,
        minAge: Number(input.minAge),
        maxAge: input.maxAge === "" ? null : Number(input.maxAge),
        groupId: input.groupId || null,
        eventPassword: input.eventPassword || undefined,
        positions,
      };
      for (const key of [
        "registrationStart",
        "registrationEnd",
        "votingStart",
        "votingEnd",
        "publishAt",
      ])
        data[key] = input[key] ? new Date(input[key]).toISOString() : null;
      onCreated(await api("/elections", data));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  if (!organizations.length)
    return (
      <div className="panel first-step-card">
        <span className="eyebrow">FIRST STEP</span>
        <h2>Create your organization first.</h2>
        <p className="muted">
          Your organization owns its elections, members, branding, and plan.
          This takes less than a minute.
        </p>
        <Link className="btn" to="/workspace/organizations">
          Create organization <ArrowRight size={16} />
        </Link>
      </div>
    );

  return (
    <div className="election-wizard">
      <div className="wizard-steps" aria-label="Election setup progress">
        {phases.map((name, index) => (
          <div
            key={name}
            className={
              step === index ? "current" : step > index ? "complete" : ""
            }
            aria-current={step === index ? "step" : undefined}
          >
            <span>{step > index ? <CheckCircle2 size={17} /> : index + 1}</span>
            {name}
          </div>
        ))}
      </div>
      <form
        className="panel f"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          if (step < phases.length - 1) setStep(step + 1);
          else save();
        }}
      >
        <fieldset disabled={busy}>
          <h2>
            {
              [
                "Name it and choose the dates.",
                "Add the choices.",
                "Review and create.",
              ][step]
            }
          </h2>
          <p className="muted">
            {
              [
                "These are the only details needed to create a draft. Optional controls are available below.",
                "Most elections need one position and one choice per voter. Open advanced rules only when you need them.",
                "You can add candidates, a banner, and make changes before opening registration.",
              ][step]
            }
          </p>

          {step === 0 && (
            <>
              <Field label="Organization">
                <select
                  value={input.organizationId}
                  required
                  onChange={(event) => {
                    set("organizationId", event.target.value);
                    set("groupId", "");
                  }}
                >
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </Field>
              {field("Election name", "name", "text", true)}
              <Field label="Short description">
                <textarea
                  value={input.description}
                  maxLength={3000}
                  onChange={(event) => set("description", event.target.value)}
                />
              </Field>
              <div className="grid two-columns">
                {field("Voting opens", "votingStart", "datetime-local", true)}
                {field("Voting closes", "votingEnd", "datetime-local", true)}
              </div>

              <details className="advanced-options">
                <summary>
                  Optional access, eligibility, and result settings
                </summary>
                <div className="advanced-options-body">
                  <div className="grid two-columns">
                    <Field label="Voting mode">
                      <select
                        value={input.mode}
                        onChange={(event) => {
                          const mode = event.target.value;
                          set("mode", mode);
                          if (mode === "ELECTION_DEMO") {
                            set("resultVisibility", "HIDDEN");
                            setPositions((old) =>
                              old.map((position) => ({
                                ...position,
                                maxVotes: 1,
                                method:
                                  position.method === "WEIGHTED"
                                    ? "SINGLE"
                                    : position.method,
                              })),
                            );
                          }
                        }}
                      >
                        <option value="GENERAL">General voting</option>
                        <option value="ELECTION_DEMO">
                          Formal-election demonstration
                        </option>
                      </select>
                    </Field>
                    {field("Location", "location")}
                  </div>
                  {input.mode === "ELECTION_DEMO" && (
                    <div className="notice">
                      Demonstration only. Official deployment requires separate
                      authorization, certification, and independent review.
                    </div>
                  )}
                  {field("Election timezone", "timezone", "text", true)}
                  <div className="grid two-columns">
                    {field(
                      "Registration opens",
                      "registrationStart",
                      "datetime-local",
                    )}
                    {field(
                      "Registration closes",
                      "registrationEnd",
                      "datetime-local",
                    )}
                  </div>
                  <Field label="Who can access this election?">
                    <select
                      value={input.access}
                      onChange={(event) => set("access", event.target.value)}
                    >
                      <option value="PUBLIC">Anyone with the link</option>
                      <option value="PRIVATE">Invited voters only</option>
                      <option value="ORGANIZATION">
                        Approved organization members
                      </option>
                      <option value="PASSWORD">Anyone with the password</option>
                    </select>
                  </Field>
                  {input.access === "PASSWORD" && (
                    <Field
                      label="Election password"
                      type="password"
                      value={input.eventPassword}
                      minLength={12}
                      required
                      onChange={(event) =>
                        set("eventPassword", event.target.value)
                      }
                    />
                  )}
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={input.membershipRequired}
                      onChange={(event) =>
                        set("membershipRequired", event.target.checked)
                      }
                    />
                    <span>Require approved organization membership</span>
                  </label>
                  <div className="grid two-columns">
                    {field("Minimum age", "minAge", "number")}
                    {field("Maximum age", "maxAge", "number")}
                  </div>
                  {field("Geographic requirement", "geography")}
                  <Field label="Group or constituency">
                    <select
                      value={input.groupId}
                      onChange={(event) => set("groupId", event.target.value)}
                    >
                      <option value="">All approved voters</option>
                      {groups.data?.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Feedback error={groups.error} />
                  <Field label="Other eligibility rule">
                    <textarea
                      value={input.customRules}
                      maxLength={2000}
                      onChange={(event) =>
                        set("customRules", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="When should results appear?">
                    <select
                      value={input.resultVisibility}
                      onChange={(event) =>
                        set("resultVisibility", event.target.value)
                      }
                    >
                      <option value="HIDDEN">When I publish them</option>
                      {input.mode === "GENERAL" && (
                        <option value="LIVE">While voting is open</option>
                      )}
                      <option value="DELAYED">At a scheduled time</option>
                    </select>
                  </Field>
                  {input.resultVisibility === "DELAYED" &&
                    field(
                      "Result publication time",
                      "publishAt",
                      "datetime-local",
                      true,
                    )}
                </div>
              </details>
            </>
          )}

          {step === 1 && (
            <>
              {positions.map((position, index) => (
                <div className="position-editor" key={index}>
                  <div className="row between">
                    <h3>Position {index + 1}</h3>
                    {positions.length > 1 && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remove position ${index + 1}`}
                        onClick={() =>
                          setPositions((old) =>
                            old.filter(
                              (_item, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                  <Field
                    label="Position or category"
                    value={position.title}
                    minLength={2}
                    maxLength={100}
                    required
                    placeholder="For example, President or People’s Choice"
                    onChange={(event) =>
                      updatePosition(index, "title", event.target.value)
                    }
                  />
                  <details className="advanced-options compact-options">
                    <summary>Advanced voting rules</summary>
                    <div className="advanced-options-body">
                      <Field label="Voting method">
                        <select
                          value={position.method}
                          onChange={(event) =>
                            updatePosition(index, "method", event.target.value)
                          }
                        >
                          {methods
                            .filter(
                              (method) =>
                                input.mode !== "ELECTION_DEMO" ||
                                method !== "WEIGHTED",
                            )
                            .map((method) => (
                              <option key={method} value={method}>
                                {method.toLowerCase()}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <div className="grid two-columns">
                        <Field
                          label="Choices per ballot"
                          type="number"
                          min={1}
                          max={100}
                          required
                          value={position.maxChoices}
                          onChange={(event) =>
                            updatePosition(
                              index,
                              "maxChoices",
                              Number(event.target.value),
                            )
                          }
                        />
                        <Field
                          label="Submissions per voter"
                          type="number"
                          min={1}
                          max={input.mode === "ELECTION_DEMO" ? 1 : 100}
                          required
                          value={position.maxVotes}
                          onChange={(event) =>
                            updatePosition(
                              index,
                              "maxVotes",
                              Number(event.target.value),
                            )
                          }
                        />
                      </div>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={position.runoff}
                          onChange={(event) =>
                            updatePosition(
                              index,
                              "runoff",
                              event.target.checked,
                            )
                          }
                        />
                        <span>Flag outcomes that may need a runoff</span>
                      </label>
                    </div>
                  </details>
                </div>
              ))}
              <button
                type="button"
                className="btn alt"
                onClick={() => setPositions((old) => [...old, blankPosition()])}
              >
                <Plus size={17} /> Add another position
              </button>
            </>
          )}

          {step === 2 && (
            <div className="wizard-review">
              <h3>{input.name}</h3>
              <p>
                {
                  organizations.find(
                    (organization) => organization.id === input.organizationId,
                  )?.name
                }
              </p>
              <dl>
                <div>
                  <dt>Voting opens</dt>
                  <dd>{new Date(input.votingStart).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Voting closes</dt>
                  <dd>{new Date(input.votingEnd).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>
                    {input.access === "PUBLIC"
                      ? "Anyone with the link"
                      : input.access.toLowerCase()}
                  </dd>
                </div>
                <div>
                  <dt>Positions</dt>
                  <dd>{positions.length}</dd>
                </div>
              </dl>
              {positions.map((position, index) => (
                <p key={index}>
                  {position.title} · {position.method.toLowerCase()}
                </p>
              ))}
              <p className="notice">
                This creates a draft. Add candidates and review it before you
                open registration.
              </p>
            </div>
          )}

          <Feedback error={error} />
          <div className="wizard-actions">
            {step > 0 && (
              <button
                type="button"
                className="btn alt"
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft size={16} /> Back
              </button>
            )}
            <button className="btn" disabled={!organizations.length || busy}>
              {busy
                ? "Creating election…"
                : step === phases.length - 1
                  ? "Create draft"
                  : "Continue"}{" "}
              <ArrowRight size={16} />
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
