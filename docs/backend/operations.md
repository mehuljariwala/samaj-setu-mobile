# Operations

## Running it

### Offline verification — no Docker required

```sh
npm run db:verify    # rebuild a throwaway database, migrate, seed, assert
npm run db:types     # regenerate lib/supabase/database.types.ts from it
npm run db:check     # both, then tsc --noEmit
```

`db:verify` needs a local PostgreSQL 17 server you can create databases on, and
`psql` on the path. It drops and recreates `samaj_setu_verify` (override with
`DB=…`), applies `supabase/tests/00_shim.sql` to stand in for the parts of
Supabase a plain server lacks, then every migration in order, then `seed.sql`,
then the assertions.

This is what keeps the migrations honest between changes. It cannot test GoTrue,
the Storage API or PostgREST.

### The full local stack

```sh
supabase start       # needs Docker
supabase db reset    # migrations + seed
```

`supabase db reset` runs the same migrations and the same `seed.sql`. The seed
detects which `auth.users` columns exist, so it works against both GoTrue and
the shim.

Then copy `.env.example` to `.env.local`, fill in the URL and keys that
`supabase start` printed, and run `npm run dev`.

### Seeded accounts

Password for all of them: `samaj-setu-dev`. Fictional data only.

| Phone | Who | State |
|---|---|---|
| 9999900001 | superadmin | can grant roles, ratify rules, change settings |
| 9999900002 | admin | can approve, reject, request corrections |
| 9876543210 | Rajeshbhai, a parent | manages Aarav (SS-1024, published) |
| 9876500011 | Aarav | his own account — the one that can consent |
| 9876500012 | Kavya | SS-1025, published, one accepted interest |
| 9876500013 | Riya | SS-1026, published, one pending photo request |
| 9876500014 | Nidhi | SS-1027, published — shares Aarav's mosal, so excluded |
| 9876500015 | Meenaben | Dhara's application is awaiting review |
| 9876500016 | Sureshbhai | Jay's application has a correction requested |

The Aarav/Nidhi pair exists so the shared-mosal exclusion is visible without
setting anything up, and the Aarav/Kavya pair so contact reveal is.

No photographs are seeded: no object exists in the private buckets, and a
`candidate_media` row pointing at a missing file would produce a broken signed
URL.

## Deploying

```sh
supabase link --project-ref <ref>
supabase db push
```

Then in the dashboard:

1. **Authentication → Providers → Phone.** Enable it. Leave "Confirm phone" off
   unless you are turning on OTP (below).
2. **Authentication → Hooks.** Enable the custom access token hook and point it
   at `public.custom_access_token_hook`. Optional — `app.has_role()` falls back
   to a table lookup — but it saves a query on every policy evaluation.
3. **Storage.** Confirm `certificates`, `candidate-photos` and `kundali` exist
   and are **not** public. The migration creates them; check anyway, because a
   bucket flipped to public would undo the whole media model.
4. **First superadmin.** Bootstrapping is necessarily privileged — there is
   nobody yet who could grant it. With the service role:

   ```sql
   insert into public.account_roles (account_id, role)
   values ('<account uuid>', 'superadmin');
   ```

   Every later grant goes through `public.grant_role()`, which refuses a
   self-grant.
5. **Vercel.** Set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. The secret
   key must not carry a `NEXT_PUBLIC_` prefix.

### Before first deployment

The offline harness cannot reach GoTrue, Storage or PostgREST, so check these
against a real stack:

- [ ] Sign up with a phone number; confirm a `public.accounts` row appears and
      `phone_verified_at` is null.
- [ ] Upload a certificate from the browser to `certificates/<candidate_id>/…`
      and confirm the member cannot read it back.
- [ ] As a member, try `GET /rest/v1/candidates` directly with your own token
      and confirm you get only your own candidates.
- [ ] As a member, try `GET /rest/v1/directory_profiles` and confirm it is
      refused.
- [ ] Confirm a signed photo URL stops working after 60 seconds.
- [ ] Grant yourself `admin`, refresh the session, and confirm the queues load.

## Recurring jobs

None are scheduled. Two are available:

* `public.expire_stale_interests()` — a no-op until
  `app_settings.interest_expiry_days` is set, which spec §14 leaves unsettled.
* Overdue review flagging — the data is already there
  (`registration_applications.review_due_at`), surfaced by
  `public.admin_dashboard()`. A push notification for it needs a provider first.

Enable `pg_cron` and schedule the first if and when interest expiry is decided.

## Integration requirements

Named rather than simulated, as spec §12 requires.

**SMS.** None configured. Needed for real OTP and for "your profile was
approved" messages. `public.notification_outbox` queues rows and nothing drains
them — a row there means *queued*, never *delivered*.

**Push / email.** Same table, same status.

**Pasted-biodata parsing.** `public.stage_imported_biodata()` takes
already-extracted key/value pairs. Extracting them from pasted text is an
application concern — a route handler or an edge function. Whatever produces
them, spec §12 requires the result to be treated as untrusted, which the RPC
does by marking every supplied key unconfirmed.

**Kundali photograph extraction.** Later phase; not started.

## Turning on OTP

Currently phone plus password with no SMS. Switching to real OTP:

1. `supabase/config.toml`: set `enable_confirmations = true` under
   `[auth.sms]` and configure a provider (`[auth.sms.twilio]` or similar) with
   credentials from the environment.
2. `app/actions/auth.ts`: call `signInWithOtp({ phone })` and `verifyOtp(…)`
   instead of `signUp({ phone, password })` / `signInWithPassword(…)`.
3. Backfill:
   ```sql
   update public.accounts a
      set phone_verified_at = u.phone_confirmed_at
     from auth.users u
    where u.id = a.id and u.phone_confirmed_at is not null;
   ```

No schema change is needed. `accounts.phone_verified_at` exists for exactly this.

## Decisions still open

Spec §14 lists these as planning inputs. Each is represented in the schema as an
explicit unsettled value rather than a guess.

| Decision | Where it lives | Current state |
|---|---|---|
| Certificate retention and deletion | `app_settings.certificate_retention_days`, `application_documents.retention_delete_after` | null; nothing deletes anything |
| Interest expiry | `app_settings.interest_expiry_days` | null; interests do not expire |
| Photo-grant lifetime | `app_settings.photo_grant_days` | null; grants stand until revoked |
| Candidate consent identity mechanism | `candidate_consents`, gated on a `role = 'candidate'` membership | implemented for candidates with their own account; assisted consent is undefined, so publication stays blocked |
| Paternal-surname rule definition | `community_rules.paternal_surname` | recorded, `enabled = false`, no ratified definition |
| Declared-relation rule definition | `community_rules.declared_relation` | recorded, `enabled = false` |
| Production OTP provider | `supabase/config.toml` | none |
| Support / grievance operator | — | not modelled; no contact is shown to members |
| Legal requirements and effective dates | — | not modelled |

Two further notes:

* `opposite_gender` is a **ratified and enabled** universal rule that the
  specification never mentions. It is recorded as an explicit assumption in its
  definition so it is visible and reversible, but it deserves confirmation.
* The seeded launch target of 20–30 consented and approved girls' profiles
  (spec §13) is a content task, not a schema one. The seed ships four published
  candidates.

## Changing the schema

1. Add a new file to `supabase/migrations/` with a later timestamp. Do not edit
   an applied migration.
2. If the change touches the biodata fields, change
   `public.biodata_fields` and `components/biodata/model.ts` together. The
   database copy is authoritative and will reject writes the form allows.
3. Add an assertion to `supabase/tests/01_assertions.sql` for anything that is a
   security property.
4. Run `npm run db:check`.
