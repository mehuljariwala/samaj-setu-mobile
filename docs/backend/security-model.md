# Security model

Spec §2: "Enforce permissions on the server for every record and media request,
not merely through navigation."

## Authentication

Phone plus password through Supabase Auth, with `enable_confirmations = false`
on the SMS provider. No SMS is sent and no provider is configured.

**The phone number is a self-declared identifier.** Nothing in this system
treats it as proof of anything. An admin corroborates it during certificate
review, and `accounts.phone_verified_at` stays null to record that no
verification challenge has taken place.

A password is required even though the number is unverified. Without a
credential, anyone who knew a family's mobile number could take their account,
and the number is on every biodata in circulation.

Two similarly-named fields mean different things and should not be conflated:

| Field | Meaning |
|---|---|
| `auth.users.phone_confirmed_at` | GoTrue's record that the phone identity is usable for sign-in. Set by the seed so local sign-in works. |
| `public.accounts.phone_verified_at` | This product's record that the number passed an OTP challenge. Always null in this release. |

Sign-in returns the same message for an unknown number and a wrong password, so
the form cannot be used to enumerate which numbers are registered.

### Roles

`public.account_roles` is a separate table from `public.accounts`, with no write
policy for any authenticated role. Granting goes through `public.grant_role()`,
which requires `superadmin` and refuses a self-grant outright. Spec §2: a member
cannot grant themselves admin.

`moderator` sees the queues and can request corrections. `admin` can also
approve and reject. `superadmin` can additionally change roles, community rules
and settings.

The custom access token hook copies roles into the JWT as `app_roles` so
`app.has_role()` can answer without a query. It is an optimisation:
`app.has_role()` falls back to the table whenever the claim is absent, so the
schema is correct with the hook off. The usual trade applies — a role granted
mid-session takes effect on the next token refresh.

## Row level security

RLS is enabled on all 32 tables. `anon` is granted nothing, anywhere: there is
no anonymous read path in this schema at all, and an assertion checks it.

Supabase grants `ALL` on new public tables to `anon` and `authenticated` by
default, so the RLS migration revokes everything first and hands privileges back
one table at a time. Default privileges are revoked too, so a table added later
starts closed rather than open.

The same treatment is applied to functions. PostgreSQL grants `EXECUTE` on a new
function to `PUBLIC`, which through PostgREST makes every RPC reachable by a
signed-out visitor. Each function does check its caller — but relying on that
alone means one forgotten check is a public endpoint, so
`20260914001750_function_grants.sql` revokes from `PUBLIC` and `anon` and grants
to `authenticated` explicitly.

### Column-level grants

Two places where row-level is not granular enough:

* `review_decisions` — `authenticated` has `SELECT` on a named column list that
  omits `internal_note` and `actor_account_id`. Spec §10 requires internal notes
  to stay separate from applicant messages; a `select *` fails rather than
  leaking one.
* `candidates` and `accounts` — `UPDATE` is granted on specific columns only.
  A member can pause their profile or change their display name; they cannot
  set `identity_status = 'verified'` or lift their own suspension.
* `candidate_media` — `UPDATE` on `is_primary`, `sort_order` and `deleted_at`,
  but not `status`. Reordering your own photographs must not let you approve
  one.

### Recursion

The `app.*` predicates are `SECURITY DEFINER` with `search_path = ''`. This is
not decoration: a policy on `candidate_memberships` that queried
`candidate_memberships` through the caller's own privileges would recurse
forever. Running as the definer reads the table without re-entering RLS, which
is what makes the policies expressible.

They live in schema `app`, which is absent from `db.schemas` in
`config.toml`. PostgREST will not expose it, so a client cannot call
`app.operates_candidate(<guess>)` to probe for records it cannot read.

Policies wrap each predicate in `(select …)` so PostgreSQL evaluates it once per
statement as an InitPlan rather than once per row.

## Storage

Three buckets, all private. Nothing has a public URL — a public URL is a
permanent grant to whoever the link is forwarded to.

| Bucket | Insert | Read |
|---|---|---|
| `certificates` | the candidate's operators | **staff only** |
| `candidate-photos` | the candidate's operators | `app.can_view_media_of(…, 'photo')` |
| `kundali` | the candidate's operators | `app.can_view_media_of(…, 'kundali')` |

Objects are stored at `<candidate_id>/<random>.<ext>`, so a policy can answer
"whose file is this?" from the path. Both the storage policy and the recording
RPC check the prefix.

Spec §8 says birth certificates are never member-visible, and that is taken
literally: there is no `SELECT` policy for members on `certificates` or on
`public.application_documents`, not even for the row proving their own upload
succeeded. The client learns the upload worked from the RPC's return value.
The registration screen shows `has_certificate` from `my_context()`.

