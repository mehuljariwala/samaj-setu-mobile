-- ---------------------------------------------------------------------------
-- Discovery, interests, media access and protected sharing (spec §6, §8, §9).
--
-- These are the cross-member entry points. Each one resolves, in order:
--   1. does the caller act for the acting candidate?
--   2. does the caller have member access at all?
--   3. what does app.eligibility() say about this pair?
--   4. what has the *other* side actually granted?
-- Only then does it return a row. Nothing here trusts a candidate id supplied
-- by the client beyond using it as a lookup key.
-- ---------------------------------------------------------------------------

create or replace function app.require_member_access()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_member_access() then
    raise exception 'forbidden: member access requires an approved candidate'
      using errcode = '42501';
  end if;
end
$$;

-- ------------------------------------------------------------ profile -----
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
      where s.candidate_id = p_target_candidate and s.account_id = auth.uid()
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

-- --------------------------------------------------------------- media ----
-- Returns storage coordinates, never URLs. The caller signs them with the
-- Storage API for a short window; a signed URL generated here would outlive
-- the authorisation that produced it.
create or replace function public.list_viewable_media(
  p_viewer_candidate uuid,
  p_owner_candidate  uuid,
  p_kind             public.media_kind default 'photo'
)
returns table (id uuid, bucket_id text, storage_path text, is_primary boolean, sort_order smallint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_operator(p_viewer_candidate);

  if not app.can_view_media_of(p_owner_candidate, p_kind) then
    raise exception 'forbidden: no access to this media' using errcode = '42501';
  end if;

  return query
  select m.id, m.bucket_id, m.storage_path, m.is_primary, m.sort_order
  from public.candidate_media m
  where m.candidate_id = p_owner_candidate
    and m.kind = p_kind
    and m.deleted_at is null
    -- Own media is visible before review; everyone else sees approved only.
    and (m.status = 'approved' or app.operates_candidate(p_owner_candidate))
  order by m.is_primary desc, m.sort_order, m.created_at;
end
$$;

create or replace function public.request_media_access(
  p_viewer_candidate uuid,
  p_owner_candidate  uuid,
  p_kind             public.media_kind default 'photo',
  p_message          text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verdict public.eligibility_verdict;
  v_id      uuid;
begin
  perform app.require_operator(p_viewer_candidate);
  perform app.require_member_access();

  v_verdict := app.eligibility(p_viewer_candidate, p_owner_candidate);
  if v_verdict not in ('eligible', 'insufficient_information') then
    raise exception 'forbidden: % ', v_verdict using errcode = '42501';
  end if;

  insert into public.media_access_requests
    (owner_candidate_id, viewer_candidate_id, kind, message, requested_by_account_id)
  values (p_owner_candidate, p_viewer_candidate, p_kind,
          nullif(btrim(coalesce(p_message, '')), ''), app.current_account_id())
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'conflict: a request is already pending' using errcode = 'P0001';
  end if;

  perform app.notify_operators(
    p_owner_candidate, 'photo_request_received',
    jsonb_build_object('request_id', v_id, 'kind', p_kind)
  );

  return v_id;
end
$$;

create or replace function public.decide_media_access(
  p_request_id uuid,
  p_approve    boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req  public.media_access_requests;
  v_days integer;
begin
  select * into v_req from public.media_access_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'not_found: no such request' using errcode = 'P0002';
  end if;

  -- The owner decides, not the asker.
  perform app.require_operator(v_req.owner_candidate_id);

  if v_req.status <> 'pending' then
    raise exception 'conflict: this request was already answered (%)', v_req.status
      using errcode = 'P0001';
  end if;

  update public.media_access_requests
     set status = (case when p_approve then 'approved' else 'declined' end)::public.media_request_status,
         decided_at = now(), decided_by_account_id = app.current_account_id()
   where id = p_request_id;

  if p_approve then
    select photo_grant_days into v_days from public.app_settings where id;

    insert into public.media_grants
      (owner_candidate_id, viewer_candidate_id, kind, request_id, expires_at)
    values (
      v_req.owner_candidate_id, v_req.viewer_candidate_id, v_req.kind, p_request_id,
      case when v_days is null then null else now() + make_interval(days => v_days) end
    )
    on conflict do nothing;
  end if;

  perform app.notify_operators(
    v_req.viewer_candidate_id, 'photo_request_decided',
    jsonb_build_object('request_id', p_request_id, 'approved', p_approve, 'kind', v_req.kind)
  );

  return jsonb_build_object('status', case when p_approve then 'approved' else 'declined' end);
end
$$;

create or replace function public.revoke_media_grant(p_grant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant public.media_grants;
begin
  select * into v_grant from public.media_grants where id = p_grant_id for update;
  if v_grant.id is null then
    raise exception 'not_found: no such grant' using errcode = 'P0002';
  end if;
  perform app.require_operator(v_grant.owner_candidate_id);

  update public.media_grants
     set revoked_at = now(), revoked_by_account_id = app.current_account_id()
   where id = p_grant_id and revoked_at is null;
end
$$;

comment on function public.revoke_media_grant(uuid) is
  'Spec §8: revocation prevents future access. It cannot recall an image already '
  'downloaded, and the product must not claim otherwise.';

-- ------------------------------------------------------------ interests ---
create or replace function public.send_interest(
  p_from_candidate uuid,
  p_to_candidate   uuid,
  p_message        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from    public.candidates;
  v_verdict public.eligibility_verdict;
  v_days    integer;
  v_id      uuid;
begin
  perform app.require_operator(p_from_candidate);
  perform app.require_member_access();

  select * into v_from from public.candidates where id = p_from_candidate;

  -- Spec §2/§6: an approved member may browse, but a candidate who is not
  -- published — or who is paused — cannot send new interests.
  if not v_from.discoverable then
    raise exception 'forbidden: this candidate is not published, so cannot send interests'
      using errcode = '42501';
  end if;

  v_verdict := app.eligibility(p_from_candidate, p_to_candidate);

  -- Spec §7: incomplete information is not permission. Unlike browsing, where
  -- `insufficient_information` is shown and explained, acting on it is blocked.
  if v_verdict <> 'eligible' then
    raise exception 'ineligible: %', v_verdict using errcode = 'P0001';
  end if;

  select interest_expiry_days into v_days from public.app_settings where id;

  insert into public.interests
    (from_candidate_id, to_candidate_id, initiated_by_account_id, message, expires_at)
  values (
    p_from_candidate, p_to_candidate, app.current_account_id(),
    nullif(btrim(coalesce(p_message, '')), ''),
    case when v_days is null then null else now() + make_interval(days => v_days) end
  )
  returning id into v_id;

  perform app.notify_operators(
    p_to_candidate, 'interest_received', jsonb_build_object('interest_id', v_id)
  );

  return v_id;
exception
  when unique_violation then
    -- The partial unique index on (pair_low, pair_high) is the real guard
    -- against duplicates (spec §8); this turns it into a readable error.
    raise exception 'conflict: there is already a live interest between these two'
      using errcode = 'P0001';
end
$$;

create or replace function public.respond_interest(
  p_interest_id uuid,
  p_accept      boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_int public.interests;
begin
  select * into v_int from public.interests where id = p_interest_id for update;
  if v_int.id is null then
    raise exception 'not_found: no such interest' using errcode = 'P0002';
  end if;

  -- Only the receiving side answers.
  perform app.require_operator(v_int.to_candidate_id);

  if v_int.status <> 'pending' then
    raise exception 'conflict: this interest was already answered (%)', v_int.status
      using errcode = 'P0001';
  end if;

  update public.interests
     set status = (case when p_accept then 'accepted' else 'declined' end)::public.interest_status,
         responded_at = now(), responded_by_account_id = app.current_account_id()
   where id = p_interest_id;

  if p_accept then
    -- Spec §8: acceptance grants the authorised parties access to the
    -- configured contact details.
    insert into public.contact_grants (interest_id, candidate_low, candidate_high)
    values (
      p_interest_id,
      least(v_int.from_candidate_id, v_int.to_candidate_id),
      greatest(v_int.from_candidate_id, v_int.to_candidate_id)
    )
    on conflict do nothing;
  end if;

  perform app.notify_operators(
    v_int.from_candidate_id, 'interest_responded',
    jsonb_build_object('interest_id', p_interest_id, 'accepted', p_accept)
  );

  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end);
end
$$;

create or replace function public.withdraw_interest(p_interest_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_int public.interests;
begin
  select * into v_int from public.interests where id = p_interest_id for update;
  if v_int.id is null then
    raise exception 'not_found: no such interest' using errcode = 'P0002';
  end if;
  perform app.require_operator(v_int.from_candidate_id);

  if v_int.status <> 'pending' then
    raise exception 'conflict: only a pending interest can be withdrawn' using errcode = 'P0001';
  end if;

  update public.interests
     set status = 'withdrawn', withdrawn_at = now()
   where id = p_interest_id;
end
$$;

-- Inbox, outbox and accepted, with just enough of the counterpart to render a
-- row. Scoped to one acting candidate (spec §6).
create or replace function public.list_interests(
  p_candidate_id uuid,
  p_box          text default 'received'
)
returns table (
  id              uuid,
  status          public.interest_status,
  outgoing        boolean,
  message         text,
  created_at      timestamptz,
  responded_at    timestamptz,
  counterpart_id  uuid,
  counterpart_code text,
  counterpart_name text,
  counterpart_age  integer,
  counterpart_city text,
  contact_visible boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_operator(p_candidate_id);

  if p_box not in ('received', 'sent', 'accepted') then
    raise exception 'invalid: box must be received, sent or accepted' using errcode = 'P0001';
  end if;

  return query
  select
    i.id,
    i.status,
    i.from_candidate_id = p_candidate_id as outgoing,
    i.message,
    i.created_at,
    i.responded_at,
    o.id,
    o.public_code,
    o.full_name,
    extract(year from age(o.date_of_birth))::integer,
    o.city,
    app.has_contact_grant(p_candidate_id, o.id)
  from public.interests i
  join public.candidates o
    on o.id = case when i.from_candidate_id = p_candidate_id
                   then i.to_candidate_id else i.from_candidate_id end
  where (p_candidate_id in (i.from_candidate_id, i.to_candidate_id))
    and case p_box
          when 'received' then i.to_candidate_id = p_candidate_id and i.status = 'pending'
          when 'sent'     then i.from_candidate_id = p_candidate_id and i.status = 'pending'
          when 'accepted' then i.status = 'accepted'
        end
  order by i.created_at desc;
end
$$;

-- Saved shortlist. A separate RPC because saved_profiles rows point at
-- candidates the member has no direct SELECT on.
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
  where s.account_id = auth.uid()
  order by s.created_at desc;
end
$$;

-- ---------------------------------------------------------- share links ----
-- Spec §9: the link is protected, the card is generic. The plaintext token is
-- returned exactly once, here; only its hash is stored.
create or replace function public.create_share_link(p_candidate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_days  integer;
  v_id    uuid;
begin
  perform app.require_operator(p_candidate_id);

  if not exists (select 1 from public.candidates where id = p_candidate_id and discoverable) then
    raise exception 'conflict: only a published profile can be shared' using errcode = 'P0001';
  end if;

  select share_link_days into v_days from public.app_settings where id;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.share_links
    (token_hash, candidate_id, created_by_account_id, expires_at)
  values (
    app.hash_share_token(v_token), p_candidate_id, app.current_account_id(),
    now() + make_interval(days => coalesce(v_days, 14))
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    -- Shown once. There is no way to recover it afterwards, by design.
    'token', v_token,
    'expires_at', now() + make_interval(days => coalesce(v_days, 14))
  );
end
$$;

create or replace function public.resolve_share_link(
  p_token            text,
  p_viewer_candidate uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link    public.share_links;
  v_outcome text;
begin
  select * into v_link from public.share_links
   where token_hash = app.hash_share_token(coalesce(p_token, '')) for update;

  if v_link.id is null then
    raise exception 'not_found: this link is not valid' using errcode = 'P0002';
  end if;

  -- Spec §9: "Recipients must authenticate and be approved before viewing."
  -- Every refusal is recorded, because a link being tried by unapproved
  -- accounts is the signal that it has been forwarded.
  if v_link.revoked_at is not null or v_link.expires_at < now()
     or (v_link.max_uses is not null and v_link.use_count >= v_link.max_uses) then
    v_outcome := 'denied_expired';
  elsif not app.has_member_access() then
    v_outcome := 'denied_not_approved';
  elsif not app.operates_candidate(p_viewer_candidate) then
    v_outcome := 'denied_not_approved';
  elsif app.eligibility(p_viewer_candidate, v_link.candidate_id)
        not in ('eligible', 'insufficient_information') then
    v_outcome := 'denied_not_eligible';
  else
    v_outcome := 'opened';
  end if;

  insert into public.share_link_uses (share_link_id, account_id, outcome)
  values (v_link.id, app.current_account_id(), v_outcome);

  if v_outcome <> 'opened' then
    raise exception 'forbidden: %', v_outcome using errcode = '42501';
  end if;

  update public.share_links set use_count = use_count + 1 where id = v_link.id;

  -- Same payload as any other profile view: a share link is a shortcut to the
  -- profile screen, never a way around its rules.
  return public.get_candidate_profile(p_viewer_candidate, v_link.candidate_id);
end
$$;

create or replace function public.revoke_share_link(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.share_links;
begin
  select * into v_link from public.share_links where id = p_id for update;
  if v_link.id is null then
    raise exception 'not_found: no such link' using errcode = 'P0002';
  end if;
  perform app.require_operator(v_link.candidate_id);

  update public.share_links
     set revoked_at = now(), revoked_by_account_id = app.current_account_id()
   where id = p_id and revoked_at is null;
end
$$;
