-- ---------------------------------------------------------------------------
-- An audit trail must outlive what it describes.
--
-- `audit_events` and `review_decisions` carried real foreign keys to
-- `candidates` and `accounts`. Two consequences, both wrong:
--
--   * Deleting a candidate was impossible. app.audit_change() is an AFTER
--     DELETE trigger, so by the time it inserts its row the candidate is gone
--     and the foreign key rejects the write — the delete fails, and the only
--     record of the attempt is the error. Found against the live project;
--     the offline suite never deleted a candidate, so it never saw this.
--
--   * `on delete set null` on the other references meant that removing an
--     account or a candidate silently blanked the actor and subject on every
--     decision already recorded about them. Spec §10 requires actor, timestamp,
--     reason and affected revision to be kept for every decision; a reference
--     that erases itself when the subject leaves does not keep them.
--
-- The columns stay — they are still the right identifiers to query by — but
-- they become plain uuids. Referential integrity is the wrong tool for a log:
-- the whole point is to record things that no longer exist.
-- ---------------------------------------------------------------------------

alter table public.audit_events
  drop constraint if exists audit_events_candidate_id_fkey,
  drop constraint if exists audit_events_actor_account_id_fkey;

alter table public.review_decisions
  drop constraint if exists review_decisions_candidate_id_fkey,
  drop constraint if exists review_decisions_actor_account_id_fkey;

comment on column public.audit_events.candidate_id is
  'The candidate this event concerned. Deliberately not a foreign key: the row '
  'must survive the candidate being deleted, which is exactly when it matters.';

comment on column public.audit_events.actor_account_id is
  'Who acted. Deliberately not a foreign key, so closing an account does not '
  'erase them from the record of what they did.';

comment on column public.review_decisions.candidate_id is
  'Not a foreign key, for the same reason as audit_events.candidate_id — spec '
  '§10 requires the decision history to be preserved, including for records '
  'that have since been removed.';

-- The indexes were created alongside the constraints and are what the admin
-- screens actually query on; they are unaffected, but assert it here so a
-- future reordering cannot quietly drop them.
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'audit_events_candidate_idx') then
    create index audit_events_candidate_idx on public.audit_events (candidate_id, occurred_at desc);
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'review_decisions_candidate_idx') then
    create index review_decisions_candidate_idx on public.review_decisions (candidate_id, created_at desc);
  end if;
end
$$;