The photo policy calls the same `app.can_view_media_of()` that the
`candidate_media` policy calls, so the storage layer and the request layer
cannot drift apart. Spec §8: "do not send full images to unauthorized clients
and merely blur them."

Files are served through signed URLs valid for 60 seconds (120 for a
certificate), minted by the service-role client **after** the database has
already authorised the caller. The service role is never used to decide whether
signing is allowed — if a read needs it to succeed, the policy is wrong.

## Consent

Spec §4: "The candidate controls publication consent. A parent cannot supply
that consent on the candidate's behalf."

`public.grant_publication_consent()` requires `app.is_candidate_self()`, and a
`BEFORE INSERT` trigger on `candidate_consents` independently refuses any
grantor without a `role = 'candidate'` membership. The trigger is the boundary;
the RPC check exists to produce a readable error. Both are asserted.

Withdrawal is deliberately wider: any operator may withdraw. The asymmetry is
intentional — the risk of a wrongly published profile outweighs the
inconvenience of a wrongly withdrawn one.

The consent ledger is append-only. Withdrawal sets `withdrawn_at` on the active
row; nothing is deleted, because "was consent active when we published?" has to
stay answerable afterwards.

Where a candidate cannot complete the normal consent process, publication stays
blocked. Spec §4 requires an explicit assisted-verification process before that
changes, and none is defined, so there is no code path that substitutes one.

## Contact details and photographs

Separate grants, separate tables, separate revocation — spec §8.

Accepting an interest creates a `contact_grants` row. Reading
`candidate_contacts` requires that grant **and** the owner's
`reveal_contact_on_accept` privacy flag, so a candidate who accepts an interest
but withholds their number is respected. Both halves are asserted.

Photo access is viewer-specific: a `media_grants` row naming one viewer
candidate and one media kind. A photo grant does not imply a janmakshar grant.
A candidate who sets `photo_visibility = 'members'` widens the default for
approved members; that is handled on a separate branch of
`app.can_view_media_of()` so that widening a default is never mistaken for
having granted a named viewer access.

**Revocation prevents future access and cannot recall what was already seen.**
That is stated in the table comment, in the function comment and in the action
comment, so that nobody writes UI copy promising otherwise. There is no
screenshot prevention and none is implied.

## Sharing

Spec §9. A share link is a pointer, not a capability.

The token is generated as 24 random bytes and returned exactly once. Only its
SHA-256 is stored, for the same reason a password is hashed: a database
disclosure must not yield working links. An assertion checks that the plaintext
token is not in the table.

Resolving one requires an authenticated, approved, eligible member, and then
returns the same payload as any other profile view — `resolve_share_link()`
literally calls `get_candidate_profile()`. Every refusal is recorded in
`share_link_uses` with its reason, because a link being tried by unapproved
accounts is the signal that it has been forwarded.

Nothing about the candidate appears in the link or its preview. The card the
member shares is generic and branded; there is no contact-free downloadable
biodata card, which the specification's conversation replaced with this.

## Notifications

Spec §12: notifications must not leak personal details and must not become the
source of truth for approval state.

`public.notifications.payload` carries identifiers and codes only. A `CHECK`
constraint rejects a payload containing `name`, `full_name`, `phone`, `email`,
`photo_url`, `certificate`, `biodata` and similar keys — it is a blunt
instrument, but it turns an agreement into something the database enforces, and
there is an assertion for it. The client fetches the real record, which re-runs
every authorisation check.

## What is not protected

Stated plainly so nobody assumes otherwise:

* **Screenshots.** A member who can see a photograph can keep it. Revocation is
  forward-looking only.
* **The application UI is not a security boundary.** `proxy.ts` refreshes the
  session and makes no authorisation decision. Server Actions are reachable by
  direct POST, so every one of them re-verifies through the data access layer
  and the database.
* **Rate limiting.** Supabase Auth rate-limits sign-in attempts; the RPCs do
  not. Enumeration through `request_candidate_access` is mitigated by returning
  an identical error for an unknown code and an unavailable candidate, but a
  determined attacker with valid `SS-####` codes is not throttled. Worth adding
  before launch.
* **The `app` schema depends on PostgREST configuration.** Its helpers are safe
  to call, but exposing the schema in `db.schemas` would let a client probe for
  the existence of records. Do not add it.
* **Certificate retention.** Nothing deletes a certificate. Spec §14 leaves the
  policy unsettled; `application_documents.retention_delete_after` exists,
  nothing sets it, and no job reads it.
