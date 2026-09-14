# Architecture and data model

## The one distinction everything rests on

An **account** is a person who operates the app. A **candidate** is a person
being matched. They are different tables, joined by `candidate_memberships`.

Every awkward requirement in the specification falls out of keeping them apart:

* A parent manages three children — three candidates, one account, three
  membership rows.
* A candidate holds their own account too — a second membership, with
  `role = 'candidate'`.
* Publication consent must come from the candidate and not the parent — it is
  gated on `role = 'candidate'`, which no guardian has.
* "The first approved child verification unlocks a parent's member access" —
  one verified candidate among the memberships is enough.
* Interests are candidate-to-candidate, so two siblings browsing from the same
  phone get different results and different inboxes.

Phone numbers identify accounts. They say nothing about candidate uniqueness,
which is why duplicate detection compares names and birth dates and then asks a
human (spec §4).

## Where each kind of rule lives

There are four places a rule can go, and putting one in the wrong place is how
this sort of system leaks.

| Kind of rule | Where it lives | Example |
|---|---|---|
| Shape of a single row | `CHECK` constraint | a rejected application must carry a reason |
| Uniqueness | partial unique index | one live interest per candidate pair |
| Who may touch a row | RLS policy | a member reads only their own candidates |
| A transition between states | `SECURITY DEFINER` RPC | approving a registration |

The division matters because a transition is never one row. Approving a
registration writes the application, the candidate, a decision record and a
notification; it has to be all or nothing, and it has to refuse if another admin
decided first. No `UPDATE` policy can express that, so there is no `UPDATE`
policy — the RPC is the only way in.

The mirror of that: the RPCs do not replace RLS. A member who bypasses the
application entirely and talks to PostgREST still gets their own rows and
nothing else.

### The read boundary

**RLS answers "my data, plus the queues if I am staff". Every cross-member read
goes through a `SECURITY DEFINER` RPC.**

This is the load-bearing decision in the whole design. A policy cannot express
"…and the community rules permit this particular pair", because that answer
depends on the viewer's *acting candidate*, which is not in the row and is not
in the JWT. A view cannot either.

So `public.candidates` is readable only by its own operators and by staff, and
the directory is reached through `public.discover()` and
`public.get_candidate_profile()`, which resolve eligibility per pair before
returning anything. `public.directory_profiles` exists as a projection those
functions read, and is revoked from `anon` and `authenticated` — there is an
assertion to that effect, because it is exactly the grant someone would add by
accident later.

One consequence worth stating: the biodata payload contains the contact number,
because the form collects it as a field. `biodata_revisions` is therefore not
readable by other members at all, and `directory_profiles` strips
`phone`, `extraPhone` and `contactKind` out of the payload it exposes. Contact
details reach another member through exactly one path —
`candidate_contacts`, behind an accepted interest.

## Two independent lifecycles

Spec §5: "Identity approval and publication approval remain separate records and
states." So a candidate carries two status columns that never merge.

```
identity_status      unverified → pending → verified
                                ↘ correction_requested ↗
                                ↘ rejected

publication_status   not_started → draft → in_review → published
                                          ↘ correction_requested ↗
                                          ↘ rejected
                                            published ⇄ unpublished
```

A verified identity is required before biodata can be edited at all. An approved
biodata does *not* publish anything on its own: `app.apply_publication_state()`
is the single function that decides between `published` and `unpublished`, and
it is called both when an admin approves a revision and when a candidate grants
consent. Whichever happens second is what publishes the profile. Neither path
can disagree with the other, because there is only one of them.

### Discoverability

`candidates.discoverable` is a cached conjunction of six conditions spread over
three tables: verified identity, published status, an approved revision, not
paused, no match found, and active consent. It is maintained by a `BEFORE` 
trigger that assigns to `NEW`, so it cannot recurse and cannot drift from the
row it describes. Consent lives in its own table, so granting or withdrawing it
touches the candidate row to make the trigger re-evaluate.

The cache exists because the directory query has to be indexable —
`candidates_discoverable_idx` is a partial index on `(gender, city) where
discoverable`. Spec §5's "consent withdrawal takes effect immediately" is
satisfied because the trigger runs in the same transaction as the withdrawal.

## Community rules

Spec §7 asks for three things that are easy to get wrong, so each is structural
rather than conventional.

