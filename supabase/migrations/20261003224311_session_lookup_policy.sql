-- Authentication uses Supabase Auth's authoritative /user session validation.
-- Remove the unused private lookup and its metadata grants; managed Auth RLS is unchanged.
DROP VIEW IF EXISTS evote."AuthSessionCheck";
REVOKE SELECT (id, user_id) ON auth.sessions FROM evote_server;
