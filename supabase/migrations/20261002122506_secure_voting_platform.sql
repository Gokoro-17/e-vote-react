-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "evote";

-- CreateTable
CREATE TABLE "evote"."User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "dob" DATE,
    "verifiedDob" DATE,
    "identityHash" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL DEFAULT 'VOTER',
    "consentAt" TIMESTAMP(3),
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "csrf" TEXT NOT NULL,
    "reauthenticatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."AuthRegistration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dob" DATE,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "logo" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '#174b40',
    "contact" TEXT NOT NULL DEFAULT '',
    "welcome" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "plan" TEXT NOT NULL DEFAULT 'FREE',

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."OrganizationMember" (
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VOTER',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("organizationId","userId")
);

-- CreateTable
CREATE TABLE "evote"."Election" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "location" TEXT NOT NULL DEFAULT '',
    "banner" TEXT NOT NULL DEFAULT '',
    "registrationStart" TIMESTAMP(3),
    "registrationEnd" TIMESTAMP(3),
    "votingStart" TIMESTAMP(3) NOT NULL,
    "votingEnd" TIMESTAMP(3) NOT NULL,
    "publishAt" TIMESTAMP(3),
    "resultVisibility" TEXT NOT NULL DEFAULT 'HIDDEN',
    "minAge" INTEGER NOT NULL DEFAULT 0,
    "maxAge" INTEGER,
    "membershipRequired" BOOLEAN NOT NULL DEFAULT false,
    "geography" TEXT NOT NULL DEFAULT '',
    "customRules" TEXT NOT NULL DEFAULT '',
    "groupId" TEXT,
    "faq" JSONB NOT NULL DEFAULT '[]',
    "access" TEXT NOT NULL DEFAULT 'PUBLIC',
    "eventPasswordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredAtOpen" INTEGER,
    "eligibleAtOpen" INTEGER,

    CONSTRAINT "Election_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."ElectionPosition" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'SINGLE',
    "maxChoices" INTEGER NOT NULL DEFAULT 1,
    "maxVotes" INTEGER NOT NULL DEFAULT 1,
    "runoff" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ElectionPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."Candidate" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "manifesto" TEXT NOT NULL DEFAULT '',
    "photo" TEXT NOT NULL DEFAULT '',
    "campaign" TEXT NOT NULL DEFAULT '',
    "socialLinks" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."VoterEligibility" (
    "electionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "geography" TEXT NOT NULL DEFAULT '',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL DEFAULT '',
    "rulesApproved" BOOLEAN NOT NULL DEFAULT false,
    "groupId" TEXT,

    CONSTRAINT "VoterEligibility_pkey" PRIMARY KEY ("electionId","userId")
);

-- CreateTable
CREATE TABLE "evote"."VerificationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'MANUAL_ELIGIBILITY',
    "type" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."Document" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."Ballot" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "encryptedChoice" TEXT NOT NULL,
    "commitment" TEXT NOT NULL,

    CONSTRAINT "Ballot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."VoteStatus" (
    "userId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "receipt" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteStatus_pkey" PRIMARY KEY ("userId","positionId")
);

