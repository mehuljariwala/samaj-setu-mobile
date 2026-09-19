-- ---------------------------------------------------------------------------
-- Discoverability and community-rule evaluation (spec §5, §6, §7).
-- ---------------------------------------------------------------------------

-- ------------------------------------------------- discoverability cache ---
-- `candidates.discoverable` is the conjunction of six conditions spread across
-- three tables. Recomputing it in a BEFORE trigger keeps it atomic with the row
-- it describes and makes recursion impossible — the trigger assigns to NEW
-- rather than issuing another UPDATE.
create or replace function app.set_candidate_discoverability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.discoverable :=
        new.identity_status = 'verified'
    and new.publication_status = 'published'
    and new.published_revision_id is not null
    and not new.paused
    and new.match_found_at is null
    and new.deleted_at is null
    -- Spec §5: withdrawn consent hides the profile immediately.
    and app.has_active_consent(new.id);

  return new;
end
$$;

create trigger candidates_set_discoverability
  before insert or update on public.candidates
  for each row execute function app.set_candidate_discoverability();

-- Consent lives in its own table, so granting or withdrawing it has to nudge
-- the candidate row for the trigger above to re-evaluate.
create or replace function app.reevaluate_candidate_after_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.candidates c
     set updated_at = now()
   where c.id = coalesce(new.candidate_id, old.candidate_id);
  return null;
end
$$;

create trigger candidate_consents_reevaluate
  after insert or update or delete on public.candidate_consents
  for each row execute function app.reevaluate_candidate_after_consent();

-- ------------------------------------------------------------ eligibility --
-- Spec §7. Two rules about how this must behave, both easy to get wrong:
--
--   1. "Unknown information must not be treated as evidence of eligibility."
--      A missing or unconfirmed mosal yields `insufficient_information`, never
--      `eligible`. The UI explains that state rather than hiding it.
--   2. Universal rules bind everyone; a family preference binds only the family
--      that chose it, and is evaluated from the viewer's side.
--
-- Definite exclusions are checked first, because knowing a pair is excluded is
-- more useful than knowing the data is incomplete. Only if nothing excludes
-- them does missing data downgrade the verdict.
create or replace function app.eligibility(p_viewer uuid, p_target uuid)
returns public.eligibility_verdict
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer      public.candidates;
  v_target      public.candidates;
  v_viewer_cc   public.candidate_community;
  v_target_cc   public.candidate_community;
  v_prefs       public.family_preferences;
  v_rule_mosal  boolean;
  v_rule_gender boolean;
  v_incomplete  boolean := false;
begin
  if p_viewer is null or p_target is null then
    return 'insufficient_information';
  end if;

  if p_viewer = p_target then
    return 'excluded_self';
  end if;

  select * into v_viewer from public.candidates where id = p_viewer;
  select * into v_target from public.candidates where id = p_target;

  if v_viewer.id is null or v_target.id is null then
    return 'not_discoverable';
  end if;

  -- Siblings registered by the same parent. Not in the spec's rule list, but
  -- two candidates sharing a guardian account are the same household, and
  -- introducing them to each other is obviously wrong.
  if exists (
    select 1
    from public.candidate_memberships a
    join public.candidate_memberships b on b.account_id = a.account_id
    where a.candidate_id = p_viewer and a.revoked_at is null
      and b.candidate_id = p_target and b.revoked_at is null
  ) then
    return 'excluded_same_household';
  end if;

  -- Symmetric: a block in either direction hides both from each other, so that
  -- the absence of a profile is not itself a signal.
  if exists (
    select 1 from public.candidate_blocks
    where (blocker_candidate_id = p_viewer and blocked_candidate_id = p_target)
       or (blocker_candidate_id = p_target and blocked_candidate_id = p_viewer)
  ) then
    return 'excluded_blocked';
  end if;

  select enabled into v_rule_gender from public.community_rules where code = 'opposite_gender';
  if coalesce(v_rule_gender, false) and v_viewer.gender = v_target.gender then
    return 'excluded_gender';
  end if;

  select * into v_viewer_cc from public.candidate_community where candidate_id = p_viewer;
  select * into v_target_cc from public.candidate_community where candidate_id = p_target;

  -- ------------------------------------------------ universal: shared mosal
  select enabled into v_rule_mosal from public.community_rules where code = 'shared_mosal';
  if coalesce(v_rule_mosal, false) then
    if v_viewer_cc.mosal_family_norm is null
       or v_target_cc.mosal_family_norm is null
       or v_viewer_cc.confirmed_at is null
       or v_target_cc.confirmed_at is null then
      -- An unconfirmed mosal cannot clear anybody. Spec §7.
      v_incomplete := true;
    elsif v_viewer_cc.mosal_family_norm = v_target_cc.mosal_family_norm then
      return 'excluded_shared_mosal';
    end if;
  end if;

  -- --------------------------------------------- family preferences (viewer)
  select * into v_prefs from public.family_preferences where candidate_id = p_viewer;

  if coalesce(v_prefs.require_same_sub_community, false) then
    if v_viewer_cc.sub_community is null or v_target_cc.sub_community is null then
      v_incomplete := true;
    elsif v_viewer_cc.sub_community <> v_target_cc.sub_community then
      return 'excluded_sub_community';
    end if;
  end if;

  if coalesce(v_prefs.require_same_sect, false) then
    if v_viewer_cc.sect is null or v_target_cc.sect is null then
      v_incomplete := true;
    elsif v_viewer_cc.sect <> v_target_cc.sect then
      return 'excluded_sect';
    end if;
  end if;

  -- Visibility is checked last so that an excluded pair reports *why* they are
  -- excluded even while one of them is paused.
  if not v_target.discoverable then
    return 'not_discoverable';
  end if;

  if v_incomplete then
    return 'insufficient_information';
  end if;

  return 'eligible';
