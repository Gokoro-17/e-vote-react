-- Subscription billing stays in the private application schema, never in public.
CREATE TABLE evote."BillingSubscription" (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES evote."Organization"(id) ON DELETE RESTRICT,
  plan text NOT NULL CHECK (plan IN ('PRO','BUSINESS','ENTERPRISE')),
  "providerPlanCode" text NOT NULL,
  "providerCode" text UNIQUE,
  "customerCode" text,
  "payerEmail" text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency='NGN'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','NON_RENEWING','PAST_DUE','CANCELLED')),
  "paidUntil" timestamp(3),
  "cancellationRequested" boolean NOT NULL DEFAULT false,
  "lastCheckedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BillingSubscription_organizationId_paidUntil_idx" ON evote."BillingSubscription" ("organizationId","paidUntil");
CREATE INDEX "BillingSubscription_cancellationRequested_status_idx" ON evote."BillingSubscription" ("cancellationRequested",status);
CREATE TABLE evote."BillingPayment" (
  reference text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES evote."Organization"(id) ON DELETE RESTRICT,
  "subscriptionId" text NOT NULL REFERENCES evote."BillingSubscription"(id) ON DELETE RESTRICT,
  "actorId" text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency='NGN'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','FAILED')),
  "authorizationFingerprint" text,
  "customerCode" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" timestamp(3),
  CONSTRAINT payment_confirmation_check CHECK ((status='PAID') = ("paidAt" IS NOT NULL))
);
CREATE INDEX "BillingPayment_organizationId_createdAt_idx" ON evote."BillingPayment" ("organizationId","createdAt");
CREATE INDEX "BillingPayment_customerCode_authorizationFingerprint_idx" ON evote."BillingPayment" ("customerCode","authorizationFingerprint");
CREATE TABLE evote."BillingWebhook" (id text PRIMARY KEY,type text NOT NULL,"processedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
ALTER TABLE evote."BillingSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evote."BillingPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE evote."BillingWebhook" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON evote."BillingSubscription",evote."BillingPayment",evote."BillingWebhook" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON evote."BillingSubscription",evote."BillingPayment",evote."BillingWebhook" TO evote_server;
CREATE POLICY server_billing_subscription ON evote."BillingSubscription" TO evote_server USING (true) WITH CHECK (true);
CREATE POLICY server_billing_payment ON evote."BillingPayment" TO evote_server USING (true) WITH CHECK (true);
CREATE POLICY server_billing_webhook ON evote."BillingWebhook" TO evote_server USING (true) WITH CHECK (true);

-- Lock each election before checking capacity: invitation acceptance, verification,
-- password entry, runoffs and direct registration share this database guard.
CREATE OR REPLACE FUNCTION evote.validate_eligibility_change() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE event_status text; organization_id text; plan_rank integer; voter_limit integer;
BEGIN
 IF TG_OP='UPDATE' AND (NEW."electionId"<>OLD."electionId" OR NEW."userId"<>OLD."userId") THEN RAISE EXCEPTION 'Eligibility identity is immutable'; END IF;
 SELECT status,"organizationId" INTO event_status,organization_id FROM evote."Election" WHERE id=NEW."electionId" FOR UPDATE;
 IF event_status NOT IN ('DRAFT','REGISTRATION_OPEN','VOTING_UPCOMING') THEN RAISE EXCEPTION 'Eligibility is locked during and after voting'; END IF;
 IF NEW."groupId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM evote."OrganizationGroup" WHERE id=NEW."groupId" AND "organizationId"=organization_id) THEN RAISE EXCEPTION 'Eligibility group must belong to the organization'; END IF;
 IF TG_OP='INSERT' AND NOT EXISTS (SELECT 1 FROM evote."VoterEligibility" WHERE "electionId"=NEW."electionId" AND "userId"=NEW."userId") THEN
  SELECT CASE plan WHEN 'ENTERPRISE' THEN 3 WHEN 'BUSINESS' THEN 2 WHEN 'PRO' THEN 1 ELSE 0 END INTO plan_rank FROM evote."Organization" WHERE id=organization_id FOR SHARE;
  SELECT GREATEST(plan_rank,COALESCE(MAX(CASE plan WHEN 'ENTERPRISE' THEN 3 WHEN 'BUSINESS' THEN 2 WHEN 'PRO' THEN 1 ELSE 0 END),0)) INTO plan_rank FROM evote."BillingSubscription" WHERE "organizationId"=organization_id AND "paidUntil">CURRENT_TIMESTAMP AND status IN ('ACTIVE','NON_RENEWING','PAST_DUE');
  voter_limit=CASE plan_rank WHEN 0 THEN 50 WHEN 1 THEN 100 WHEN 2 THEN 1000 ELSE NULL END;
  IF voter_limit IS NOT NULL AND (SELECT count(*) FROM evote."VoterEligibility" WHERE "electionId"=NEW."electionId")>=voter_limit THEN RAISE EXCEPTION 'EVOTE_VOTER_LIMIT' USING ERRCODE='P0001'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA evote FROM PUBLIC,anon,authenticated;

-- A confirmed payment cannot be rewritten or deleted by the application role.
CREATE FUNCTION evote.validate_billing_payment() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP='UPDATE' AND (OLD.status='PAID' OR (to_jsonb(OLD)-ARRAY['status','paidAt','customerCode','authorizationFingerprint']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','paidAt','customerCode','authorizationFingerprint'])) THEN
  RAISE EXCEPTION 'Payment record is immutable';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM evote."BillingSubscription" WHERE id=NEW."subscriptionId" AND "organizationId"=NEW."organizationId" AND amount=NEW.amount AND currency=NEW.currency) THEN RAISE EXCEPTION 'Payment subscription mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER billing_payment_rules BEFORE INSERT OR UPDATE ON evote."BillingPayment" FOR EACH ROW EXECUTE FUNCTION evote.validate_billing_payment();
CREATE TRIGGER billing_payment_no_delete BEFORE DELETE ON evote."BillingPayment" FOR EACH ROW EXECUTE FUNCTION evote.immutable_record();
CREATE TRIGGER billing_payment_no_truncate BEFORE TRUNCATE ON evote."BillingPayment" FOR EACH STATEMENT EXECUTE FUNCTION evote.immutable_record();
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA evote FROM PUBLIC,anon,authenticated;
