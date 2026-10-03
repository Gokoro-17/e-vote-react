export const transitions: Record<string, string[]> = {
  DRAFT: ["REGISTRATION_OPEN", "VOTING_UPCOMING"],
  REGISTRATION_OPEN: ["VOTING_UPCOMING"],
  VOTING_UPCOMING: ["VOTING_OPEN"],
  VOTING_OPEN: ["VOTING_CLOSED"],
  VOTING_CLOSED: ["RESULTS_PENDING"],
  RESULTS_PENDING: ["RESULTS_PUBLISHED"],
  RESULTS_PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};
export function ageOn(dob: Date, now = new Date()) {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  if (
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() &&
      now.getUTCDate() < dob.getUTCDate())
  )
    age--;
  return age;
}
export function eligibilityReason(
  e: any,
  u: any,
  record: any,
  member: any,
  now = new Date(),
) {
  if (!u) return "Account is unavailable.";
  if (!u.emailVerified) return "Verify your email first.";
  if (u.suspended) return "Account access is suspended.";
  if (record?.status !== "VERIFIED")
    return "Election eligibility verification is required.";
  if (e.mode === "ELECTION_DEMO" && !u.identityHash)
    return "Formal demonstrations require an authorized provider-verified unique identity.";
  if (e.customRules && !record.rulesApproved)
    return "Custom eligibility rules require an authorized reviewer’s approval.";
  if (e.membershipRequired && !member?.active)
    return "Active organization membership is required.";
  if (e.groupId && record.groupId !== e.groupId)
    return "Group or constituency eligibility has not been confirmed.";
  if (e.minAge || e.maxAge != null) {
    if (!u.verifiedDob)
      return "Date of birth must be verified by an authorized identity provider.";
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: e.timezone || "UTC",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(now);
    const part = (name: string) =>
      Number(parts.find((p) => p.type === name)!.value);
    const age = ageOn(
      u.verifiedDob,
      new Date(Date.UTC(part("year"), part("month") - 1, part("day"))),
    );
    if (age < e.minAge || (e.maxAge != null && age > e.maxAge))
      return "You do not meet the age requirement.";
  }
  if (e.geography && record.geography !== e.geography)
    return "Geographic eligibility has not been confirmed.";
  return null;
}
export function validateChoices(
  position: any,
  candidates: any[],
  choices: string[],
) {
  const valid = new Set(
    candidates.filter((c) => c.status === "APPROVED").map((c) => c.id),
  );
  if (
    !choices.length ||
    new Set(choices).size !== choices.length ||
    choices.some((c) => !valid.has(c))
  )
    throw new Error("Select valid, distinct approved candidates.");
  if (["SINGLE", "WEIGHTED"].includes(position.method) && choices.length !== 1)
    throw new Error("Select exactly one candidate.");
  if (
    ["MULTIPLE", "APPROVAL"].includes(position.method) &&
    choices.length > position.maxChoices
  )
    throw new Error("Too many selections.");
  if (position.method === "RANKED" && choices.length > valid.size)
    throw new Error("Invalid ranking.");
}
export function tally(
  position: any,
  ballots: { choices: string[]; weight: number }[],
) {
  const approved = position.candidates.filter(
    (c: any) => c.status === "APPROVED",
  );
  const counts: Record<string, number> = Object.fromEntries(
    approved.map((c: any) => [c.id, 0]),
  );
  const rounds: any[] = [];
  let winners: string[] = [];
  if (position.method === "RANKED") {
    let remaining = new Set<string>(approved.map((c: any) => c.id));
    while (remaining.size) {
      const round: Record<string, number> = Object.fromEntries(
        [...remaining].map((id) => [id, 0]),
      );
      for (const ballot of ballots) {
        const pick = ballot.choices.find((id) => remaining.has(id));
        if (pick) round[pick]++;
      }
      const total = Object.values(round).reduce((a, b) => a + b, 0);
      rounds.push({ counts: round, total });
      if (!total) break;
      const high = Math.max(...Object.values(round)),
        low = Math.min(...Object.values(round));
      const leaders = Object.keys(round).filter((id) => round[id] === high);
      if (high > total / 2 || remaining.size === 1 || high === low) {
        winners = leaders;
        Object.assign(counts, round);
        break;
      }
      // A tied elimination is reported for review rather than decided arbitrarily.
      const losers = Object.keys(round).filter((id) => round[id] === low);
      if (losers.length > 1) {
        Object.assign(counts, round);
        rounds.at(-1).unresolvedTie = losers;
        break;
      }
      remaining.delete(losers[0]);
    }
  } else {
    for (const ballot of ballots)
      for (const choice of ballot.choices)
        if (choice in counts)
          counts[choice] += position.method === "WEIGHTED" ? ballot.weight : 1;
    const high = Math.max(0, ...Object.values(counts));
    if (high) winners = Object.keys(counts).filter((id) => counts[id] === high);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    id: position.id,
    title: position.title,
    method: position.method,
    ballots: ballots.length,
    rounds,
    winners,
    tie: winners.length > 1,
    runoffRequired:
      position.runoff &&
      (winners.length !== 1 ||
        (total > 0 && Math.max(...Object.values(counts)) <= total / 2)),
    candidates: approved.map((c: any) => ({
      id: c.id,
      name: c.name,
      votes: counts[c.id],
      percentage: total ? (counts[c.id] / total) * 100 : 0,
    })),
  };
}
