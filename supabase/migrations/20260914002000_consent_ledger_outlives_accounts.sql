-- ---------------------------------------------------------------------------
-- An account that has given consent must still be deletable.
--
-- `candidate_consents.granted_by_account_id` was `on delete restrict`. The
-- intent was right — a consent ledger has to record who consented, and that
-- record must not evaporate — but the mechanism made the account permanently
-- undeletable, which contradicts the deletion controls spec §6 puts on the
-- Family screen. Found while cleaning up after an end-to-end run: three of
-- four test accounts could not be removed.
--
-- Same reasoning as 20260914001900: referential integrity is the wrong tool
-- for a ledger whose purpose is to record what happened. The column stays as
-- a plain uuid, so "who consented, and when, to which wording" is still
-- answerable after the account is gone.
--
-- What keeps consent honest is unchanged and is where it belongs: the
-- app.enforce_consent_is_self() trigger still refuses, at insert time, any
-- grantor who is not the candidate's own account (spec §4).
-- ---------------------------------------------------------------------------

alter table public.candidate_consents
  drop constraint if exists candidate_consents_granted_by_account_id_fkey,
  drop constraint if exists candidate_consents_withdrawn_by_account_id_fkey;

comment on column public.candidate_consents.granted_by_account_id is
  'The account that consented. Deliberately not a foreign key: the ledger has '
  'to outlive the account, and an account must remain deletable. Validated at '
  'insert time by app.enforce_consent_is_self().';

-- Deleting the last account that operates a candidate leaves that candidate
-- with no operator: unreachable, unpublishable and undeletable through the
-- app. Consent is withdrawn here so such a profile cannot linger in the
-- directory with nobody able to take it down.
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
         set withdrawn_at = now()
       where candidate_id = v_candidate and withdrawn_at is null;

      perform app.apply_publication_state(v_candidate);
    end if;
  end loop;

  return old;
end
$$;

comment on function app.withdraw_consent_on_last_operator_leaving() is
  'Spec §5: a profile nobody can operate must not stay visible. Runs before the '
  'account is deleted, while its memberships still exist.';

create trigger accounts_last_operator_leaving
  before delete on public.accounts
  for each row execute function app.withdraw_consent_on_last_operator_leaving();
