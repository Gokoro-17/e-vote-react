-- Database-level domain constraints back up server validation.
ALTER TABLE "User" ADD CONSTRAINT "user_role_check" CHECK ("role" IN ('VOTER','CANDIDATE','SUPER_ADMIN'));
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "member_role_check" CHECK ("role" IN ('ADMIN','MODERATOR','VOTER','CANDIDATE'));
ALTER TABLE "Election" ADD CONSTRAINT "election_status_check" CHECK ("status" IN ('DRAFT','REGISTRATION_OPEN','VOTING_UPCOMING','VOTING_OPEN','VOTING_CLOSED','RESULTS_PENDING','RESULTS_PUBLISHED','ARCHIVED'));
ALTER TABLE "Election" ADD CONSTRAINT "election_dates_check" CHECK ("votingEnd">"votingStart");
ALTER TABLE "Election" ADD CONSTRAINT "election_age_check" CHECK ("minAge">=0 AND ("maxAge" IS NULL OR "maxAge">="minAge"));
ALTER TABLE "ElectionPosition" ADD CONSTRAINT "position_method_check" CHECK ("method" IN ('SINGLE','MULTIPLE','APPROVAL','RANKED','WEIGHTED'));
ALTER TABLE "ElectionPosition" ADD CONSTRAINT "position_limits_check" CHECK ("maxChoices">0 AND "maxVotes">0);
ALTER TABLE "VoterEligibility" ADD CONSTRAINT "eligibility_status_check" CHECK ("status" IN ('PENDING','VERIFIED','REJECTED'));
ALTER TABLE "VoterEligibility" ADD CONSTRAINT "eligibility_weight_check" CHECK ("weight">0);
ALTER TABLE "Candidate" ADD CONSTRAINT "candidate_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED','WITHDRAWN'));
ALTER TABLE "VoteStatus" ADD CONSTRAINT "participation_count_check" CHECK ("count">0);
-- Prevent ordinary update/delete/truncate of audit and ballot history. A database owner
-- can disable triggers; independent external anchoring is still required for stronger guarantees.
CREATE FUNCTION evote_immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Append-only voting/audit record'; END;
$$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION evote_immutable_record();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON "AuditLog" FOR EACH STATEMENT EXECUTE FUNCTION evote_immutable_record();
CREATE TRIGGER ballot_immutable BEFORE UPDATE OR DELETE ON "Ballot" FOR EACH ROW EXECUTE FUNCTION evote_immutable_record();
CREATE TRIGGER ballot_no_truncate BEFORE TRUNCATE ON "Ballot" FOR EACH STATEMENT EXECUTE FUNCTION evote_immutable_record();
CREATE TRIGGER result_immutable BEFORE UPDATE OR DELETE ON "ElectionResult" FOR EACH ROW EXECUTE FUNCTION evote_immutable_record();
