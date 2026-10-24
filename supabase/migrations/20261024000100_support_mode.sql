-- ---------------------------------------------------------------------------
-- Support mode: a superadmin opens a family's account and acts as that family.
--
-- The samaj asked for one master login that can go into any family, see what
-- the family sees, and change anything the family could change, interests
-- included. Signing in as the family would have done that and lied in every
-- log: each change would name the family as the one who made it. So the
-- master stays signed in as themselves, and an open support session tells the
-- database whose family they are acting for:
--
--   whose family it is   app.acting_account_id(): the family while a session
--                        is open, the caller's own account otherwise. Every
--                        "which candidates does this account operate" check
--                        reads it, so the member screens and RPCs work for the
--                        master without knowing support mode exists.
--   who did it           auth.uid(), as before. decided_by, uploaded_by, the
--                        audit trail and the activity actor stay the master.
--
-- Sessions are superadmin-only, never open a staff account, belong to the
-- login they were opened from (the master's other devices stay the master),
-- and lapse after two hours. Removing the role or switching the master off
-- ends them at once. A biodata the master sends is approved at once — the
-- master is the reviewer — except where the queue would warn first: a family
-- switched off, or a change of name, date of birth or gender.
-- ---------------------------------------------------------------------------

create table public.support_sessions (
  id               uuid primary key default gen_random_uuid(),
  staff_account_id uuid not null references public.accounts (id) on delete cascade,
  account_id       uuid not null references public.accounts (id) on delete cascade,
  started_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  ended_at         timestamptz,
  -- The login it was opened from (the access token's session_id).
  session_id       text,
  check (staff_account_id <> account_id)
);

-- One open session per master: opening another family closes the last one.
-- Also what keeps app.acting_account_id() cheap, since every operator check
-- in every policy now asks it.
create unique index support_sessions_one_open
  on public.support_sessions (staff_account_id)
  where ended_at is null;

-- No policies: read and written only by the functions below.
alter table public.support_sessions enable row level security;

-- ------------------------------------------------------- whose family -------
-- plpgsql, not sql: a security definer sql function is never inlined and is
-- planned again on every call, and this one runs inside every operator check
-- of every policy. The role and status are read from their tables rather than
-- the token, so taking either away ends the session at once; those joins only
-- run once an open session has been found.
create or replace function app.acting_account_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_account uuid;
begin
  if v_uid is null then
    return null;
  end if;

  select s.account_id into v_account
    from public.support_sessions s
    join public.account_roles r on r.account_id = s.staff_account_id and r.role = 'superadmin'
    join public.accounts a on a.id = s.staff_account_id and a.status = 'active'
   where s.staff_account_id = v_uid
     and s.ended_at is null
     and s.expires_at > now()
     and s.session_id is not distinct from (auth.jwt() ->> 'session_id');

  return coalesce(v_account, v_uid);
end
$$;

create or replace function app.in_support_mode()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.acting_account_id() is distinct from auth.uid()
$$;

-- ---------------------------------------------- open and close a session ----
create or replace function public.admin_end_support()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  with ended as (
    update public.support_sessions
       set ended_at = now()
     where staff_account_id = auth.uid() and ended_at is null
    returning account_id, expires_at
  )
  insert into public.account_activity (account_id, kind, actor_account_id, detail)
  select e.account_id, 'account.support_ended', auth.uid(),
         jsonb_build_object('lapsed', e.expires_at <= now())
    from ended e;
end
$$;

create or replace function public.admin_start_support(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expires timestamptz := now() + interval '2 hours';
begin
  -- From the tables, as in app.acting_account_id().
  if not exists (
    select 1 from public.account_roles r
      join public.accounts a on a.id = r.account_id and a.status = 'active'
     where r.account_id = auth.uid() and r.role = 'superadmin'
  ) then
    raise exception 'forbidden: only the superadmin can open a family''s account'
      using errcode = '42501';
  end if;
  if p_account_id is null or p_account_id = auth.uid() then
    raise exception 'invalid: choose a family''s account' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'not_found: no such account' using errcode = 'P0002';
  end if;
  -- Acting as another admin would borrow their review powers, not a family's.
  if exists (select 1 from public.account_roles where account_id = p_account_id) then
    raise exception 'forbidden: a staff account cannot be opened' using errcode = '42501';
  end if;

  perform public.admin_end_support();

  insert into public.support_sessions (staff_account_id, account_id, expires_at, session_id)
  values (auth.uid(), p_account_id, v_expires, auth.jwt() ->> 'session_id');

  insert into public.account_activity (account_id, kind, actor_account_id)
  values (p_account_id, 'account.support_started', auth.uid());

  return jsonb_build_object('account_id', p_account_id, 'expires_at', v_expires);
end
$$;

revoke execute on function public.admin_end_support() from public, anon;
revoke execute on function public.admin_start_support(uuid) from public, anon;
grant execute on function public.admin_end_support() to authenticated, service_role;
grant execute on function public.admin_start_support(uuid) to authenticated, service_role;


-- ----------------------------------------------- operator checks follow -----
-- The same functions as before, with the account they look up memberships
-- for read from app.acting_account_id() instead of auth.uid().

create or replace function app.operates_candidate(p_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_candidate_id is not null
     and exists (
       select 1 from public.candidate_memberships m
       where m.candidate_id = p_candidate_id
         and m.account_id = app.acting_account_id()
         and m.revoked_at is null
     )
$$;

create or replace function app.operated_candidate_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.candidate_id
  from public.candidate_memberships m
  join public.candidates c on c.id = m.candidate_id
  where m.account_id = app.acting_account_id()
    and m.revoked_at is null
    and c.deleted_at is null
$$;

create or replace function app.shares_contact_with(p_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.contact_grants g
    join public.candidate_memberships m
      on m.account_id = app.acting_account_id()
     and m.revoked_at is null
     and m.candidate_id in (g.candidate_low, g.candidate_high)
    -- Accepting an interest creates the grant; the owner can still decline to
    -- publish their numbers through it (spec §8 keeps the two separate).
    join public.candidate_privacy p
      on p.candidate_id = p_candidate_id and p.reveal_contact_on_accept
    where g.revoked_at is null
      and p_candidate_id in (g.candidate_low, g.candidate_high)
      and m.candidate_id <> p_candidate_id
  )
$$;


-- Member access needs the family's own account to be on as well, so a master
-- acting for a switched-off family is held to what that family may do: its
-- biodata, not Discover or introductions. For anyone else the two accounts
-- are the same one. (app.is_candidate_self is left alone: publication consent
-- stays the candidate's own.)

create or replace function app.has_member_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.account_is_active()
     and exists (select 1 from public.accounts a
                  where a.id = app.acting_account_id() and a.status = 'active')
     and exists (
       select 1
       from public.candidate_memberships m
       join public.candidates c on c.id = m.candidate_id
       where m.account_id = app.acting_account_id()
         and m.revoked_at is null
         and c.identity_status = 'verified'
         and c.deleted_at is null
     )
$$;


-- The family's own state, suspended included, so the master is shown the
-- screens the family would be.

create or replace function app.access_state()
returns public.access_state
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account public.accounts;
  v_status  public.application_status;
begin
  if app.acting_account_id() is null then
    return 'signed_out';
  end if;

  select * into v_account from public.accounts a where a.id = app.acting_account_id();

  if v_account.id is null then
    return 'no_application';
  end if;

  if v_account.status <> 'active' then
    return 'suspended';
  end if;

  if app.has_member_access() then
    return 'approved';
  end if;

  -- No verified candidate yet, so the answer is whatever this account's
  -- applications say. Pick the one furthest along.
  select r.status into v_status
  from public.registration_applications r
  where r.account_id = app.acting_account_id()
  order by array_position(
    array['correction_requested', 'under_review', 'submitted', 'draft',
          'rejected', 'withdrawn', 'approved']::text[],
    r.status::text
  )
  limit 1;

  return case v_status
    when 'correction_requested' then 'correction_requested'
    when 'under_review'         then 'awaiting_review'
    when 'submitted'            then 'awaiting_review'
    when 'draft'                then 'application_draft'
    when 'rejected'             then 'rejected'
    when 'withdrawn'            then 'no_application'
    -- `approved` here means the application was approved but the candidate is
    -- no longer verified — suspended, say. Not member access.
    when 'approved'             then 'awaiting_review'
    else 'no_application'
  end;
end
$$;


-- ---------------------------------------------- the family's shortlist ------
-- Saved profiles belong to the account, so they follow the family too.

create or replace function public.discover(
  p_viewer_candidate uuid,
  p_query            text default null,
  p_city             text default null,
  p_sect             text default null,
  p_sub_community    text default null,
  p_saved_only       boolean default false,
  p_limit            integer default 20,
  p_offset           integer default 0
)
returns table (
  id                uuid,
  public_code       text,
  full_name         text,
  age               integer,
  city              text,
  sub_community     text,
  sect              text,
  mosal_family      text,
  biodata           jsonb,
  verdict           public.eligibility_verdict,
  saved             boolean,
  interest_status   public.interest_status,
  photo_visibility  public.media_visibility,
  can_view_photos   boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.operates_candidate(p_viewer_candidate) then
    raise exception 'forbidden: you do not act for that candidate'
      using errcode = 'insufficient_privilege';
  end if;
  if not app.has_member_access() then
    raise exception 'forbidden: member access requires an approved candidate'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with scored as (
    select d.*, app.eligibility(p_viewer_candidate, d.id) as verdict
    from public.directory_profiles d
    where (p_city is null or d.city = p_city)
      and (p_sect is null or d.sect = p_sect)
      and (p_sub_community is null or d.sub_community = p_sub_community)
      and (
        p_query is null or btrim(p_query) = ''
        or d.full_name_search like '%' || app.normalize_name(p_query) || '%'
        or d.public_code ilike '%' || btrim(p_query) || '%'
      )
  )
  select
    s.id, s.public_code, s.full_name, s.age, s.city,
    s.sub_community, s.sect, s.mosal_family, s.biodata,
    s.verdict,
    sp.account_id is not null as saved,
    i.status as interest_status,
    s.photo_visibility,
    app.can_view_media_of(s.id, 'photo') as can_view_photos
  from scored s
  left join public.saved_profiles sp
         on sp.candidate_id = s.id and sp.account_id = app.acting_account_id()
  left join lateral (
    select it.status
    from public.interests it
    where it.pair_low = least(p_viewer_candidate, s.id)
      and it.pair_high = greatest(p_viewer_candidate, s.id)
    order by it.created_at desc
    limit 1
  ) i on true
  -- Definite exclusions disappear. `insufficient_information` does not: the
  -- member is told the rules could not be checked (spec §7).
  where s.verdict in ('eligible', 'insufficient_information')
    and (not p_saved_only or sp.account_id is not null)
  order by s.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
end
$$;

create or replace function public.get_candidate_profile(
  p_viewer_candidate uuid,
  p_target_candidate uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_verdict public.eligibility_verdict;
  v_row     public.directory_profiles;
  v_expl    record;
begin
  perform app.require_operator(p_viewer_candidate);
  perform app.require_member_access();

  v_verdict := app.eligibility(p_viewer_candidate, p_target_candidate);

  -- An excluded pair gets the reason and nothing else. Returning the profile
  -- with a flag would leave the decision to the client (spec §2).
  if v_verdict not in ('eligible', 'insufficient_information') then
    select * into v_expl from public.eligibility_explanation(v_verdict);
    return jsonb_build_object(
      'verdict', v_verdict,
      'explanation', jsonb_build_object('gu', v_expl.gu, 'en', v_expl.en)
    );
  end if;

  select * into v_row from public.directory_profiles where id = p_target_candidate;
  if v_row.id is null then
    raise exception 'not_found: no such profile' using errcode = 'P0002';
  end if;

  select * into v_expl from public.eligibility_explanation(v_verdict);

  return jsonb_build_object(
    'verdict', v_verdict,
    'explanation', jsonb_build_object('gu', v_expl.gu, 'en', v_expl.en),
    'id', v_row.id,
    'public_code', v_row.public_code,
    'full_name', v_row.full_name,
    'age', v_row.age,
    'city', v_row.city,
    'native_place', v_row.native_place,
    'sub_community', v_row.sub_community,
    'sect', v_row.sect,
    'paternal_surname', v_row.paternal_surname,
    'mosal_family', v_row.mosal_family,
    'community_confirmed', v_row.community_confirmed,
    'biodata', v_row.biodata,
    'saved', exists (
      select 1 from public.saved_profiles s
      where s.candidate_id = p_target_candidate and s.account_id = app.acting_account_id()
    ),
    'interest', (
      select jsonb_build_object('id', i.id, 'status', i.status,
                                'outgoing', i.from_candidate_id = p_viewer_candidate)
      from public.interests i
      where i.pair_low = least(p_viewer_candidate, p_target_candidate)
        and i.pair_high = greatest(p_viewer_candidate, p_target_candidate)
      order by i.created_at desc limit 1
    ),
    'photos', jsonb_build_object(
      'visibility', v_row.photo_visibility,
      'can_view', app.can_view_media_of(p_target_candidate, 'photo'),
      'count', (
        select count(*) from public.candidate_media m
        where m.candidate_id = p_target_candidate and m.kind = 'photo'
          and m.status = 'approved' and m.deleted_at is null
      ),
      'request_status', (
        select r.status from public.media_access_requests r
        where r.owner_candidate_id = p_target_candidate
          and r.viewer_candidate_id = p_viewer_candidate and r.kind = 'photo'
        order by r.created_at desc limit 1
      )
    ),
    'kundali', jsonb_build_object(
      'visibility', v_row.kundali_visibility,
      'can_view', app.can_view_media_of(p_target_candidate, 'kundali')
    ),
    -- Spec §8: contact details appear only behind an accepted interest, and
    -- only if the owner has not withheld them.
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', ct.contact_kind, 'display_name', ct.display_name, 'phone', ct.phone
      ))
      from public.candidate_contacts ct
      where ct.candidate_id = p_target_candidate
        and app.shares_contact_with(p_target_candidate)
    ), '[]'::jsonb)
  );
end
$$;

create or replace function public.list_saved(p_viewer_candidate uuid)
returns table (
  id uuid, public_code text, full_name text, age integer, city text,
  sub_community text, sect text, verdict public.eligibility_verdict, saved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_operator(p_viewer_candidate);
  perform app.require_member_access();

  return query
  select d.id, d.public_code, d.full_name, d.age, d.city, d.sub_community, d.sect,
         app.eligibility(p_viewer_candidate, d.id), s.created_at
  from public.saved_profiles s
  join public.directory_profiles d on d.id = s.candidate_id
  where s.account_id = app.acting_account_id()
  order by s.created_at desc;
end
$$;

drop policy saved_profiles_own on public.saved_profiles;
create policy saved_profiles_own on public.saved_profiles
  for all to authenticated
  using (account_id = (select app.acting_account_id()))
  with check (account_id = (select app.acting_account_id()));

-- The master reads the family's notifications but cannot mark them read
-- (notifications_mark_read still checks auth.uid()), so whatever is new for
-- the family stays new until the family itself has seen it.
drop policy notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications
  for select to authenticated
  using (account_id = (select app.acting_account_id()));


-- ---------------------------------------------------- the family's view -----
-- my_context() is everything the app shell knows, so returning the family's
-- here is what makes every member screen show the family. `support` is set
-- while a session is open, for the banner and the way back.

create or replace function public.my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account uuid := app.acting_account_id();
begin
  if v_account is null then
    return jsonb_build_object('access_state', 'signed_out', 'candidates', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'account', (
      select jsonb_build_object(
        'id', a.id, 'phone', a.phone, 'display_name', a.display_name,
        'preferred_language', a.preferred_language, 'status', a.status,
        'phone_verified', a.phone_verified_at is not null
      )
      from public.accounts a where a.id = v_account
    ),
    'access_state', app.access_state(),
    'roles', coalesce((
      select jsonb_agg(r.role) from public.account_roles r where r.account_id = v_account
    ), '[]'::jsonb),
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'public_code', c.public_code,
        'full_name', c.full_name,
        'gender', c.gender,
        'relationship', m.relationship,
        'is_self', m.role = 'candidate',
        'identity_status', c.identity_status,
        'publication_status', c.publication_status,
        'discoverable', c.discoverable,
        'paused', c.paused,
        'consent_active', app.has_active_consent(c.id),
        'application', (
          select jsonb_build_object(
            'id', ra.id, 'status', ra.status, 'submitted_at', ra.submitted_at,
            'review_due_at', ra.review_due_at,
            'overdue', ra.review_due_at is not null
                       and ra.status in ('submitted', 'under_review')
                       and ra.review_due_at < now(),
            'decision_reason', ra.decision_reason,
            'correction_fields', to_jsonb(ra.correction_fields),
            'has_certificate', exists (
              select 1 from public.application_documents d
              where d.application_id = ra.id and d.kind = 'birth_certificate' and d.deleted_at is null
            )
          )
          from public.registration_applications ra where ra.candidate_id = c.id
        ),
        'biodata', (
          select jsonb_build_object(
            'revision_id', r.id, 'status', r.status, 'completion', r.completion,
            'decision_reason', r.decision_reason,
            'correction_fields', to_jsonb(r.correction_fields)
          )
          from public.biodata_revisions r
          where r.candidate_id = c.id
          order by r.version desc limit 1
        ),
        'pending_interests', (
          select count(*) from public.interests i
          where i.to_candidate_id = c.id and i.status = 'pending'
        ),
        'pending_photo_requests', (
          select count(*) from public.media_access_requests mr
          where mr.owner_candidate_id = c.id and mr.status = 'pending'
        )
      ) order by c.created_at)
      from public.candidate_memberships m
      join public.candidates c on c.id = m.candidate_id
      where m.account_id = v_account and m.revoked_at is null and c.deleted_at is null
    ), '[]'::jsonb),
    'unread_notifications', (
      select count(*) from public.notifications n
      where n.account_id = v_account and n.read_at is null
    ),
    'support', (
      select jsonb_build_object(
        'account_id', s.account_id,
        'started_at', s.started_at,
        'expires_at', s.expires_at
      )
      from public.support_sessions s
      where app.in_support_mode()
        and s.staff_account_id = auth.uid()
        and s.ended_at is null
    )
  );
