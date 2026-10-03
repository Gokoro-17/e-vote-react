import { useState } from "react";
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
  const set = (key, value) => setInput((old) => ({ ...old, [key]: value }));
  const field = (label, key, type = "text", required = false) => (
    <Field
      label={label}
      type={type}
      required={required}
      value={input[key]}
      onChange={(ev) => set(key, ev.target.value)}
    />
  );
  const phases = ["Details", "Schedule", "Eligibility", "Ballot", "Review"];
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
      const election = await api("/elections", data);
      onCreated(election);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="election-wizard">
      <div className="wizard-steps" aria-label="Election setup progress">
        {phases.map((name, i) => (
          <div
            key={name}
            className={step === i ? "current" : step > i ? "complete" : ""}
            aria-current={step === i ? "step" : undefined}
          >
            <span>{step > i ? <CheckCircle2 size={17} /> : i + 1}</span>
            {name}
          </div>
        ))}
      </div>
      <form
        className="panel f"
        onSubmit={(ev) => {
          ev.preventDefault();
          setError("");
          if (step < phases.length - 1) setStep(step + 1);
          else save();
        }}
      >
        <fieldset disabled={busy}>
          <h2>
            {
              [
                "Make it yours.",
                "Set the timeline.",
                "Define who can participate.",
                "Build your ballot.",
                "Ready for the next step.",
              ][step]
            }
          </h2>
          <p className="muted">
            {
              [
                "Start with the organization and purpose of your election.",
                "Dates below use your device’s local time. The election timezone controls public display and age eligibility.",
                "Eligibility is checked on the server before every submission.",
                "Each position can use its own voting method and participation limit.",
                "Your election starts as a draft. Add candidates and review everything before opening registration.",
              ][step]
            }
          </p>
          {step === 0 && (
            <>
              <Field label="Organization">
                <select
                  value={input.organizationId}
                  required
                  onChange={(ev) => {
                    set("organizationId", ev.target.value);
                    set("groupId", "");
                  }}
                >
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
              {field("Election name", "name", "text", true)}
              <Field label="Description">
                <textarea
                  value={input.description}
                  maxLength={3000}
                  onChange={(ev) => set("description", ev.target.value)}
                />
              </Field>
              <div className="grid two-columns">
                <Field label="Voting mode">
                  <select
                    value={input.mode}
                    onChange={(ev) => {
                      set("mode", ev.target.value);
                      if (ev.target.value === "ELECTION_DEMO") {
                        set("resultVisibility", "HIDDEN");
                        setPositions((old) =>
                          old.map((p) => ({
                            ...p,
                            maxVotes: 1,
                            method:
                              p.method === "WEIGHTED" ? "SINGLE" : p.method,
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
                {field("Location, if applicable", "location")}
              </div>
              {input.mode === "ELECTION_DEMO" && (
                <div className="notice">
                  Demonstration only. Voting requires an authorized identity
                  provider. Official government deployment needs separate
                  approval, certification, and independent review.
                </div>
              )}
            </>
          )}
          {step === 1 && (
            <>
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
                {field("Voting opens", "votingStart", "datetime-local", true)}
                {field("Voting closes", "votingEnd", "datetime-local", true)}
              </div>
              <Field label="Results visibility">
                <select
                  value={input.resultVisibility}
                  onChange={(ev) => set("resultVisibility", ev.target.value)}
                >
                  <option value="HIDDEN">Hidden until you publish</option>
                  {input.mode === "GENERAL" && (
                    <option value="LIVE">Live while voting is open</option>
                  )}
                  <option value="DELAYED">Publish at a scheduled time</option>
                </select>
              </Field>
              {field(
                "Result publication date",
                "publishAt",
                "datetime-local",
                input.resultVisibility === "DELAYED",
              )}
            </>
          )}
          {step === 2 && (
            <>
              <div className="grid two-columns">
                {field("Minimum age", "minAge", "number")}
                {field("Maximum age, if required", "maxAge", "number")}
              </div>
              <p className="muted">
                Age rules use an authorized provider’s verified date of birth.
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={input.membershipRequired}
                  onChange={(ev) =>
                    set("membershipRequired", ev.target.checked)
                  }
                />
                <span>Require active organization membership</span>
              </label>
              {field("Geographic requirement", "geography")}
              <Field label="Group or constituency">
                <select
                  value={input.groupId}
                  onChange={(ev) => set("groupId", ev.target.value)}
                >
                  <option value="">All approved voters</option>
                  {groups.data?.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Feedback error={groups.error} />
              <Field label="Custom eligibility rules">
                <textarea
                  value={input.customRules}
                  maxLength={2000}
                  onChange={(ev) => set("customRules", ev.target.value)}
                />
              </Field>
              <Field label="Who can access this event?">
                <select
                  value={input.access}
                  onChange={(ev) => set("access", ev.target.value)}
                >
                  <option value="PUBLIC">Public page</option>
                  <option value="PRIVATE">Invited voters only</option>
                  <option value="ORGANIZATION">
                    Organization members only
                  </option>
                  <option value="PASSWORD">Event password required</option>
                </select>
              </Field>
              {input.access === "PASSWORD" && (
                <Field
                  label="Event password"
                  type="password"
                  value={input.eventPassword}
                  minLength={12}
                  required
                  onChange={(ev) => set("eventPassword", ev.target.value)}
                />
              )}
            </>
          )}
          {step === 3 && (
            <>
              {positions.map((p, i) => (
                <div className="position-editor" key={i}>
                  <div className="row between">
                    <h3>Position {i + 1}</h3>
                    {positions.length > 1 && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={"Remove position " + (i + 1)}
                        onClick={() =>
                          setPositions((old) =>
                            old.filter((_p, index) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                  <Field
                    label="Position or category title"
                    value={p.title}
                    minLength={2}
                    maxLength={100}
                    required
                    onChange={(ev) =>
                      setPositions((old) =>
                        old.map((item, index) =>
                          index === i
                            ? { ...item, title: ev.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <Field label="Voting method">
                    <select
                      value={p.method}
                      onChange={(ev) =>
                        setPositions((old) =>
                          old.map((item, index) =>
                            index === i
                              ? { ...item, method: ev.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      {methods
                        .filter(
                          (m) =>
                            input.mode !== "ELECTION_DEMO" || m !== "WEIGHTED",
                        )
                        .map((m) => (
                          <option key={m} value={m}>
                            {m.toLowerCase()}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <div className="grid two-columns">
                    {["maxChoices", "maxVotes"].map((key) => (
                      <Field
                        key={key}
                        label={
                          key === "maxChoices"
                            ? "Maximum selections"
                            : "Submissions per voter"
                        }
                        type="number"
                        min={1}
                        max={
                          input.mode === "ELECTION_DEMO" && key === "maxVotes"
                            ? 1
                            : 100
                        }
                        required
                        value={p[key]}
                        onChange={(ev) =>
                          setPositions((old) =>
                            old.map((item, index) =>
                              index === i
                                ? { ...item, [key]: Number(ev.target.value) }
                                : item,
                            ),
                          )
                        }
                      />
                    ))}
                  </div>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={p.runoff}
                      onChange={(ev) =>
                        setPositions((old) =>
                          old.map((item, index) =>
                            index === i
                              ? { ...item, runoff: ev.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    <span>Flag outcomes requiring a runoff</span>
                  </label>
                </div>
              ))}
              <button
                type="button"
                className="btn alt"
                onClick={() => setPositions((old) => [...old, blankPosition()])}
              >
                <Plus size={17} /> Add position
              </button>
            </>
          )}
          {step === 4 && (
            <div className="wizard-review">
              <h3>{input.name}</h3>
              <p>
                {organizations.find((o) => o.id === input.organizationId)?.name}
              </p>
              <dl>
                <div>
                  <dt>Voting mode</dt>
                  <dd>
                    {input.mode === "GENERAL"
                      ? "General voting"
                      : "Formal demonstration"}
                  </dd>
                </div>
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
                  <dd>{input.access.toLowerCase()}</dd>
                </div>
                <div>
                  <dt>Results</dt>
                  <dd>{input.resultVisibility.toLowerCase()}</dd>
                </div>
              </dl>
              <h3>Ballot positions</h3>
              {positions.map((p, i) => (
                <p key={i}>
                  {p.title} · {p.method.toLowerCase()} · {p.maxVotes}{" "}
                  submission(s)
                </p>
              ))}
              <p className="notice">
                You can edit the draft before registration opens. Configuration
                locks after the draft stage.
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
            <button className="btn" disabled={!organizations.length}>
              {busy
                ? "Creating election…"
                : step === 4
                  ? "Create draft election"
                  : "Continue"}{" "}
              <ArrowRight size={16} />
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
