-- Enable the scheduler; the worker token is provisioned in Vault, never in SQL history.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
REVOKE ALL ON SCHEMA cron, net FROM PUBLIC, anon, authenticated, evote_server;
REVOKE ALL ON vault.decrypted_secrets FROM PUBLIC, anon, authenticated, evote_server;