-- CreateTable
CREATE TABLE "evote"."ElectionResult" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "organizationId" TEXT,
    "electionId" TEXT,
    "actor" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'SUCCESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."SecurityEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actor" TEXT,
    "type" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."MailOutbox" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "encryptedBody" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."Invitation" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."RateBucket" (
    "id" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."ElectionActivity" (
    "electionId" TEXT NOT NULL,
    "hour" TIMESTAMP(3) NOT NULL,
    "submissions" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ElectionActivity_pkey" PRIMARY KEY ("electionId","hour")
);

-- CreateTable
CREATE TABLE "evote"."OrganizationJoinRequest" (
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationJoinRequest_pkey" PRIMARY KEY ("organizationId","userId")
);

-- CreateTable
CREATE TABLE "evote"."OrganizationGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "OrganizationGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."VoteReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "documentRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "welcomeMessage" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."DeletionJob" (
    "id" TEXT NOT NULL,
    "encryptedObjectKeys" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evote"."NotificationCampaign" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "cursor" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "evote"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_identityHash_key" ON "evote"."User"("identityHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "evote"."Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "evote"."Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "evote"."Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_name_idx" ON "evote"."Organization"("name");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_active_idx" ON "evote"."OrganizationMember"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Election_slug_key" ON "evote"."Election"("slug");

-- CreateIndex
CREATE INDEX "Election_organizationId_status_idx" ON "evote"."Election"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Election_votingStart_votingEnd_idx" ON "evote"."Election"("votingStart", "votingEnd");

-- CreateIndex
CREATE UNIQUE INDEX "ElectionPosition_electionId_title_key" ON "evote"."ElectionPosition"("electionId", "title");

-- CreateIndex
CREATE INDEX "Candidate_positionId_status_idx" ON "evote"."Candidate"("positionId", "status");

-- CreateIndex
CREATE INDEX "Candidate_userId_idx" ON "evote"."Candidate"("userId");

-- CreateIndex
CREATE INDEX "VoterEligibility_userId_idx" ON "evote"."VoterEligibility"("userId");

-- CreateIndex
CREATE INDEX "VerificationRequest_electionId_status_idx" ON "evote"."VerificationRequest"("electionId", "status");

-- CreateIndex
CREATE INDEX "VerificationRequest_userId_createdAt_idx" ON "evote"."VerificationRequest"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_requestId_key" ON "evote"."Document"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_objectKey_key" ON "evote"."Document"("objectKey");

-- CreateIndex
CREATE INDEX "Document_expiresAt_idx" ON "evote"."Document"("expiresAt");

-- CreateIndex
CREATE INDEX "Ballot_positionId_idx" ON "evote"."Ballot"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "VoteStatus_receipt_key" ON "evote"."VoteStatus"("receipt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "evote"."AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_organizationId_createdAt_idx" ON "evote"."SecurityEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "evote"."Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MailOutbox_sentAt_createdAt_idx" ON "evote"."MailOutbox"("sentAt", "createdAt");

-- CreateIndex
CREATE INDEX "RateBucket_resetAt_idx" ON "evote"."RateBucket"("resetAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationGroup_organizationId_name_key" ON "evote"."OrganizationGroup"("organizationId", "name");

-- CreateIndex
CREATE INDEX "VoteReceipt_userId_positionId_idx" ON "evote"."VoteReceipt"("userId", "positionId");

-- CreateIndex
CREATE INDEX "NotificationCampaign_completedAt_createdAt_idx" ON "evote"."NotificationCampaign"("completedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "evote"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "evote"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "evote"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "evote"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."Election" ADD CONSTRAINT "Election_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "evote"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."Election" ADD CONSTRAINT "Election_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "evote"."OrganizationGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."ElectionPosition" ADD CONSTRAINT "ElectionPosition_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "evote"."Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."Candidate" ADD CONSTRAINT "Candidate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "evote"."ElectionPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."VoterEligibility" ADD CONSTRAINT "VoterEligibility_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "evote"."Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."VoterEligibility" ADD CONSTRAINT "VoterEligibility_userId_fkey" FOREIGN KEY ("userId") REFERENCES "evote"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."VoterEligibility" ADD CONSTRAINT "VoterEligibility_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "evote"."OrganizationGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."VerificationRequest" ADD CONSTRAINT "VerificationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "evote"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."VerificationRequest" ADD CONSTRAINT "VerificationRequest_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "evote"."Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."Document" ADD CONSTRAINT "Document_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "evote"."VerificationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."Ballot" ADD CONSTRAINT "Ballot_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "evote"."ElectionPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."VoteStatus" ADD CONSTRAINT "VoteStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "evote"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."VoteStatus" ADD CONSTRAINT "VoteStatus_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "evote"."ElectionPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."ElectionResult" ADD CONSTRAINT "ElectionResult_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "evote"."Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "evote"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."SecurityEvent" ADD CONSTRAINT "SecurityEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "evote"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "evote"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."Invitation" ADD CONSTRAINT "Invitation_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "evote"."Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."ElectionActivity" ADD CONSTRAINT "ElectionActivity_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "evote"."Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."OrganizationJoinRequest" ADD CONSTRAINT "OrganizationJoinRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "evote"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."OrganizationJoinRequest" ADD CONSTRAINT "OrganizationJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "evote"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."OrganizationGroup" ADD CONSTRAINT "OrganizationGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "evote"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."VoteReceipt" ADD CONSTRAINT "VoteReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "evote"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evote"."VoteReceipt" ADD CONSTRAINT "VoteReceipt_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "evote"."ElectionPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level domain constraints back up server validation.
ALTER TABLE evote."Election" ADD COLUMN "runoffOfId" text;
CREATE UNIQUE INDEX "Election_runoffOfId_key" ON evote."Election" ("runoffOfId");
ALTER TABLE evote."Election" ADD CONSTRAINT "Election_runoffOfId_fkey" FOREIGN KEY ("runoffOfId") REFERENCES evote."Election"(id) ON DELETE RESTRICT;
ALTER TABLE evote."Election" ADD CONSTRAINT runoff_parent_check CHECK ("runoffOfId" IS NULL OR "runoffOfId"<>id);
ALTER TABLE "evote"."User" ADD CONSTRAINT "user_role_check" CHECK ("role" IN ('VOTER','CANDIDATE','SUPER_ADMIN'));
ALTER TABLE "evote"."OrganizationMember" ADD CONSTRAINT "member_role_check" CHECK ("role" IN ('ADMIN','MODERATOR','VOTER','CANDIDATE'));
ALTER TABLE "evote"."Election" ADD CONSTRAINT "election_status_check" CHECK ("status" IN ('DRAFT','REGISTRATION_OPEN','VOTING_UPCOMING','VOTING_OPEN','VOTING_CLOSED','RESULTS_PENDING','RESULTS_PUBLISHED','ARCHIVED'));
ALTER TABLE "evote"."Election" ADD CONSTRAINT "election_dates_check" CHECK ("votingEnd">"votingStart");
ALTER TABLE "evote"."Election" ADD CONSTRAINT "election_age_check" CHECK ("minAge">=0 AND ("maxAge" IS NULL OR "maxAge">="minAge"));
ALTER TABLE "evote"."ElectionPosition" ADD CONSTRAINT "position_method_check" CHECK ("method" IN ('SINGLE','MULTIPLE','APPROVAL','RANKED','WEIGHTED'));
ALTER TABLE "evote"."ElectionPosition" ADD CONSTRAINT "position_limits_check" CHECK ("maxChoices">0 AND "maxVotes">0);
ALTER TABLE "evote"."VoterEligibility" ADD CONSTRAINT "eligibility_status_check" CHECK ("status" IN ('PENDING','VERIFIED','REJECTED'));
ALTER TABLE "evote"."VoterEligibility" ADD CONSTRAINT "eligibility_weight_check" CHECK ("weight">0);
ALTER TABLE "evote"."Candidate" ADD CONSTRAINT "candidate_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED','WITHDRAWN'));
ALTER TABLE "evote"."VoteStatus" ADD CONSTRAINT "participation_count_check" CHECK ("count">0);
-- Prevent ordinary update/delete/truncate of audit and ballot history. A database owner
-- can disable triggers; independent external anchoring is still required for stronger guarantees.
CREATE FUNCTION evote.immutable_record() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Append-only voting/audit record'; END;
$$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "evote"."AuditLog" FOR EACH ROW EXECUTE FUNCTION evote.immutable_record();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON "evote"."AuditLog" FOR EACH STATEMENT EXECUTE FUNCTION evote.immutable_record();
CREATE TRIGGER ballot_immutable BEFORE UPDATE OR DELETE ON "evote"."Ballot" FOR EACH ROW EXECUTE FUNCTION evote.immutable_record();
CREATE TRIGGER ballot_no_truncate BEFORE TRUNCATE ON "evote"."Ballot" FOR EACH STATEMENT EXECUTE FUNCTION evote.immutable_record();
CREATE TRIGGER result_immutable BEFORE UPDATE OR DELETE ON "evote"."ElectionResult" FOR EACH ROW EXECUTE FUNCTION evote.immutable_record();


-- Private application schema. Browser clients cannot query identity or ballot tables.
REVOKE ALL ON SCHEMA evote FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA evote FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA evote FROM PUBLIC, anon, authenticated;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evote_server') THEN CREATE ROLE evote_server NOLOGIN NOBYPASSRLS; END IF; END $$;
GRANT USAGE ON SCHEMA evote TO evote_server;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA evote TO evote_server;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA evote TO evote_server;
REVOKE UPDATE, DELETE ON evote."AuditLog", evote."Ballot", evote."ElectionResult", evote."VoteReceipt" FROM evote_server;
REVOKE DELETE ON evote."VoteStatus" FROM evote_server;
GRANT USAGE ON SCHEMA auth TO evote_server;
GRANT SELECT (id,user_id) ON auth.sessions TO evote_server;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='evote' LOOP
  EXECUTE format('ALTER TABLE evote.%I ENABLE ROW LEVEL SECURITY',t.tablename);
  EXECUTE format('CREATE POLICY backend_only ON evote.%I TO evote_server USING (true) WITH CHECK (true)',t.tablename);
 END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA evote REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA evote REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
CREATE TRIGGER receipt_immutable BEFORE UPDATE OR DELETE ON evote."VoteReceipt" FOR EACH ROW EXECUTE FUNCTION evote.immutable_record();
CREATE TRIGGER result_no_truncate BEFORE TRUNCATE ON evote."ElectionResult" FOR EACH STATEMENT EXECUTE FUNCTION evote.immutable_record();
CREATE TRIGGER receipt_no_truncate BEFORE TRUNCATE ON evote."VoteReceipt" FOR EACH STATEMENT EXECUTE FUNCTION evote.immutable_record();
ALTER TABLE evote."Election" ADD CONSTRAINT mode_check CHECK (mode IN ('GENERAL','ELECTION_DEMO'));
ALTER TABLE evote."Election" ADD CONSTRAINT visibility_check CHECK ("resultVisibility" IN ('HIDDEN','LIVE','DELAYED'));
ALTER TABLE evote."Election" ADD CONSTRAINT access_check CHECK (access IN ('PUBLIC','PRIVATE','ORGANIZATION','PASSWORD'));
ALTER TABLE evote."Election" ADD CONSTRAINT formal_results_check CHECK (mode <> 'ELECTION_DEMO' OR "resultVisibility" <> 'LIVE');
ALTER TABLE evote."Organization" ADD CONSTRAINT plan_check CHECK (plan IN ('FREE','PRO','BUSINESS','ENTERPRISE'));
ALTER TABLE evote."PlatformSettings" ADD CONSTRAINT retention_check CHECK ("documentRetentionDays" BETWEEN 1 AND 90);
CREATE FUNCTION evote.validate_election_update() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.status <> NEW.status AND NOT ((OLD.status='DRAFT' AND NEW.status IN ('REGISTRATION_OPEN','VOTING_UPCOMING')) OR (OLD.status='REGISTRATION_OPEN' AND NEW.status='VOTING_UPCOMING') OR (OLD.status='VOTING_UPCOMING' AND NEW.status IN ('VOTING_OPEN','VOTING_CLOSED')) OR (OLD.status='VOTING_OPEN' AND NEW.status='VOTING_CLOSED') OR (OLD.status='VOTING_CLOSED' AND NEW.status='RESULTS_PENDING') OR (OLD.status='RESULTS_PENDING' AND NEW.status='RESULTS_PUBLISHED') OR (OLD.status='RESULTS_PUBLISHED' AND NEW.status='ARCHIVED')) THEN RAISE EXCEPTION 'Invalid election state transition'; END IF;
  IF OLD.status<>'DRAFT' AND (to_jsonb(OLD)-ARRAY['status','registeredAtOpen','eligibleAtOpen']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','registeredAtOpen','eligibleAtOpen']) THEN RAISE EXCEPTION 'Election configuration is locked'; END IF;
  IF (OLD."registeredAtOpen" IS DISTINCT FROM NEW."registeredAtOpen" OR OLD."eligibleAtOpen" IS DISTINCT FROM NEW."eligibleAtOpen") AND NOT (OLD.status='VOTING_UPCOMING' AND NEW.status IN ('VOTING_OPEN','VOTING_CLOSED') AND OLD."registeredAtOpen" IS NULL AND OLD."eligibleAtOpen" IS NULL) THEN RAISE EXCEPTION 'Participation denominator is locked'; END IF;
 ELSE
  IF NEW.status<>'DRAFT' OR NEW."registeredAtOpen" IS NOT NULL OR NEW."eligibleAtOpen" IS NOT NULL THEN RAISE EXCEPTION 'New elections must begin as drafts'; END IF;
 END IF;
 IF NEW."groupId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM evote."OrganizationGroup" WHERE id=NEW."groupId" AND "organizationId"=NEW."organizationId") THEN RAISE EXCEPTION 'Group must belong to organization'; END IF;
 IF NEW."runoffOfId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM evote."Election" WHERE id=NEW."runoffOfId" AND "organizationId"=NEW."organizationId" AND status IN ('RESULTS_PUBLISHED','ARCHIVED')) THEN RAISE EXCEPTION 'Runoff parent must be a published election in the organization'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER election_lifecycle BEFORE INSERT OR UPDATE ON evote."Election" FOR EACH ROW EXECUTE FUNCTION evote.validate_election_update();
CREATE FUNCTION evote.validate_participation() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE limit_count integer; BEGIN
 SELECT "maxVotes" INTO limit_count FROM evote."ElectionPosition" WHERE id=NEW."positionId";
 IF NEW.count>limit_count OR (TG_OP='INSERT' AND NEW.count<>1) OR (TG_OP='UPDATE' AND (NEW.count<>OLD.count+1 OR NEW."userId"<>OLD."userId" OR NEW."positionId"<>OLD."positionId")) THEN RAISE EXCEPTION 'Participation limit exceeded'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER participation_limit BEFORE INSERT OR UPDATE ON evote."VoteStatus" FOR EACH ROW EXECUTE FUNCTION evote.validate_participation();
-- Ciphertext only. No authenticated/anonymous storage policies grant access.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES ('verification-documents','verification-documents',false,7340032,ARRAY['application/octet-stream']) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES ('campaign-images','campaign-images',true,5242880,ARRAY['image/png','image/jpeg']) ON CONFLICT (id) DO NOTHING;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA evote FROM PUBLIC, anon, authenticated;

ALTER TABLE evote."Election" ADD CONSTRAINT denominator_check CHECK (("registeredAtOpen" IS NULL OR "registeredAtOpen">=0) AND ("eligibleAtOpen" IS NULL OR "eligibleAtOpen">=0));
CREATE FUNCTION evote.validate_position_change() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE event_id text; event_status text; event_mode text; BEGIN
 IF TG_OP='DELETE' THEN event_id=OLD."electionId"; ELSE event_id=NEW."electionId"; END IF;
 IF TG_OP='UPDATE' AND NEW."electionId"<>OLD."electionId" THEN RAISE EXCEPTION 'Position cannot move between elections'; END IF;
 SELECT status,mode INTO event_status,event_mode FROM evote."Election" WHERE id=event_id FOR SHARE;
 IF event_status<>'DRAFT' THEN RAISE EXCEPTION 'Position settings are locked'; END IF;
 IF TG_OP<>'DELETE' AND event_mode='ELECTION_DEMO' AND (NEW."maxVotes"<>1 OR NEW.method='WEIGHTED') THEN RAISE EXCEPTION 'Formal participation rules are required'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER position_rules BEFORE INSERT OR UPDATE OR DELETE ON evote."ElectionPosition" FOR EACH ROW EXECUTE FUNCTION evote.validate_position_change();
CREATE FUNCTION evote.validate_candidate_change() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE position_id text; event_status text; BEGIN
 IF TG_OP='DELETE' THEN position_id=OLD."positionId"; ELSE position_id=NEW."positionId"; END IF;
 IF TG_OP='UPDATE' AND NEW."positionId"<>OLD."positionId" THEN RAISE EXCEPTION 'Candidate cannot move between positions'; END IF;
 SELECT e.status INTO event_status FROM evote."ElectionPosition" p JOIN evote."Election" e ON e.id=p."electionId" WHERE p.id=position_id FOR SHARE OF e;
 IF event_status NOT IN ('DRAFT','REGISTRATION_OPEN','VOTING_UPCOMING') THEN
  IF TG_OP='UPDATE' AND NEW."userId" IS NULL AND (to_jsonb(OLD)-'userId') IS NOT DISTINCT FROM (to_jsonb(NEW)-'userId') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Candidate election information is locked';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER candidate_rules BEFORE INSERT OR UPDATE OR DELETE ON evote."Candidate" FOR EACH ROW EXECUTE FUNCTION evote.validate_candidate_change();
CREATE FUNCTION evote.validate_eligibility_change() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE event_status text; organization_id text; BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW."electionId"<>OLD."electionId" OR NEW."userId"<>OLD."userId" THEN RAISE EXCEPTION 'Eligibility identity is immutable'; END IF;
 END IF;
 SELECT status,"organizationId" INTO event_status,organization_id FROM evote."Election" WHERE id=NEW."electionId" FOR SHARE;
 IF event_status NOT IN ('DRAFT','REGISTRATION_OPEN','VOTING_UPCOMING') THEN RAISE EXCEPTION 'Eligibility is locked during and after voting'; END IF;
 IF NEW."groupId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM evote."OrganizationGroup" WHERE id=NEW."groupId" AND "organizationId"=organization_id) THEN RAISE EXCEPTION 'Eligibility group must belong to the organization'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER eligibility_rules BEFORE INSERT OR UPDATE ON evote."VoterEligibility" FOR EACH ROW EXECUTE FUNCTION evote.validate_eligibility_change();
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA evote FROM PUBLIC, anon, authenticated;