end
$$;


-- A candidate registered in support mode joins the family's account; the
-- master is recorded as the one who created and linked it.

create or replace function public.start_registration(
  p_relationship   public.relationship,
  p_full_name      text,
  p_date_of_birth  date,
  p_gender         public.gender,
  p_father_name    text default null,
  p_mother_name    text default null,
  p_city           text default null,
  p_native_place   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account     uuid := app.acting_account_id();
  v_actor       uuid := app.current_account_id();
  v_candidate   uuid;
  v_application uuid;
  v_dup         record;
  v_duplicates  jsonb := '[]'::jsonb;
begin
  if v_account is null then
    raise exception 'unauthenticated: sign in first' using errcode = '42501';
  end if;
  if not app.account_is_active() then
    raise exception 'forbidden: this account is not active' using errcode = '42501';
  end if;
  if btrim(coalesce(p_full_name, '')) = '' then
    raise exception 'invalid: full_name is required' using errcode = 'P0001';
  end if;

  insert into public.candidates (
    full_name, date_of_birth, gender, father_name, mother_name,
    city, native_place, identity_status, created_by_account_id
  )
  values (
    btrim(p_full_name), p_date_of_birth, p_gender,
    nullif(btrim(coalesce(p_father_name, '')), ''),
    nullif(btrim(coalesce(p_mother_name, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_native_place, '')), ''),
    'unverified', v_actor
  )
  returning id into v_candidate;

  insert into public.candidate_memberships
    (candidate_id, account_id, role, relationship, linked_by_account_id)
  values (
    v_candidate, v_account,
    (case when p_relationship = 'self' then 'candidate' else 'guardian' end)::public.membership_role,
    p_relationship, v_actor
  );

  insert into public.registration_applications
    (candidate_id, account_id, operator_relationship, status, review_target_hours)
  values (
    v_candidate, v_account, p_relationship, 'draft',
    (select review_target_hours from public.app_settings where id)
  )
  returning id into v_application;

  -- Spec §4: flag, never merge. These rows are admin-only; the operator is told
  -- how many were flagged and nothing about who they are.
  for v_dup in
    select * from app.find_duplicate_candidates(v_candidate, p_full_name, p_date_of_birth)
  loop
    insert into public.duplicate_candidates
      (application_id, candidate_id, matched_candidate_id, match_reasons, similarity)
    values (v_application, v_candidate, v_dup.matched_candidate_id, v_dup.reasons, v_dup.similarity)
    on conflict do nothing;
    v_duplicates := v_duplicates || jsonb_build_object('similarity', v_dup.similarity);
  end loop;

  return jsonb_build_object(
    'candidate_id', v_candidate,
    'application_id', v_application,
    'public_code', (select public_code from public.candidates where id = v_candidate),
    -- A count, not a list. Spec §4 forbids revealing anything about the
    -- existing record during this process.
    'possible_duplicates', jsonb_array_length(v_duplicates)
  );
end
$$;

create or replace function public.request_candidate_access(
  p_public_code  text,
  p_relationship public.relationship,
  p_note         text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate uuid;
  v_id        uuid;
begin
  if app.acting_account_id() is null then
    raise exception 'unauthenticated: sign in first' using errcode = '42501';
  end if;

  select id into v_candidate from public.candidates
   where public_code = btrim(upper(p_public_code)) and deleted_at is null;

  -- Deliberately the same error whether the code is wrong or the candidate is
  -- unavailable: a probe must not be able to enumerate valid codes.
  if v_candidate is null then
    raise exception 'not_found: no candidate matches that code' using errcode = 'P0002';
  end if;

  if app.operates_candidate(v_candidate) then
    raise exception 'conflict: you already act for that candidate' using errcode = 'P0001';
  end if;

  insert into public.access_requests
    (account_id, candidate_id, claimed_relationship, evidence_note)
  values (app.acting_account_id(), v_candidate, p_relationship, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'conflict: you already have a pending request for that candidate'
      using errcode = 'P0001';
  end if;

  return v_id;
end
$$;


-- What the master does lands on the family's timeline, with the master as
-- the actor, so the admin's view of the family shows who really did it.

create or replace function public.record_activity(
  p_kind                text,
  p_candidate_id        uuid default null,
  p_target_candidate_id uuid default null,
  p_detail              jsonb default '{}'::jsonb,
  p_path                text default null,
  p_ip                  text default null,
  p_user_agent          text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_account uuid := app.acting_account_id();
  v_kind    text := lower(btrim(coalesce(p_kind, '')));
  v_target  uuid := p_target_candidate_id;
  v_detail  jsonb := coalesce(p_detail, '{}'::jsonb);
  v_window  interval;
begin
  if v_account is null then
    return;  -- nobody to attach it to
  end if;

  if v_kind like 'account.%' or v_kind = 'auth.sign_in_failed' then
    raise exception 'forbidden: % is recorded by the database only', v_kind using errcode = '42501';
  end if;

  -- A profile opened from Discover names who was looked at.
  if v_target is null and p_path ~ '^/discover/[0-9a-f-]{36}$' then
    v_target := substring(p_path from 11)::uuid;
  end if;

  -- A reload, a double tap or an autosave is one event, not five.
  v_window := case when v_kind = 'biodata.draft_saved' then interval '10 minutes' else interval '1 minute' end;
  if exists (
    select 1 from public.account_activity x
    where x.account_id = v_account
      and x.kind = v_kind
      and x.occurred_at > now() - v_window
      and x.path is not distinct from p_path
      and x.candidate_id is not distinct from p_candidate_id
      and x.target_candidate_id is not distinct from v_target
      and x.detail = v_detail
  ) then
    return;
  end if;

  insert into public.account_activity
    (account_id, kind, actor_account_id, candidate_id, target_candidate_id, path, detail, ip, user_agent)
  values
    (v_account, v_kind, auth.uid(), p_candidate_id, v_target,
     left(p_path, 300), v_detail, left(p_ip, 64), left(p_user_agent, 400));
end
$$;


-- ----------------------------------------------- live straight away ---------
-- A biodata the master sends for a verified candidate is approved in the same
-- call, through admin_decide_biodata so that publishing, photos, contacts and
-- the family's notification all happen exactly as for any approval. Two cases
-- still wait for the queue, because the queue shows something first: a family
-- that is switched off (approving switches it back on), and a version that
-- changes the name, date of birth or gender (shown beside the old values).

create or replace function public.submit_biodata(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev      public.biodata_revisions;
  v_cc       public.candidate_community;
  v_problems text;
begin
  select * into v_rev from public.biodata_revisions where id = p_revision_id for update;
  if v_rev.id is null then
    raise exception 'not_found: no such revision' using errcode = 'P0002';
  end if;
  perform app.require_operator(v_rev.candidate_id);

  if not exists (select 1 from public.candidates
                  where id = v_rev.candidate_id and identity_status = 'verified') then
    raise exception 'conflict: send the biodata with the registration' using errcode = 'P0001';
  end if;

  if v_rev.status not in ('draft', 'correction_requested') then
    raise exception 'conflict: this revision is not open for submission (%)', v_rev.status
      using errcode = 'P0001';
  end if;

  select string_agg(field_key, ',' order by field_key) into v_problems
  from app.validate_biodata(v_rev.data, true);

  if v_problems is not null then
    raise exception 'incomplete: %', v_problems using errcode = 'P0001';
  end if;

  if cardinality(v_rev.unconfirmed_fields) > 0 then
    raise exception 'unconfirmed: %', array_to_string(v_rev.unconfirmed_fields, ',')
      using errcode = 'P0001';
  end if;

  select * into v_cc from public.candidate_community where candidate_id = v_rev.candidate_id;

  if v_cc.confirmed_at is null then
    if v_rev.source = 'guided' then
      update public.candidate_community
         set confirmed_at = now(), confirmed_by_account_id = app.current_account_id()
       where candidate_id = v_rev.candidate_id;
    else
      raise exception 'unconfirmed: community_details' using errcode = 'P0001';
    end if;
  end if;

  update public.biodata_revisions
     set status = 'submitted', submitted_at = now(),
         decided_at = null, decided_by_account_id = null,
         decision_reason = null, correction_fields = '{}'
   where id = p_revision_id;

  update public.candidates set publication_status = 'in_review'
   where id = v_rev.candidate_id and published_revision_id is null;

  perform app.record_decision(
    'biodata_revision', p_revision_id, v_rev.candidate_id, 'reopen',
    v_rev.status::text, 'submitted', '{}', null, 'submitted by operator', p_revision_id
  );

  if app.in_support_mode()
     and v_rev.detail_changes = '{}'::jsonb
     and exists (select 1 from public.accounts
                  where id = app.acting_account_id() and status = 'active') then
    return public.admin_decide_biodata(
      p_revision_id, 'approve', 'submitted', null, '[]'::jsonb, 'sent in support mode'
    ) || jsonb_build_object('revision_id', p_revision_id);
  end if;

  return jsonb_build_object('status', 'submitted', 'revision_id', p_revision_id);
end
$$;
