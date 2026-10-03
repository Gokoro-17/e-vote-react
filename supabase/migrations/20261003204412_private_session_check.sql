-- Keep revocation checks available to the restricted application login without
-- granting access to Supabase's managed Auth schema. PostgreSQL resolves base
-- relations when creating a view; an invoker still needs the underlying column
-- privileges, and any underlying RLS policies continue to apply.
CREATE VIEW evote."AuthSessionCheck"
WITH (security_invoker = true)
AS SELECT id, user_id FROM auth.sessions;

REVOKE ALL ON evote."AuthSessionCheck" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON evote."AuthSessionCheck" TO evote_server;

COMMENT ON VIEW evote."AuthSessionCheck" IS
  'Private read-only invoker view for checking current Supabase session IDs; no tokens or account details.';
