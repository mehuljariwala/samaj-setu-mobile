-- ---------------------------------------------------------------------------
-- A daily allowance for photo bytes taken out of storage.
--
-- The free plan allows 5 GB of egress a month, and photos are what used it up:
-- in its first two weeks the platform used 35 GB and was switched off until
-- the next billing cycle. Photos are now served from the app's own /media
-- address and cached by the Vercel CDN (lib/photo-link.ts), so storage sends a
-- photo about once a day rather than once per phone. This table is the brake
-- in case something still goes wrong: /media adds every byte it fetches from
-- storage to today's row and, once today is over its allowance, shows a plain
-- placeholder until tomorrow instead of fetching more.
--
-- One row per day (India time); nothing else is kept, so it needs no clean-up.
-- ---------------------------------------------------------------------------

create table app.file_egress (
  day   date primary key,
  bytes bigint not null default 0 check (bytes >= 0)
);

comment on table app.file_egress is
  'Bytes the /media route fetched from storage, per day (Asia/Kolkata). Written by public.file_egress().';

-- Adds p_add bytes to today (nothing, when p_add is 0) and returns today's total.
create or replace function public.file_egress(p_add bigint default 0)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day   date := (now() at time zone 'Asia/Kolkata')::date;
  v_total bigint;
begin
  if coalesce(p_add, 0) > 0 then
    insert into app.file_egress as f (day, bytes)
    values (v_day, p_add)
    on conflict (day) do update set bytes = f.bytes + excluded.bytes
    returning f.bytes into v_total;
  else
    select f.bytes into v_total from app.file_egress f where f.day = v_day;
  end if;

  return coalesce(v_total, 0);
end
$$;

comment on function public.file_egress(bigint) is
  'Daily storage egress for /media: adds p_add bytes to today and returns the total. Service role only.';

revoke execute on function public.file_egress(bigint) from public, anon, authenticated;
grant execute on function public.file_egress(bigint) to service_role;
