-- ---------------------------------------------------------------------------
-- Authorisation helpers.
--
-- Every one of these is SECURITY DEFINER with an empty search_path. That is not
-- decoration: an RLS policy on `candidate_memberships` that queried
-- `candidate_memberships` through the caller's own privileges would recurse
-- forever. Running as the definer reads the table without re-entering RLS,
-- which is what makes the policies in the next migration expressible at all.
--
-- They live in `app`, which is not exposed through PostgREST, so a client
-- cannot call them to probe for the existence of records it cannot read.
-- ---------------------------------------------------------------------------

-- ----------------------------------------------------------------- roles ---
-- Reads the role from the JWT when the custom access token hook is enabled
-- (one fewer query per policy evaluation), and falls back to the table when it
-- is not. A role granted mid-session only takes effect on the next token
-- refresh — the usual trade for putting authorisation in a token.
create or replace function app.has_role(p_role public.app_role)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb;
  v_roles  jsonb;
begin
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_roles  := v_claims -> 'app_roles';

  if jsonb_typeof(v_roles) = 'array' then
    return v_roles ? p_role::text;
  end if;

  return exists (
    select 1 from public.account_roles r
    where r.account_id = auth.uid() and r.role = p_role
  );
end
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_role('admin') or app.has_role('superadmin')
$$;

-- Moderators see the queues and can request corrections; admins can also
-- approve, reject and link accounts. Kept as one predicate so read policies can
-- say "staff" without deciding what a moderator may write.
create or replace function app.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_role('moderator') or app.has_role('admin') or app.has_role('superadmin')
$$;

-- -------------------------------------------------------------- accounts ---
create or replace function app.account_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.accounts a
    where a.id = auth.uid() and a.status = 'active'
  )
$$;

-- ------------------------------------------------------------ candidates ---
-- The candidates this account may act for. Everything candidate-scoped is
-- expressed against this set, so there is exactly one definition of "mine".
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
  where m.account_id = auth.uid()
    and m.revoked_at is null
    and c.deleted_at is null
$$;

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
         and m.account_id = auth.uid()
         and m.revoked_at is null
     )
$$;

-- True only for the candidate's own account. Publication consent and identity
-- changes are gated on this, never on `operates_candidate` (spec §4).
create or replace function app.is_candidate_self(p_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.candidate_memberships m
    where m.candidate_id = p_candidate_id
      and m.account_id = auth.uid()
      and m.role = 'candidate'
      and m.revoked_at is null
  )
$$;

-- ---------------------------------------------------------- member access --
-- Spec §2: "The first approved child verification unlocks a parent's member
-- access." One verified candidate is enough; the other children keep their own
-- independent states.
create or replace function app.has_member_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.account_is_active()
     and exists (
       select 1
       from public.candidate_memberships m
       join public.candidates c on c.id = m.candidate_id
       where m.account_id = auth.uid()
         and m.revoked_at is null
         and c.identity_status = 'verified'
         and c.deleted_at is null
     )
$$;

-- Spec §2's access table collapsed to a single value, resolved in the order the
-- table is written: the most permissive state the account has actually earned.
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
  if auth.uid() is null then
    return 'signed_out';
  end if;

  select * into v_account from public.accounts a where a.id = auth.uid();

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
  where r.account_id = auth.uid()
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

-- ------------------------------------------------------------- relations ---
-- Does any candidate this account operates have an accepted interest with the
-- given candidate? This is what unlocks contact details (spec §8).
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
      on m.account_id = auth.uid()
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

-- Same question for media: has the owner granted any candidate this account
-- operates access to this kind of media?
create or replace function app.can_view_media_of(p_owner_candidate_id uuid, p_kind public.media_kind)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- Their own media, always.
    app.operates_candidate(p_owner_candidate_id)
    -- An explicit viewer-specific grant to one of my candidates (spec §8).
    or exists (
      select 1
      from public.media_grants g
      where g.owner_candidate_id = p_owner_candidate_id
        and g.kind = p_kind
        and g.revoked_at is null
        and (g.expires_at is null or g.expires_at > now())
        and g.viewer_candidate_id in (select app.operated_candidate_ids())
    )
    -- Or the owner opted this kind of media up to "all approved members".
    or (
      app.has_member_access()
      and exists (
        select 1
        from public.candidate_privacy p
        join public.candidates c on c.id = p.candidate_id
        where p.candidate_id = p_owner_candidate_id
          and c.discoverable
          and case p_kind
                when 'photo'   then p.photo_visibility
                when 'kundali' then p.kundali_visibility
              end = 'members'
      )
    )
$$;

comment on function app.can_view_media_of(uuid, public.media_kind) is
  'The single definition of media visibility. Both the candidate_media policy '
  'and the storage.objects policy call it, so the request layer and the storage '
  'layer cannot drift apart (spec §8).';
