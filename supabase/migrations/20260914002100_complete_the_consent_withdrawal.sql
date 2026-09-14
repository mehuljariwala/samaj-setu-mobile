-- ---------------------------------------------------------------------------
-- Fixes the trigger added in 20260914002000.
--
-- It set `withdrawn_at` without `withdrawn_by_account_id`, and
-- candidate_consents carries
--
--     check ((withdrawn_at is null) = (withdrawn_by_account_id is null))
--
-- so every account deletion failed on a check violation — the opposite of what
-- that migration set out to allow. The constraint was right; the trigger was
-- half a withdrawal.
--
-- The departing account is recorded as the withdrawer, which is accurate: their
-- leaving is what ended the consent. That uuid outliving the account is exactly
-- why 20260914002000 dropped the foreign key.
-- ---------------------------------------------------------------------------

create or replace function app.withdraw_consent_on_last_operator_leaving()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate uuid;
begin
  for v_candidate in
    select m.candidate_id from public.candidate_memberships m
    where m.account_id = old.id
  loop
    if not exists (
      select 1 from public.candidate_memberships m
      where m.candidate_id = v_candidate
        and m.account_id <> old.id
        and m.revoked_at is null
    ) then
      update public.candidate_consents
         set withdrawn_at = now(),
             withdrawn_by_account_id = old.id
       where candidate_id = v_candidate and withdrawn_at is null;

      perform app.apply_publication_state(v_candidate);
    end if;
  end loop;

  return old;
end
$$;