**Universal rules and family preferences are different tables.** A shared mosal
excludes everybody; "same sub-community" binds only the family that asked for
it, and is evaluated from the viewer's side.

**An unratified rule cannot be enforced.** `community_rules` carries a `CHECK`
that refuses `enabled = true` without a `ratified_at`. `paternal_surname` and
`declared_relation` ship disabled with `"status":
"awaiting_ratified_definition"` in their definition, because spec §7 says their
comparison rules need leadership ratification and forbids inferring genealogical
identity from an approximate text match. They are visible on the admin rules
screen doing nothing, which is the honest representation of where they stand.

**Unknown information is not eligibility.** `app.eligibility()` returns
`insufficient_information` as a verdict in its own right. Browsing shows those
profiles with an explanation in both languages; sending an interest requires
`eligible` exactly. A mosal that is missing, or present but not yet confirmed by
a human, produces that verdict — never `eligible`.

There is one rule the specification does not mention: `opposite_gender`. Rather
than bury that assumption in a query, it is a ratified universal rule with
`"assumption": "not stated in the specification"` in its definition, so it shows
up on the admin screen and can be switched off with one `UPDATE`.

## Biodata as revisions

Spec §5 requires that a change to published content be reviewed while the
approved version stays visible. So biodata is versioned:

* at most one revision per candidate is in flight, enforced by a partial unique
  index — two phones editing the same draft cannot fork it;
* `candidates.published_revision_id` points at the approved one;
* opening a new revision copies the approved data, so editing a published
  profile means changing one field rather than retyping twenty-five;
* approving a new revision marks the previous one `superseded` rather than
  deleting it.

**The field catalogue is in the database.** `public.biodata_fields` holds the
same 25 fields as `components/biodata/model.ts`, and it is the copy that
decides what a write may contain. A trigger validates every write against it and
recomputes `completion`, so an unknown key, an out-of-range height or a
malformed birth time is refused by the database and not only by the form. The
two lists must be changed together; the database one is authoritative.

That matters most for pasted biodata. Spec §12 calls it untrusted input:
`stage_imported_biodata` records every supplied key in `unconfirmed_fields`, and
`submit_biodata` refuses while that array is non-empty. Typing a value over an
imported one clears it — the act of typing is the confirmation.

## Admin review

Every decision function has the same five steps: lock the row, compare against
the status the reviewer was shown, apply, record, notify.

The comparison is what spec §10 means by "prevent conflicting concurrent review
decisions". Two admins open the same application; both see `submitted`; the
second to save is told the application is now `approved` rather than quietly
overwriting the first. `review_claims` exists alongside it, but only as an
advisory hint in the UI — it stops wasted effort, it does not stop a race.

Two smaller rules with teeth:

* **A possible duplicate blocks approval.** `admin_decide_registration` counts
  open `duplicate_candidates` rows and refuses, so an approval can never be the
  thing that creates a second canonical profile.
* **Internal notes are withheld at the column level.** `review_decisions` grants
  `authenticated` `SELECT` on a named list of columns that excludes
  `internal_note` and `actor_account_id`. A member's `select *` fails rather
  than succeeding with an internal note in it.

## Audit

`review_decisions` records moderation: actor, timestamp, reason, affected
revision. `audit_events` is the catch-all, written by a generic trigger on the
twelve tables that matter.

It records *which columns changed* plus the before and after of status and
timestamp columns — never document paths, contact details or biodata values.
Spec §10 forbids sensitive certificates appearing in logs, and an audit table is
a log. Viewing a certificate is itself an audited event, written by
`admin_certificate_reference()` before it returns the storage path.

The table is append-only. No role has an `INSERT`, `UPDATE` or `DELETE` policy;
rows arrive through `SECURITY DEFINER` triggers owned by the table owner, and
there is an assertion that not even an admin can delete one.

## Settings as data

`public.app_settings` is a single row holding the knobs spec §14 lists as
unsettled: the review target, interest expiry, photo-grant lifetime, share-link
lifetime, the consent text version, and certificate retention.

Three of them are `NULL` by default, and that is the point. `NULL` interest
expiry means interests do not expire, which is the only behaviour defensible
without a decision — better than a guess baked into code that nobody remembers
making. Settling one later is an `UPDATE` with an audit trail.