end
$$;

-- Client-callable wrapper. Refuses to answer about a viewer the caller does not
-- operate, so the verdict cannot be used to probe other people's rules.
create or replace function public.check_eligibility(p_viewer uuid, p_target uuid)
returns public.eligibility_verdict
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.operates_candidate(p_viewer) then
    raise exception 'forbidden: you do not act for that candidate'
      using errcode = 'insufficient_privilege';
  end if;
  return app.eligibility(p_viewer, p_target);
end
$$;

-- Explanation text for a verdict, in both languages (spec §7).
create or replace function public.eligibility_explanation(p_verdict public.eligibility_verdict)
returns table (gu text, en text)
language sql
stable
as $$
  select t.gu, t.en from (values
    ('eligible', 'આ પરિચય શક્ય છે.', 'This introduction is possible.'),
    ('insufficient_information',
     'પૂરતી માહિતી ન હોવાથી નિયમો ચકાસી શકાયા નથી. મોસાળ સહિતની વિગતો પુષ્ટિ કરો.',
     'The rules could not be checked because information is missing. Please confirm the mosal and related details.'),
    ('excluded_self', 'આ તમારો પોતાનો પ્રોફાઇલ છે.', 'This is your own profile.'),
    ('excluded_same_household', 'આ બંને પ્રોફાઇલ એક જ પરિવારના છે.', 'Both profiles belong to the same family.'),
    ('excluded_gender', 'આ ડિરેક્ટરી વિરુદ્ધ લિંગના ઉમેદવારો બતાવે છે.', 'The directory introduces candidates of the opposite gender.'),
    ('excluded_shared_mosal', 'બંને પરિવારોનું મોસાળ એક જ છે.', 'Both families share the same mosal.'),
    ('excluded_sub_community', 'આ પરિવારે સમાન પેટા સમાજની શરત રાખી છે.', 'This family requires the same sub-community.'),
    ('excluded_sect', 'આ પરિવારે સમાન ભક્ત / જગતની શરત રાખી છે.', 'This family requires the same sect.'),
    ('excluded_blocked', 'આ પ્રોફાઇલ ઉપલબ્ધ નથી.', 'This profile is not available.'),
    ('not_discoverable', 'આ પ્રોફાઇલ હાલ પ્રકાશિત નથી.', 'This profile is not published at the moment.')
  ) as t(verdict, gu, en)
  where t.verdict = p_verdict::text
$$;

-- --------------------------------------------------------- directory view --
-- What a member may see about a published candidate. Contact fields are
-- stripped from the biodata payload here rather than filtered in application
-- code, so no caller can forget.
--
-- security_invoker means the querying member's RLS on `candidates` still
-- applies; the view narrows columns, it does not widen access.
create view public.directory_profiles
with (security_invoker = true) as
select
  c.id,
  c.public_code,
  c.full_name,
  c.full_name_norm as full_name_search,
  c.gender,
  c.city,
  c.native_place,
  extract(year from age(c.date_of_birth))::integer as age,
  cc.sub_community,
  cc.sect,
  cc.paternal_surname,
  cc.mosal_family,
  cc.confirmed_at is not null as community_confirmed,
  -- Spec §8: contact details are never part of a directory record. They are
  -- released only through contact_grants, by a separate query.
  (r.data - 'phone' - 'extraPhone' - 'contactKind') as biodata,
  r.completion,
  c.published_revision_id as revision_id,
  p.photo_visibility,
  p.kundali_visibility,
  c.updated_at
from public.candidates c
join public.biodata_revisions r on r.id = c.published_revision_id
join public.candidate_privacy p on p.candidate_id = c.id
left join public.candidate_community cc on cc.candidate_id = c.id
where c.discoverable;

comment on view public.directory_profiles is
  'Published, consented, unpaused candidates with contact details removed. '
  'Eligibility is still per-viewer — call public.discover() rather than reading '
  'this view directly if you need the community rules applied.';

-- --------------------------------------------------------------- discover --
-- The directory as one viewer's candidate sees it: eligibility resolved,
-- excluded pairs dropped, and `insufficient_information` surfaced rather than
-- silently treated as a pass.
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
         on sp.candidate_id = s.id and sp.account_id = auth.uid()
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

comment on function public.discover(uuid, text, text, text, text, boolean, integer, integer) is
  'Directory query for one acting candidate. Applies community rules per pair, '
  'so two children of the same parent legitimately see different results.';
