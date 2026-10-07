import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageOn,
  eligibilityReason,
  validateChoices,
  tally,
  transitions,
  launchTarget,
  scheduledStatus,
} from "./engine.js";
test("age uses exact birthday including leap-day edge", () => {
  assert.equal(ageOn(new Date("2008-10-03"), new Date("2026-10-02")), 17);
  assert.equal(ageOn(new Date("2008-10-02"), new Date("2026-10-02")), 18);
  assert.equal(ageOn(new Date("2008-02-29"), new Date("2026-02-28")), 17);
});
test("self-entered DOB cannot establish age eligibility", () => {
  assert.match(
    eligibilityReason(
      { minAge: 18 },
      { emailVerified: true, dob: new Date("2000-01-01") },
      { status: "VERIFIED" },
      null,
    )!,
    /authorized/,
  );
});
test("membership and geography are independent checks", () => {
  const e = { membershipRequired: true, geography: "Lagos" },
    u = { emailVerified: true },
    r = { status: "VERIFIED", geography: "Abuja" };
  assert.match(eligibilityReason(e, u, r, null)!, /membership/);
  assert.match(eligibilityReason(e, u, r, { active: true })!, /Geographic/);
});
test("suspended and unverified voters fail eligibility", () => {
  assert.match(
    eligibilityReason(
      {},
      { emailVerified: false },
      { status: "VERIFIED" },
      null,
    )!,
    /email/,
  );
  assert.match(
    eligibilityReason(
      {},
      { emailVerified: true, suspended: true },
      { status: "VERIFIED" },
      null,
    )!,
    /suspended/,
  );
});
const candidates = [
  { id: "a", name: "A", status: "APPROVED" },
  { id: "b", name: "B", status: "APPROVED" },
  { id: "c", name: "C", status: "PENDING" },
];
test("ballots reject foreign, pending, duplicate, and excess choices", () => {
  for (const choices of [["x"], ["c"], ["a", "a"], ["a", "b"], []])
    assert.throws(() =>
      validateChoices({ method: "SINGLE" }, candidates, choices),
    );
  validateChoices({ method: "SINGLE" }, candidates, ["a"]);
});
test("multiple and approval enforce limits", () => {
  validateChoices({ method: "APPROVAL", maxChoices: 2 }, candidates, [
    "a",
    "b",
  ]);
  assert.throws(() =>
    validateChoices({ method: "MULTIPLE", maxChoices: 1 }, candidates, [
      "a",
      "b",
    ]),
  );
});
test("weighted tally uses server-approved weight only", () => {
  const result = tally({ candidates, method: "WEIGHTED" }, [
    { choices: ["a"], weight: 3 },
    { choices: ["b"], weight: 1 },
  ]);
  assert.equal(result.candidates[0].votes, 3);
  assert.deepEqual(result.winners, ["a"]);
});
test("empty results have no manufactured winner", () =>
  assert.deepEqual(tally({ candidates, method: "SINGLE" }, []).winners, []));
