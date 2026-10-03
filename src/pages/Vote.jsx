import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  LockKeyhole,
  ChevronUp,
  ChevronDown,
  Download,
  ShieldCheck,
} from "lucide-react";
import { api } from "../store.jsx";
import {
  useLoad,
  Feedback,
  Field,
  ActionForm,
  date,
  status,
  PageHeading,
  Loading,
  LoadError,
  Badge,
  Captcha,
} from "../components.jsx";
export default function Vote() {
  const { id } = useParams(),
    election = useLoad("/elections/" + id),
    eligibility = useLoad("/elections/" + id + "/eligibility"),
    [position, setPosition] = useState(null),
    [choices, setChoices] = useState([]),
    [stage, setStage] = useState("positions"),
    [receipt, setReceipt] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    pending = useRef(false),
    focus = useRef(null),
    e = election.data;
  useEffect(() => {
    focus.current?.focus();
  }, [stage]);
  if (election.loading)
    return (
      <div className="pg">
        <Loading>Preparing your voting page…</Loading>
      </div>
    );
  if (!e)
    return (
      <div className="pg">
        <LoadError error={election.error} retry={election.load} />
      </div>
    );
  const pick = (cid) =>
    setChoices((old) =>
      ["SINGLE", "WEIGHTED"].includes(position.method)
        ? [cid]
        : old.includes(cid)
          ? old.filter((x) => x !== cid)
          : [...old, cid],
    );
  const move = (index, shift) =>
    setChoices((old) => {
      const next = [...old];
      [next[index], next[index + shift]] = [next[index + shift], next[index]];
      return next;
    });
  const submit = async (form) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api("/elections/" + e.id + "/vote", {
        positionId: position.id,
        choices,
        captcha: form ? new FormData(form).get("captcha") : undefined,
      });
      setReceipt(result);
      setChoices([]);
      setStage("receipt");
      eligibility.load();
    } catch (err) {
      setError(err.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const download = () => {
    const text = [
      receipt.election,
      "Vote successfully recorded",
      "Confirmation: " + receipt.code,
      date(receipt.at, e.timezone),
      "This receipt contains no candidate selection.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = receipt.code + ".txt";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="pg ballot-layout">
      <Link className="back-link" to={"/elections/" + e.slug}>
        <ArrowLeft size={16} /> Election details
      </Link>
      <PageHeading eyebrow="YOUR BALLOT" title={e.name}>
        A private choice. A clear confirmation.
      </PageHeading>
      <div className="ballot-progress" aria-label="Voting progress">
        {[
          ["positions", "Position"],
          ["ballot", "Select"],
          ["review", "Review"],
          ["receipt", "Confirmation"],
        ].map(([step, label], i) => (
          <div
            key={step}
            className={stage === step ? "current" : ""}
            aria-current={stage === step ? "step" : undefined}
          >
            <span>{i + 1}</span>
            {label}
          </div>
        ))}
      </div>
      <Feedback error={error} />
      {stage === "receipt" ? (
        <div className="stub">
          <div className="receipt-seal">
            <CheckCircle2 size={38} />
          </div>
          <span className="eyebrow">SUBMISSION CONFIRMED</span>
          <h2 ref={focus} tabIndex={-1}>
            Vote successfully recorded
          </h2>
          <p>{receipt.election}</p>
          <div className="receipt-details">
            <span>Confirmation ID</span>
            <code>{receipt.code}</code>
            <span>Recorded at</span>
            <b>{date(receipt.at, e.timezone)}</b>
          </div>
          <p className="muted">
            Your receipt confirms submission and contains no candidate
            selection.
          </p>
          <div className="row">
            <button className="btn" onClick={() => setStage("positions")}>
              Continue <ArrowRight size={17} />
            </button>
            <button className="btn alt" onClick={download}>
              <Download size={16} /> Download receipt
            </button>
          </div>
        </div>
      ) : stage === "review" ? (
        <form
          className="panel review-panel"
          onSubmit={(ev) => {
            ev.preventDefault();
            submit(ev.currentTarget);
          }}
        >
          <LockKeyhole size={27} />
          <h2 ref={focus} tabIndex={-1}>
            Confirm your vote for {position.title}
          </h2>
          <p className="muted">
            You are about to submit the following{" "}
            {choices.length === 1 ? "selection" : "selections"}.
          </p>
          <ol className="review-choices">
            {choices.map((cid) => (
              <li key={cid}>
                {position.candidates.find((c) => c.id === cid)?.name}
              </li>
            ))}
          </ol>
          <div className="notice">
            Once submitted, your vote cannot be changed.
          </div>
          {eligibility.data?.requireCaptcha && <Captcha />}
          <div className="ballot-actions">
            <button className="btn" disabled={busy}>
              {busy ? "Recording your ballot…" : "Confirm vote"}{" "}
              <CheckCircle2 size={17} />
            </button>
            <button
              type="button"
              className="btn alt"
              disabled={busy}
              onClick={() => setStage("ballot")}
            >
              Edit selection
            </button>
          </div>
        </form>
      ) : stage === "ballot" ? (
        <div className="panel">
          <button className="back-link" onClick={() => setStage("positions")}>
            <ArrowLeft size={16} /> All positions
          </button>
          <h2 ref={focus} tabIndex={-1}>
            {position.title}
          </h2>
          <p className="muted">
            {position.method === "RANKED"
              ? "Choose candidates, then arrange them in order of preference."
              : ["SINGLE", "WEIGHTED"].includes(position.method)
                ? "Choose one candidate."
                : "Choose up to " + position.maxChoices + " candidates."}
          </p>
          <fieldset className="ballot-fieldset">
            <legend>Your candidates</legend>
            {position.candidates.map((c) => (
              <label
                className={"opt " + (choices.includes(c.id) ? "chosen" : "")}
                key={c.id}
              >
                <input
                  type={
                    ["SINGLE", "WEIGHTED"].includes(position.method)
                      ? "radio"
                      : "checkbox"
                  }
                  name="candidate"
                  checked={choices.includes(c.id)}
                  onChange={() => pick(c.id)}
                />
                {c.photo && <img src={c.photo} alt="" />}
                <span>
                  <b>{c.name}</b>
                  <small>{c.bio}</small>
                </span>
                {choices.includes(c.id) && (
                  <CheckCircle2 className="choice-check" size={19} />
                )}
              </label>
            ))}
          </fieldset>
          {position.method === "RANKED" && choices.length > 0 && (
            <div className="ranking">
              <h3>Your preference order</h3>
              <ol>
                {choices.map((cid, i) => (
                  <li key={cid}>
                    <span>
                      {position.candidates.find((c) => c.id === cid)?.name}
                    </span>
                    <div>
                      <button
                        className="icon-btn"
                        disabled={i === 0}
                        aria-label={
                          "Move " +
                          position.candidates.find((c) => c.id === cid)?.name +
                          " up"
                        }
                        onClick={() => move(i, -1)}
                      >
                        <ChevronUp size={19} />
                      </button>
                      <button
                        className="icon-btn"
                        disabled={i === choices.length - 1}
                        aria-label={
                          "Move " +
                          position.candidates.find((c) => c.id === cid)?.name +
                          " down"
                        }
                        onClick={() => move(i, 1)}
                      >
                        <ChevronDown size={19} />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="ballot-actions">
            <span className="muted">{choices.length} selected</span>
            <button
              className="btn"
              disabled={
                !choices.length ||
                (["MULTIPLE", "APPROVAL"].includes(position.method) &&
                  choices.length > position.maxChoices)
              }
              onClick={() => setStage("review")}
            >
              Review ballot <ArrowRight size={17} />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="panel">
            <div className="row between">
              <Badge value={e.status} />
              <span className="muted">
                Closes {date(e.votingEnd, e.timezone)}
              </span>
            </div>
            <h2 ref={focus} tabIndex={-1}>
              Choose a position
            </h2>
            {eligibility.loading ? (
              <Loading>Checking eligibility…</Loading>
            ) : eligibility.error ? (
              <LoadError error={eligibility.error} retry={eligibility.load} />
            ) : (
              <div
                className={
                  "eligibility-notice " +
                  (!eligibility.data?.reason ? "verified" : "")
                }
              >
                <ShieldCheck size={20} />
                <p>
                  {eligibility.data?.reason || "Your eligibility is confirmed."}
                </p>
              </div>
            )}
            <div className="position-list">
              {e.positions.map((p) => {
                const r = eligibility.data?.receipts.find(
                    (r) => r.positionId === p.id,
                  ),
                  done = r?.count >= p.maxVotes;
                return (
                  <div className="notification" key={p.id}>
                    <div>
                      <h3>{p.title}</h3>
                      <p className="muted">
                        {status(p.method)} · {r?.count || 0} / {p.maxVotes}{" "}
                        submissions
                      </p>
                      {r && <code className="receipt-code">{r.receipt}</code>}
                    </div>
                    <button
                      className={"btn " + (done ? "alt" : "")}
                      disabled={
                        done ||
                        eligibility.loading ||
                        Boolean(eligibility.data?.reason) ||
                        !eligibility.data ||
                        e.status !== "VOTING_OPEN"
                      }
                      onClick={() => {
                        setPosition(p);
                        setChoices([]);
                        setError("");
                        setStage("ballot");
                      }}
                    >
                      {done ? (
                        <>
                          <CheckCircle2 size={17} /> Completed
                        </>
                      ) : (
                        <>
                          Vote <ArrowRight size={17} />
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          {eligibility.data?.reason &&
            ["REGISTRATION_OPEN", "VOTING_UPCOMING"].includes(e.status) && (
              <section className="s">
                <ActionForm
                  onSubmit={async (_f, form) => {
                    const data = new FormData(form);
                    const file = data.get("document");
                    if (file?.size > 5 * 1024 * 1024)
                      throw new Error(
                        "Please select a file smaller than 5 MB.",
                      );
                    data.set("electionId", e.id);
                    await api("/verification/request", data);
                    eligibility.load();
                  }}
                  success="Verification submitted. Your organization will review your eligibility."
                >
                  <FileCheck2 size={25} />
                  <h3>Verify your election eligibility</h3>
                  <p className="muted">
                    Provide only the evidence your organization needs. Documents
                    are encrypted and expire automatically. Identity documents
                    alone cannot verify authoritative identity.
                  </p>
                  <Field label="Verification type">
                    <select name="type">
                      <option value="MEMBERSHIP">Membership</option>
                      <option value="STUDENT">Student status</option>
                      <option value="GEOGRAPHY">Geographic eligibility</option>
                      <option value="IDENTITY">
                        Identity through an authorized provider
                      </option>
                    </select>
                  </Field>
                  <Field label="Context for your reviewer">
                    <textarea name="note" maxLength={1000} />
                  </Field>
                  <Field
                    label="Optional supporting document"
                    hint="PDF, PNG, or JPEG, up to 5 MB."
                  >
                    <input
                      type="file"
                      name="document"
                      accept="application/pdf,image/png,image/jpeg"
                    />
                  </Field>
                  <Captcha />
                  <button className="btn">
                    Submit for review <ArrowRight size={17} />
                  </button>
                </ActionForm>
              </section>
            )}
        </>
      )}
    </div>
  );
}
