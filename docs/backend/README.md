# Samaj Setu backend — plan and status

Date: 14 September 2026

A Supabase backend covering the whole of the first release described in
[`docs/superpowers/specs/2026-09-08-samaj-setu-design.md`](../superpowers/specs/2026-09-08-samaj-setu-design.md):
registration and identity review, duplicate resolution, family linking, staged
biodata, candidate consent, publication moderation, private discovery, saved
profiles, interests, viewer-specific photo permissions, mutual contact reveal,
protected sharing, and mobile admin operations.

This directory is the design record. The implementation is in `supabase/`
(database) and `lib/supabase`, `lib/data`, `app/actions`, `proxy.ts`
(application).

| Document | What it covers |
|---|---|
| [architecture.md](architecture.md) | Why the pieces are shaped this way; the data model and its lifecycles |
| [security-model.md](security-model.md) | Authentication, RLS, storage, and what is deliberately not protected |
| [operations.md](operations.md) | Running it locally, deploying it, and the decisions still open |

## Decisions taken before building

Two questions were settled first, because the answers change the schema.

**Authentication is phone plus password, with no OTP.** The specification asks
for OTP; the prototype's README says identity rests on admin review of the birth
certificate instead. The second was chosen. A password is still required — an
unverified phone number with no credential is not an identity, and anyone who
knew the number could take the account. `accounts.phone_verified_at` exists and
stays null, so "we have not verified this number" is recorded rather than
implied. Turning OTP on later is a configuration change plus a backfill; see
[operations.md](operations.md#turning-on-otp).

**Scope is the full first release.** Not prototype parity. Interests, consent,
family linking, community rules and the audit trail all shape the identity
tables, and retrofitting them would have meant migrating the data twice.

## What exists

**Database** — 19 ordered migrations, 32 tables, 1 view, 52 public RPCs,
42 internal helpers, 25 enums, 53 policies, 3 private storage buckets.

```
supabase/
  config.toml                       local stack + auth configuration
  migrations/                       19 files, applied in filename order
    …000100_bootstrap.sql           schemas, extensions, enums, settings
    …000200_identity.sql            accounts, roles, candidates, family links
    …000300_registration.sql        applications, certificates, duplicates
    …000400_biodata.sql             field catalogue, revisions, consent
    …000500_community.sql           community rules, family preferences
    …000600_interests.sql           interests, blocks, contact grants
    …000700_media.sql               photographs and janmakshar
    …000800_discovery.sql           saved profiles, protected share links
    …000900_notifications_audit.sql notifications, outbox, audit trail
    …001000_authz_helpers.sql       the app.* authorisation predicates
    …001100_matching.sql            discoverability, eligibility, directory
    …001200_rls.sql                 every policy and grant
    …001300_rpc_registration.sql    spec §3 and §4 transitions
    …001400_rpc_biodata.sql         spec §5 and §7 transitions
    …001500_rpc_matching.sql        spec §6, §8 and §9 entry points
    …001600_admin.sql               spec §10 queues and decisions
    …001700_storage.sql             buckets and storage policies
    …001750_function_grants.sql     revoke-then-grant on every function
    …001800_auth_hook.sql           roles into the JWT
  seed.sql                          six candidates, driven through the real RPCs
  tests/
    00_shim.sql                     local stand-in for Supabase's auth/storage
    01_assertions.sql               the spec §13 release criteria, as assertions
    verify.sh                       rebuild and run everything
```

**Application** — 19 routes, all server-rendered.

```
app/            one route per screen; see the route table below
components/app/ the shell and the client islands (forms, uploads, decisions)
lib/supabase/   env, server / browser / service-role clients, generated types
lib/data/       server-only data access layer, one module per domain
lib/data/guards.ts  the server-side equivalent of the prototype's guarded go()
app/actions/    thin Server Actions over the data access layer
proxy.ts        session refresh (Next.js 16's renamed Middleware)
scripts/        offline type generator
```

| Route | Who can open it |
|---|---|
| `/` | anyone; a signed-in account is redirected to the screen its state owns |
| `/sign-in`, `/sign-up` | signed out only |
| `/register` | no application, a draft, or a requested correction |
| `/review` | any applicant |
| `/home`, `/discover`, `/discover/[id]`, `/biodata`, `/interests`, `/family` | approved members |
| `/family/link` | any applicant — asking for access to an existing candidate |
| `/notifications`, `/support` | members; `/support` is reachable signed out too |
| `/s/[token]` | a protected share link: authenticated, approved and eligible |
| `/admin`, `/admin/registrations/[id]`, `/admin/publication`, `/admin/publication/[id]` | staff |

Guards redirect rather than error, so a member always lands on the screen their state owns.
They are a courtesy, not the boundary: the same requests are refused independently by row level
security and by the RPCs.

## What is verified, and how

`npm run db:check` rebuilds a throwaway PostgreSQL database from the migrations,
seeds it by calling the real RPCs, runs the assertion suite, regenerates the
TypeScript types from the live schema, and type-checks the app.

The assertions in `supabase/tests/01_assertions.sql` are the specification's
§13 release criteria written as executable checks — that a signed-out visitor
can read nothing, that a member cannot see another candidate's biodata or any
certificate, that a shared mosal excludes a pair while an *unconfirmed* mosal
only yields `insufficient_information`, that a parent cannot consent for their
child, that revoking a photo grant ends access, that a share link does not
bypass approval, that two admins cannot both decide the same application, and
that nobody can delete an audit row.

Deployed and verified against a live project on 14 September 2026:
`npm run db:verify:live` runs the same criteria over real HTTP, signing accounts
up through GoTrue and exercising Storage and PostgREST. 35 checks, all passing.
It found one defect the offline suite structurally could not — see
`docs/verification.md`.

Because no Docker daemon was available here, `tests/00_shim.sql` supplies the
parts of Supabase a plain PostgreSQL server lacks: the `auth` and `storage`
schemas, `auth.uid()`, and the `anon` / `authenticated` / `service_role` roles.
That is enough to exercise every policy, function and constraint. It is **not**
enough to exercise GoTrue, the Storage API or PostgREST — run `supabase start`
and `supabase db reset` for those, and see
[operations.md](operations.md#before-first-deployment) for what to check there.

## What is deliberately not done

* **No SMS, push or email provider.** `public.notification_outbox` queues
  messages and nothing drains it. A row there means *queued*, never *delivered*.
* **Pasted-biodata parsing lives outside the database.** `stage_imported_biodata`
  accepts already-extracted key/value pairs and marks every one unconfirmed.
  Parsing free text is an application concern; spec §12 requires the result to
  be treated as untrusted either way.
* **Three community rules ship disabled.** `paternal_surname` and
  `declared_relation` have no ratified comparison definition (spec §7), so they
  are recorded, visible to admins, and have no effect.
* **The custom access token hook is not enabled** on the deployed project.
  `app.has_role()` falls back to a table lookup, so authorisation is correct
  either way; enabling it removes one query per policy evaluation.