test("ties remain explicit and runoff is reported", () => {
  const r = tally({ candidates, method: "SINGLE", runoff: true }, [
    { choices: ["a"], weight: 1 },
    { choices: ["b"], weight: 1 },
  ]);
  assert.equal(r.tie, true);
  assert.equal(r.runoffRequired, true);
});
test("ranked tally transfers eliminated choices", () => {
  const cs = [
    ...candidates.slice(0, 2),
    { id: "d", name: "D", status: "APPROVED" },
  ];
  const r = tally({ candidates: cs, method: "RANKED" }, [
    { choices: ["a"], weight: 1 },
    { choices: ["a"], weight: 1 },
    { choices: ["b"], weight: 1 },
    { choices: ["b"], weight: 1 },
    { choices: ["d", "b"], weight: 1 },
  ]);
  assert.deepEqual(r.winners, ["b"]);
  assert.equal(r.rounds.length, 2);
});
test("archived and completed elections cannot reopen", () => {
  assert.deepEqual(transitions.ARCHIVED, []);
  assert.equal(transitions.VOTING_CLOSED.includes("DRAFT"), false);
  assert.equal(transitions.RESULTS_PUBLISHED.includes("VOTING_OPEN"), false);
});
test("launch selects the simple next phase from the configured schedule", () => {
  const base = {
    status: "DRAFT",
    votingStart: new Date("2026-10-07T12:00:00Z"),
    votingEnd: new Date("2026-10-07T18:00:00Z"),
  };
  assert.equal(
    launchTarget(base, new Date("2026-10-07T10:00:00Z")),
    "VOTING_UPCOMING",
  );
  assert.equal(
    launchTarget(base, new Date("2026-10-07T13:00:00Z")),
    "VOTING_OPEN",
  );
  assert.equal(
    launchTarget(
      {
        ...base,
        registrationStart: new Date("2026-10-07T08:00:00Z"),
        registrationEnd: new Date("2026-10-07T11:00:00Z"),
      },
      new Date("2026-10-07T10:00:00Z"),
    ),
    "REGISTRATION_OPEN",
  );
  assert.equal(
    launchTarget(
      {
        ...base,
        registrationStart: new Date("2026-10-07T11:00:00Z"),
        registrationEnd: new Date("2026-10-07T11:45:00Z"),
      },
      new Date("2026-10-07T10:00:00Z"),
    ),
    "VOTING_UPCOMING",
  );
  assert.throws(
    () => launchTarget(base, new Date("2026-10-07T19:00:00Z")),
    /dates have passed/,
  );
});
test("published elections follow registration and voting dates automatically", () => {
  const election = {
    status: "VOTING_UPCOMING",
    registrationStart: new Date("2026-10-07T09:00:00Z"),
    registrationEnd: new Date("2026-10-07T11:00:00Z"),
    votingStart: new Date("2026-10-07T12:00:00Z"),
    votingEnd: new Date("2026-10-07T18:00:00Z"),
  };
  assert.equal(
    scheduledStatus(election, new Date("2026-10-07T08:00:00Z")),
    "VOTING_UPCOMING",
  );
  assert.equal(
    scheduledStatus(election, new Date("2026-10-07T10:00:00Z")),
    "REGISTRATION_OPEN",
  );
  assert.equal(
    scheduledStatus(
      { ...election, status: "REGISTRATION_OPEN" },
      new Date("2026-10-07T11:30:00Z"),
    ),
    "VOTING_UPCOMING",
  );
  assert.equal(
    scheduledStatus(election, new Date("2026-10-07T13:00:00Z")),
    "VOTING_OPEN",
  );
  assert.equal(
    scheduledStatus(
      { ...election, status: "VOTING_OPEN" },
      new Date("2026-10-07T19:00:00Z"),
    ),
    "VOTING_CLOSED",
  );
});
test("formal demonstrations require verified unique identity", () => {
  assert.match(
    eligibilityReason(
      { mode: "ELECTION_DEMO" },
      { emailVerified: true },
      { status: "VERIFIED" },
      null,
    )!,
    /unique identity/,
  );
  assert.equal(
    eligibilityReason(
      { mode: "ELECTION_DEMO" },
      { emailVerified: true, identityHash: "trusted-fingerprint" },
      { status: "VERIFIED" },
      null,
    ),
    null,
  );
});
test("custom rules need independent review", () => {
  assert.match(
    eligibilityReason(
      { customRules: "Active student" },
      { emailVerified: true },
      { status: "VERIFIED" },
      null,
    )!,
    /Custom/,
  );
});
test("age boundary follows election timezone", () => {
  assert.equal(
    eligibilityReason(
      { minAge: 18, timezone: "Africa/Lagos" },
      { emailVerified: true, verifiedDob: new Date("2008-10-03") },
      { status: "VERIFIED" },
      null,
      new Date("2026-10-02T23:30:00Z"),
    ),
    null,
  );
});
