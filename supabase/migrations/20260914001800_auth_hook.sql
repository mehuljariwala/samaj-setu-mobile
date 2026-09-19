-- ---------------------------------------------------------------------------
-- Custom access token hook.
--
-- Copies a member's elevated roles into the JWT as `app_roles`, so that
-- app.has_role() can answer from the token instead of querying account_roles on
-- every policy evaluation. Enabled by [auth.hook.custom_access_token] in
-- config.toml, and by the equivalent switch in the hosted dashboard.
--
-- The hook is an optimisation, not the authority: app.has_role() falls back to
-- the table whenever the claim is absent, so the schema behaves correctly
-- whether or not the hook is switched on. The trade is the usual one — a role
-- granted mid-session takes effect on the next token refresh.
-- ---------------------------------------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_roles  jsonb;
  v_claims jsonb;
begin
  select coalesce(jsonb_agg(r.role), '[]'::jsonb)
    into v_roles
  from public.account_roles r
  where r.account_id = (event ->> 'user_id')::uuid;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_claims := jsonb_set(v_claims, '{app_roles}', v_roles);

  return jsonb_set(event, '{claims}', v_claims);
end
$$;

-- GoTrue calls the hook as supabase_auth_admin, which is otherwise a stranger
-- to the public schema.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant select on public.account_roles to supabase_auth_admin;

create policy account_roles_auth_admin_read
  on public.account_roles for select to supabase_auth_admin
  using (true);

-- Nobody else may call it. A member who could invoke the hook directly could
-- mint a claims object of their own choosing.
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
