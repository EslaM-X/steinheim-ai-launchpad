-- Close a real hole found during go-live verification.
--
-- Phase E2 granted `authenticated` a column-level SELECT on social_accounts
-- that deliberately excluded the token columns. That grant was correct and
-- useless: Supabase ships default privileges that GRANT ALL on every new table
-- in `public` to anon and authenticated, so the table-level grant arrived first
-- and the narrower one merely added to it. A signed-in user could read
-- access_token and refresh_token through PostgREST.
--
-- A column-level grant only constrains anything once the table-level grant it
-- sits under has been revoked. Revoke first, then grant.

-- ── social_accounts: OAuth tokens for every publishing channel ──────────────
REVOKE ALL ON public.social_accounts FROM anon, authenticated;
GRANT SELECT (
  id, platform, account_type, account_name, external_account_id,
  token_expires_at, scopes, status, metadata, created_at, updated_at
) ON public.social_accounts TO authenticated;
GRANT ALL ON public.social_accounts TO service_role;

-- ── integrations: bot tokens and shared secrets ─────────────────────────────
REVOKE ALL ON public.integrations FROM anon, authenticated;
GRANT SELECT (id, kind, name, external_id, config, status, created_at, updated_at)
  ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;

-- ── automation_requests: caller behaviour, never application data ───────────
REVOKE ALL ON public.automation_requests FROM anon, authenticated;
GRANT ALL ON public.automation_requests TO service_role;

-- Stop the same default privileges from re-opening the next table that holds a
-- secret. Tables that should be readable still grant explicitly, as they do
-- today; nothing becomes readable by accident.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- The status vocabulary was introduced NOT VALID because a live table might
-- have held older values. This database was created after it, so the
-- constraint can now be proven rather than merely enforced going forward.
ALTER TABLE public.posts VALIDATE CONSTRAINT posts_status_valid;

COMMENT ON TABLE public.social_accounts IS
  'Publishing destinations. Token columns are service_role only — see the '
  'column grants above, which depend on the REVOKE that precedes them.';
