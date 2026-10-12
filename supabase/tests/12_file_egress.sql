-- ---------------------------------------------------------------------------
-- The daily allowance for photo bytes taken out of storage.
--
-- Same conventions as 01_assertions.sql: raise on failure, silent on success.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_condition boolean, p_what text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_what;
  end if;
end
$$;

do $$
declare
  v_member  uuid := '00000000-0000-4000-8000-000000000010';
  v_refused boolean;
begin
  delete from app.file_egress;

  set local role service_role;
  perform pg_temp.ok(public.file_egress() = 0, 'a day with no downloads starts at zero');
  perform pg_temp.ok(public.file_egress(0) = 0, 'asking for the total records nothing');
  perform pg_temp.ok(public.file_egress(120000) = 120000, 'a download is added to today');
  perform pg_temp.ok(public.file_egress(30000) = 150000, 'downloads add up');
  perform pg_temp.ok(public.file_egress(-500) = 150000, 'a negative size is ignored');
  perform pg_temp.ok(public.file_egress() = 150000, 'the total is read back');
  reset role;

  perform pg_temp.ok((select count(*) from app.file_egress) = 1, 'one row per day');

  -- Members and visitors cannot read the allowance or spend it.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_member::text, 'role', 'authenticated')::text, true);
    perform public.file_egress(999999999);
    v_refused := false;
  exception when insufficient_privilege then
    v_refused := true;
  end;
  reset role;
  perform pg_temp.ok(v_refused, 'a member cannot call file_egress');

  begin
    set local role anon;
    perform public.file_egress();
    v_refused := false;
  exception when insufficient_privilege then
    v_refused := true;
  end;
  reset role;
  perform pg_temp.ok(v_refused, 'a visitor cannot call file_egress');

  perform pg_temp.ok((select bytes from app.file_egress) = 150000, 'refused calls change nothing');

  delete from app.file_egress;
end
$$;
