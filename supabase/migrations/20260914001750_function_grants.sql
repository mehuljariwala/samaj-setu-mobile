-- ---------------------------------------------------------------------------
-- Function privileges.
--
-- PostgreSQL grants EXECUTE on a new function to PUBLIC, which through
-- PostgREST means every RPC in `public` is reachable by a signed-out visitor
-- until told otherwise. Each function does check its caller, but relying on
-- that alone means one forgotten check is a public endpoint. Start from zero
-- instead.
--
-- Runs before the auth-hook migration on purpose: that migration grants the
-- hook to supabase_auth_admin and revokes it from everyone else, and a blanket
-- grant applied afterwards would hand it back.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;

grant execute on all functions in schema public to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Two exceptions, both deliberate:
--
--   * public.discover / get_candidate_profile and friends check member access
--     themselves, so a signed-in but unapproved account calling them gets a
--     403 rather than a row. That is the intended behaviour — the check lives
--     in the function because the answer depends on the account, not the role.
--
--   * `anon` is granted nothing. Registration begins after sign-up, so there
--     is no anonymous entry point in this schema at all.
-- ---------------------------------------------------------------------------
