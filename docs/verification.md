# Prototype verification — 8 September 2026

- TypeScript check completed without errors.
- Production build completed successfully.
- Local root responded with HTTP 200.
- Following the user's report of unresponsive controls, verified the actual in-app browser: Welcome → registration → sample phone → sample OTP → identity details → sample certificate → pending review.
- Verified preview screen selector and member Home → Discover navigation.
- Verified saving a profile updates Saved to show the selected card.
- Verified admin correction action requires a reason, updates queue counts, and displays the reason and correction action on the applicant screen.
- This is a design prototype: state exists only during the page session. Real auth, document storage, community-rule evaluation, biodata extraction, consent and notification delivery are not implemented.
- Presentation/navigation prototype only; no WebMCP tools exposed.

## Guided biodata update

- Replaced the paste-only sheet with 13 short steps and five chapter markers.
- Added structured personal, community, mosal, education, occupation, family, lifestyle, birth, declared astrology, sample media, private contact, and editable summary fields.
- Drafts now persist locally for 30 days, scoped to the candidate's stable birth date and phone. No remote upload is performed.
- Eight focused validation checks passed: unknown birth time, invalid time, valid time, invalid/valid contact, height bounds, blank mosal, and empty completion count.
- TypeScript and production build passed.
- Candidate consent remains a separate pending action; finishing a draft does not publish or record candidate consent.

## Motion update

- Added short page entrances, staggered cards, selection feedback, status confirmation, and tactile button states.
- Biodata heading and form remount per step to replay entrance motion without losing controlled field values.
- No continuously looping decoration or action delays.
- Reduced-motion mode disables animation/transition and uses instant programmatic step scrolling.
- TypeScript and production build passed. Runtime animation timing was not browser-tested in this update.

## SVG cues and microinteractions

- Added consistent Lucide SVG field icons and chapter icons with text labels.
- Added filled-field feedback and live centimetre-to-feet/inches height conversion.
- Added accessible expandable explanations for contact, birth time, and media privacy using the installed accordion primitive.
- Saving or removing a profile now displays explicit feedback; saved cards include a text badge.
- New motion remains opt-in to no-preference mode; reduced-motion behavior is preserved.
- TypeScript and production build passed.

## Compact single-page form

- Replaced the 13-step biodata modal with an inline app page.
- Six expandable sections, one open at a time, with compact two-column fields and optional details hidden until requested.
- Retains existing local draft keys and values; all-field validation and separate publication consent remain in place.
- Review and completion render in the same page. Save/Review remain available in a bottom action bar.
- Browser verified: Home opens the inline form; existing local draft is restored; expanding Community collapses Personal without losing values. Inspected mobile rendering.
- TypeScript and production build passed.

## App-shell redesign, OTP removal and defect fixes — 10 September 2026

> Sections above are an append-only log and describe superseded builds. The 13-step wizard
> (noted under "Guided biodata update") no longer exists; nor does the OTP step referenced on
> line 6. This section describes the current build.

### Removed OTP verification

- Deleted the OTP step, its state, the hard-coded `otp !== '123456'` check, and the
  `InputOTP` import. Identity now rests solely on admin review of the birth certificate,
  which was already the product's real safeguard.
- Registration went from three steps to **two grouped steps**: *About you* (relationship,
  mobile, candidate name) and *Identity* (birth date, city, father's name, certificate).
- The applicant timeline lost its now-meaningless "Phone verified" row.

### App shell

- Replaced the desktop "studio rail + phone mockup" with a real app shell: fixed top bar,
  a single scrolling surface, fixed bottom tab bar, safe-area insets, and `viewport-fit=cover`.
- Discover filters moved out of a hidden sheet onto the surface as a scrollable chip rail.
- `app/globals.css` rewritten around one token block. Removed the two competing `:root`
  blocks, the duplicate `body` rules, and ~28 orphaned `.bio-*` selector families left behind
  by the earlier wizard removal. `--gold` now holds a gold value rather than a blue one.
- Focus rings are deliberately **not** the brand colour: the brand is a crimson, and a crimson
  focus ring on an input was indistinguishable from the error state.

### Defects fixed

| Defect | Fix |
| --- | --- |
| Save button only set a message; the write had already happened in an effect | `Save` performs the write and reports its actual result |
| No way to delete a draft (`removeItem` appeared nowhere) | Added **Clear this draft from my device** |
| Back arrow called `onDone`, firing the "draft saved" success toast | Split into `onExit` (navigate, no toast) and `onDone` (explicit finish) |
| Section badge validated only required steps, so a bad optional value passed the badge but failed submit | `groupErrors` validates every key the section shows |
| Review summary showed a stale employer after switching to "Student" | `work` → student/not-working clears `role`/`employer` at the source |
| A tick was shown beside "Details needed" | Replaced with a count of outstanding fields |
| Selects could never be cleared once set | Optional selects offer "— Not specified —" |
| `approve()` never cleared `reason`, so an approved application still showed the old rejection text | `approve()` clears it |
| Rejected applications vanished from the admin console (all three counters read 0) | Four counters incl. Rejected; **All registrations** always shows the record |
| Hard-coded "Surti" tag, wrong for the Ahmedabad profile | `community` is per-profile data |
| Caption remapped `biodata` → `home`, displaying "04 / 06 MEMBER HOME" on the biodata screen | Caption removed with the studio frame |
| Unused `MapPin`, `ClipboardPaste`, `LogOut` imports | Removed |
| Certificate "upload" was a boolean toggle; no file input existed anywhere | Real `<input type="file">` showing the chosen filename (still nothing uploaded) |
| `maxLength` applied to `number`/`time` inputs, where browsers ignore it | Applied only where it works; phone fields use `type="tel"` |
| Errors not linked to inputs; asterisk not hidden from screen readers | `aria-describedby`, `aria-required`, `aria-hidden` on the marker |
| `Edit <section>` aria-label hard-coded in English | Runs through `t()` |
| Dead `Step.hintGu/hintEn/chapter/optional` and three empty steps in `model.ts` | Removed; `Field.hint` is now actually rendered |
| Draft I/O and `Date.now()` sat inside render/effects | Moved to module scope; persistence happens in the handler that caused the change |

### Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds.
- `oxlint` — one first-party advisory remains (`react-compiler/EffectSetState` on the
  localStorage read in `guided-form.tsx`). Reading a draft on mount is what a mount effect is
  for; the write path was moved out of effects entirely.
- Browser-driven (headless Chromium, 412×880 and 1280×900), console clean, no hydration
  warnings. Each row of the table above was asserted at runtime, including: employer cleared
  from localStorage on switching to Student; `Save` rewriting a deliberately clobbered key;
  clear-draft removing the key; back arrow producing no toast; a rejected application still
  reachable under All registrations; and approve clearing a prior rejection reason.

## Access-state enforcement — 10 September 2026

The spec defines seven access states (spec:19-27) but the prototype enforced none of them:
navigation was the only gate. Access is now a single derived value with one permission
table, and every in-app navigation is routed through a guard.

### The matrix

`access` = `submitted ? review : 'none'`. `SCREEN_ALLOWS` in `app/page.tsx` declares which
access states may render each screen; `go()` redirects to `fallbackScreen(access)` with an
explanation when they do not match.

| Screen | none | pending | correction | approved | rejected |
| --- | --- | --- | --- | --- | --- |
| Welcome | fresh CTA | status card | status card | status card | status card |
| Registration | open | locked | open (step 2) | locked | locked |
| Under review | — | open | open | open | open |
| Home / Discover / Biodata | — | — | — | open | — |
| Admin | always (separate role) | | | | |

### What this fixed

- **Re-registration.** A submitted application is persisted to localStorage, so it survives a
  reload. Welcome shows the application instead of inviting a second one; the form itself
  renders a locked waiting panel if reached by any other route. One candidate, one application.
- **Phantom applicant.** The admin dashboard counted `review === 'pending' ? 1 : 0`, and
  `review` defaults to `'pending'`, so it reported **1 Pending** when nobody had ever
  registered. Counters now key off `access`, and an empty queue distinguishes "no
  registrations yet" from "all caught up".
- **Member screens without an approval.** Home, Discover and Biodata now require `approved`.
  Five `go('biodata')` deep links were previously unguarded.
- **Under review with no application** showed a pending state for a record that did not exist.
- **Biodata progress lost on reload.** Home showed 0% next to an intact 30-day draft;
  `storedCompletion()` now derives it from the stored draft.
- **Orphaned drafts.** A draft is keyed on the verified birth date and phone, so a correction
  that changed either silently stranded it. `moveDraft()` migrates it on resubmit.
- **Changing verified details while approved** called `go('register')`, which the matrix
  correctly refuses. Identity is the basis of the approval, so this now returns the account to
  the correction state — the one state that legitimately reopens the form.
- **Re-applying a decision already in force.** The admin detail view offered "Approve" on an
  approved application. The action matching the current decision is disabled and the panel
  reads "Change the decision".
- **Delayed review.** Past the 24-hour target the status page shows the honest delayed state
  spec:43 asks for, instead of repeating "allow up to 24 hours". Elapsed time is computed from
  the real submission timestamp; the admin queue no longer hard-codes "2 hours ago".
- **Language choice** now survives a reload.

### Preview navigation

The Screens jumper grants whatever state a screen needs before opening it (`previewGo`), so
preview navigation cannot produce an impossible combination either — there is still exactly one
source of truth. Opening a member screen from a fresh state marks the account approved and says
so in a toast.

### Verification

Browser-driven (headless Chromium). Every cell of the matrix above was asserted by forcing each
of the five access states into localStorage, reloading, and checking where the app lands and
what Welcome, Registration and Admin render. Also asserted: draft-key migration across a
birth-date correction, biodata percentage restored after reload, the disabled admin action, the
full approved → identity change → correction → resubmit → pending loop, and language
persistence. Console clean throughout; `tsc --noEmit` and `npm run build` pass.

The matrix run caught one regression during development: `go('review')` immediately after
`setSubmitted(true)` still saw the previous `access` in its closure and bounced to Welcome.
`go()` now takes an optional access override for handlers that navigate as the state they are
creating.

## Ported to Next.js and deployed to Vercel — 10 September 2026

The prototype was scaffolded by OpenAI Sites and built with `vinext` (Next.js-on-Vite) targeting
a Cloudflare Worker. That cannot deploy to Vercel: `next` was never installed — `vinext` only
shims it — and the build emits `dist/server/index.js` + `wrangler.json`, with no `index.html`,
so a static deploy of `dist/client` was not possible either.

### The port

- Installed `next@16.3.4` (supports React 19, already at 19.2.6).
- Removed `vinext`, `wrangler`, `@cloudflare/vite-plugin`, `@cloudflare/workers-types`,
  `@openai/sites-vite-plugin`, `@vitejs/plugin-react`, `@vitejs/plugin-rsc`, `vite` and
  `react-server-dom-webpack`. Deleted `vite.config.ts`, `dist/`, `.wrangler/`, `.vinext/`.
- Added `postcss.config.mjs` for Tailwind v4, which Vite had been providing.
- Scripts are now `next dev -H 0.0.0.0` / `next build` / `next start`, plus `typecheck`.
- `tsconfig.json` dropped the `@cloudflare/workers-types` and `vinext/types` ambient types.
- Package renamed from the scaffold's `sites-project` to `samaj-setu-prototype`.

**No application code changed in the port** — only the build toolchain. `app/`,
`components/` and the styles are untouched by it.

### SSR regression found and fixed

The Welcome screen had been gated on a `restored` flag to stop a returning visitor seeing it
flash before their status screen. Under Next that made the statically prerendered HTML almost
empty (7.7 KB, no content), wasting the edge-cached prerender. Welcome now renders during SSR,
and an inline boot script in `app/layout.tsx` marks the document `data-booting` when a stored
application exists so the prerendered Welcome is hidden until `page.tsx` picks the real screen.
Served HTML went from 7.7 KB of shell to 12 KB of real content, still `○ (Static)`.

### Verification

The full suite was re-run against the Next production build (`next start`): all 25 cells of the
access matrix, every edge case, and the identity-change loop behave identically to the Cloudflare
build. `tsc --noEmit` clean, `next build` succeeds, console clean.

The live deployment was then driven in a headless iPhone viewport (390×844, 3× DPR, iOS user
agent): loads and hydrates, language toggle works, registration submits, and the
waiting-for-approval state survives a reload. No console errors.

## Fitting the fixed-height screens on a phone — 10 September 2026

Reported symptom: too much scrolling on a real device. Measured before changing anything, at
iOS Safari's *visible* heights (which are well under the device height once the address bar is
counted — an iPhone 15 gives ~664px, an SE ~553px), rather than the nominal device size.

Overflow before, in px, on an iPhone 15: Welcome +159, Registration +202, Review +110,
Home +244, Admin +177, Discover +648, Biodata +404.

**Discover and Biodata were left alone.** They are a profile list and a 25-field form; they are
supposed to scroll, and squeezing them would only make them worse.

### What changed

1. **Type and rhythm tightened in place** (56 edits) rather than layering a second scale over
   the first — the stylesheet keeps one source of truth. Headings dropped 2–5px, body copy
   ~1px, and most of the win came from vertical padding and margins rather than font size.
2. **The managing-profile band was merged into the top bar.** It had been a separate ~48px
   row under the header, and together with the tab bar it left Home and Discover only 482px of
   the 664. Delivery apps put the address selector *in* the header; this now does the same.
   That single structural change bought more than every font reduction combined.
3. **Two height-based density tiers** — `max-height: 720px` tightens spacing further, and
   `max-height: 610px` (iPhone SE class) additionally drops supporting copy: hero subtitle,
   step descriptions, tile captions, the page-title paragraph. Every control and every field
   label stays, and touch targets stay at or above 44px throughout.

### Result

| Screen | iPhone 15 before | after | iPhone SE before | after |
| --- | --- | --- | --- | --- |
| Welcome | +159 | fits | +270 | +9 |
| Registration | +202 | +1 | +337 | +73 |
| Review | +110 | fits | +221 | +33 |
| Home | +244 | fits | +355 | +17 |
| Admin | +177 | +4 | +288 | +47 |

iPhone 15 and larger now fit every fixed-height screen. An iPhone SE still scrolls a little on
the registration form and the admin console; those genuinely hold more content, and compressing
them further would have cost legibility.

### Two defects found while doing this

- The dark badge overlapping the Home tab was `NEXTJS-PORTAL`, Next's dev-tools indicator, not
  app layout. Next 16 removed the flags that disabled it, so `next.config.ts` now sets
  `devIndicators.position: 'bottom-right'`. It does not exist in a production build.
- The boot script added in the Vercel port sets `data-booting` on `<html>` before React
  hydrates, which produced a hydration mismatch warning. `<html>` now carries
  `suppressHydrationWarning` — the divergence is deliberate and scoped to that element's
  attributes.

### Verification

Measured across four viewports (375×553, 375×629, 393×664, 430×745) before and after. The full
behavioural suite — access matrix, edge cases, identity-change loop — re-run with a clean
console. Redeployed and re-measured against the live URL: on iPhone 15, Welcome, Review and Home
report FITS, Registration +1 and Admin +4; console clean.

## Supabase backend — 14 September 2026

The first-release backend from the product specification, built and verified. Design notes are
in `docs/backend/`.

### What was built

19 migrations: 32 tables, 1 view, 52 public RPCs, 42 internal helpers, 25 enums, 53 policies,
3 private storage buckets. Plus typed clients, a server-only data access layer, Server Actions,
and `proxy.ts` for session refresh.

### How it was verified

No Docker daemon was available, so `supabase start` could not run. Instead
`supabase/tests/verify.sh` rebuilds a throwaway PostgreSQL 17 database, applies
`tests/00_shim.sql` to stand in for the parts of Supabase a plain server lacks (the `auth` and
`storage` schemas, `auth.uid()`, the `anon` / `authenticated` / `service_role` roles), then
applies every migration in order, seeds, and runs the assertion suite.

`seed.sql` does not insert rows behind the state machine — it signs in as each seeded account
and calls the real RPCs, so registering, submitting, approving, completing biodata, consenting,
sending an interest and accepting it are all exercised on every run. Six candidates result: four
published, one awaiting review, one with a correction requested.

`supabase/tests/01_assertions.sql` turns the specification's §13 release criteria into
executable checks. All pass:

- A signed-out visitor has no privilege on `candidates`, `candidate_contacts`,
  `directory_profiles` or `discover()`.
- An unapproved applicant resolves to `awaiting_review` and cannot query the directory.
- An approved member reading `candidates` directly through RLS sees only their own, cannot read
  another candidate's biodata revision, cannot read any certificate row including their own, and
  cannot select `review_decisions.internal_note`.
- A member cannot insert their own admin role, call `grant_role`, or set `identity_status`.
- A shared mosal excludes a pair; an *unconfirmed* mosal yields `insufficient_information` and
  never `eligible`; an interest cannot be sent on either.
- A duplicate interest is refused, the sender cannot accept their own, contact details appear
  only behind an accepted interest, and a candidate who withholds contact is respected despite
  the grant.
- A pending photo request grants nothing; an approved one grants photos but not janmakshar;
  revoking ends access.
- A parent cannot consent for their child, by RPC or by direct insert. Withdrawing consent or
  pausing removes the profile from the directory in the same transaction.
- An identity change hides a published profile and re-approval restores it.
- A decision against a stale expected status is refused. An unresolved duplicate blocks approval.
  A moderator cannot approve. A superadmin cannot change their own roles.
- A notification carrying a name is rejected by the payload constraint.
- The share token is not stored, only its hash; the link does not bypass approval.
- Audit rows cannot be deleted, even by an admin.

`npm run db:check` runs all of that, regenerates `lib/supabase/database.types.ts` from the live
schema, and type-checks. TypeScript, oxlint (on the new code) and the production build all pass;
`next build` reports the proxy registered.

### Two gaps found while doing this

- The biodata form collects the contact number as a field, so it lived only inside the revision
  payload and `candidate_contacts` was never populated — an accepted interest revealed nothing.
  Approving a revision now syncs the contact person and numbers into their own table, which is
  also what keeps them out of `directory_profiles`.
- `candidate_community.source` and `biodata_revisions.source` use different vocabularies
  ("where the value came from" versus "which editor produced it"). Passing one through to the
  other violated a check constraint on any pasted import; they are mapped explicitly now.

### Not covered by this verification

The harness cannot reach GoTrue, the Storage API or PostgREST. Sign-up, file upload, signed-URL
expiry and direct PostgREST requests need a real stack; `docs/backend/operations.md` carries a
checklist for that. The prototype screens are also still on local state — the backend is not yet
wired to the UI.

## Screens wired to the backend — 14 September 2026

The prototype's single 1292-line client component was replaced with 19 server-rendered routes
reading from `lib/data/` and writing through Server Actions. `app/globals.css` was reused as-is;
the only addition is a small block for real photographs, which the prototype never had.

### What changed in substance, not just plumbing

- **Language moved from localStorage to a cookie.** The server now knows it before rendering, so
  `app/layout.tsx` no longer needs the boot script, the `data-booting` flag, or the
  `suppressHydrationWarning` that went with them. The whole class of "client knows something the
  server did not" is gone. For a signed-in member the choice is mirrored to
  `accounts.preferred_language`, so it follows them to a new device.
- **The biodata draft moved from localStorage to `biodata_revisions`.** A draft is now the same
  draft on every device and is visible to the admin queue. `moveDraft`, `draftKey` and the
  30-day expiry are deleted along with the problem they solved.
- **Certificates and photographs are real uploads.** Both go straight from the browser to a
  private bucket, then a second call records the row — so an interrupted transfer leaves no row
  and nothing looks finished that is not. Images are rendered from 60-second signed URLs with a
  plain `<img>`; `next/image` would cache an optimised copy at a stable unsigned address that
  outlives the grant.
- **Guarded navigation moved to the server.** `lib/data/guards.ts` is the equivalent of the
  prototype's `SCREEN_ALLOWS` table, but a redirect now happens before any data is fetched, and
  it is backed by RLS rather than being the only check.
- **The prototype's screen-jumper and "reset this preview" affordances are gone.** They existed
  to fake state transitions; the transitions are real now.

### Two things the prototype implied that the wiring had to correct

- The certificate upload box said "nothing is uploaded in this preview". It now uploads, and the
  copy says the opposite of what a member might assume: **you will not be able to view it again
  either.** There is no member-facing read path for `application_documents` or the
  `certificates` bucket, by design (spec §8).
- `birthUnknown`, `photo`, `kundali` and `kundaliVisibility` were keys the form wrote into the
  biodata blob. `public.biodata_fields` does not know them and `save_biodata_draft` rejects an
  unknown key outright, so photographs and janmakshar became real uploads and `persistable()`
  now strips anything the catalogue does not recognise before every write. Birth time is
  optional in the database, so the client no longer demands it either — the two were disagreeing.

### Verification

`npm run db:check` and `npm run build` both pass; oxlint is clean across `app/`,
`components/app/`, `components/biodata/`, `lib/`, `proxy.ts` and `scripts/` (the remaining
findings are all in the unpruned `components/ui/` starter files, unchanged from before).

Two lint suppressions were added, each with its reason in the code: the `<img>` rule, for the
signed-URL caching problem above, and `typescript/no-deprecated` on `createBrowserClient`, whose
deprecation applies to an overload this code does not use.

Started the dev server with no Supabase configured and confirmed the failure is a clear,
actionable message — "Copy .env.example to .env.local and set …" — rather than a blank page.

**Not verified:** no screen has been exercised against a live Supabase instance. There is no
Docker daemon here and no project is linked, so sign-up, file upload, signed-URL expiry and
PostgREST over HTTP remain untested. The checklist for that is in
`docs/backend/operations.md`.

## Deployed to a live Supabase project — 14 September 2026

Project `fpdzrogmnnvibqsimlxp`. This closes the gap every previous entry named: GoTrue,
Storage and PostgREST have now actually served requests from this code.

### What the project already contained

It was not empty. `public` held **44 tables**: ours, plus 23 belonging to a different and
fairly complete earlier build of the same product — `profiles`, `profile_astro`,
`profile_contacts`, `profile_family`, `profile_managers`, `profile_photos`,
`profile_preferences`, `profile_reviews`, `profile_views`, `interests`, `shortlists`,
`photo_requests`, `photo_access_grants`, `match_scores`, `communities`, `taxonomy_terms`,
`nakshatras`, `rashis`, `consents`, `reports`, `import_jobs`, `audit_log`, `app_users` — with
96 rows in them, including 8 sample profiles and reference data.

Three collisions, found before anything was damaged:

- `interests` existed with a different shape (`from_profile_id` / `message_gu` against our
  `from_candidate_id` / `pair_low` / `pair_high`). This is what halted the push.
- Both builds used an `app` schema, and both installed a trigger on `auth.users`. Two
  triggers were firing on every sign-up.
- Migration `001200_rls.sql` runs `revoke all on all tables in schema public`. It is
  sequenced *after* the migration that failed, so it never ran — one step further and it
  would have silently revoked the older build's 55 grants.

Migrations `000100`–`000500` had already applied over the top before the collision stopped
things. On the decision to replace the older build, the public schema was dumped to
`.backups/pre-existing-build-*.sql` (144 KB, all 44 tables with data), then both schemas were
dropped, `public` recreated without Supabase's permissive default privileges, the migration
history cleared, and all 19 migrations applied from clean.

### A real defect the offline suite could not have found

**A candidate could not be deleted at all.** `app.audit_change()` is an AFTER DELETE trigger,
and `audit_events.candidate_id` was a foreign key to `candidates` — so by the time the trigger
wrote its row the candidate was gone and the insert was rejected, taking the delete with it.
The same flaw sat in `review_decisions`, where `on delete set null` would have blanked the
candidate off every decision already recorded about them, destroying the history spec §10
requires be kept.

Migration `20260914001900_audit_outlives_subjects.sql` drops those foreign keys. The columns
remain as plain uuids: referential integrity is the wrong tool for a log whose purpose is to
record things that no longer exist. A regression assertion now creates a candidate, deletes it,
and checks both that the delete succeeds and that the audit rows naming it survive — confirmed
on the live project, where 12 rows outlived their subject.

The offline suite never caught this because nothing in it had ever deleted a candidate.

### Verified on the live project

`npm run db:verify:live` — **35 checks, all passing**. It signs real accounts up through
GoTrue and exercises PostgREST and Storage directly:

- Signed out: nothing readable from `candidates`, `candidate_contacts`, `directory_profiles`,
  `biodata_revisions`, `application_documents`, or `discover()`.
- The `auth.users` trigger creates an `accounts` row; a new account reports `no_application`
  and `phone_verified: false`.
- `start_registration` returns a duplicate **count**, never a list (spec §4).
- Submission is refused until a certificate exists, then sets a 24-hour target.
- A certificate uploads to the private bucket and **the uploader cannot read it back, nor
  mint a signed URL for it** — while `my_context()` still reports `has_certificate: true`.
- Uploading into another candidate's folder is refused.
- A second member sees none of the first's candidates; `directory_profiles` and
  `application_documents` are refused to authenticated members; `internal_note` fails at the
  column level; self-granting admin fails by table and by RPC; a member cannot set
  `identity_status`; `discover()` and `admin_dashboard` refuse the wrong caller.
- An unverified candidate cannot browse or save biodata.

Schema on the remote matches the locally verified one exactly: 32 tables, 1 view, 53 policies,
52 public functions, 42 `app` functions, 25 enums, 3 buckets (**all private**), RLS enabled on
every table, 25 biodata fields, 4 community rules enabled and 2 correctly disabled pending
ratification.

The application itself was then run against the project: the welcome screen renders in
Gujarati, and all seven gated routes return 307 to `/sign-in` for a signed-out visitor while
`/`, `/sign-in`, `/sign-up` and `/support` return 200.

### Two operational notes

- Auth required **both** switches: Phone provider enabled *and* phone confirmations disabled.
  With the provider off, the Admin API can still create a phone user but sign-in is refused,
  so there is no way to obtain a member token — the provider has to be on.
- GoTrue stores phone numbers without the leading `+`, and `storage.objects` has a trigger
  refusing direct SQL deletes. Both were learned by getting them wrong; the cleanup hint in
  `verify-live.mjs` now says so.

### Still outstanding

- The custom access token hook is not enabled on the project. `app.has_role()` falls back to
  a table lookup, so authorisation is correct without it; enabling it only removes a query per
  policy evaluation.
- Twelve `audit_events` rows from the verification runs remain. They are harmless test history
  and were deliberately not deleted — quietly truncating an append-only log would undo the
  property this session just fixed.

## End-to-end journey and Vercel deployment — 14 September 2026

Deployed to **https://samaj-setu-prototype.vercel.app** against project
`fpdzrogmnnvibqsimlxp`. Vercel had no environment variables at all, so the first deploy would
have returned 500 on every page; `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` were added to production,
preview and development, the secret key stored encrypted.

The live database had no admin — cleanup had removed every user — so nobody could have
approved a single registration. A superadmin was created before deploying.

### Production checks

All four public routes return 200. All eight gated routes return 307 to `/sign-in` for a
signed-out visitor. The welcome screen renders in Gujarati by default and in English with the
language cookie set, both server-rendered. Responses carry `noindex, nofollow` and
`cache-control: private, no-cache, no-store` (spec §9).

### The full journey — `npm run db:verify:live` plus `journey-live.mjs`

35 boundary checks and 24 journey checks, all passing. The journey walks three candidates from
sign-up through admin verification, biodata, approval, consent and publication; then discovery,
an introduction, acceptance, and contact reveal. It cleans up after itself.

Notable behaviours confirmed on real infrastructure: a guardian is refused publication consent
for their child; Arjun finds Priya but not Meera, who shares his mosal, and the exclusion is
named rather than silent; a duplicate introduction and one to an excluded candidate are both
refused; contact details appear only after acceptance and are hidden again when the candidate
withholds them; pausing and withdrawing consent remove a profile from the directory in the same
transaction; and a share link refuses an ineligible viewer while working for an eligible one.

### Two more defects, both found only because the journey deleted things

**An account that had ever consented could not be deleted.**
`candidate_consents.granted_by_account_id` was `on delete restrict` — three of four test
accounts survived cleanup. Spec §6 puts deletion controls on the Family screen, so this was a
real block. Migration `002000` drops the constraint on the same reasoning as `001900`: a ledger
recording what happened must outlive the account, and `app.enforce_consent_is_self()` still
validates the grantor at insert time, which is where it belongs. It also adds a trigger that
withdraws consent when the last operator leaves, so a profile nobody can operate cannot linger
in the directory.

**That trigger was itself half-written.** It set `withdrawn_at` without
`withdrawn_by_account_id`, tripping `consents_withdrawal_is_complete` and failing *every*
account deletion — the opposite of what `002000` set out to allow. Migration `002100` records
the departing account as the withdrawer, which is accurate: their leaving is what ended the
consent.

Both are now covered by local assertions that create an account, consent, delete it, and check
that the deletion succeeds, that consent is withdrawn, that the profile is no longer visible,
and that the ledger still records who consented. The offline suite had never deleted an
account, which is precisely why it never saw either defect.

### Known gaps

- `git push` is blocked: this machine is authenticated as `mehulj1_KVUE` and
  `mehuljariwala-sephora`, neither of which can write to `mehuljariwala/samaj-setu-mobile`.
  Commits are local only.
- The custom access token hook is still not enabled; `app.has_role()` falls back to a table
  lookup, so authorisation is correct without it.
- `verify-live.mjs` leaves its two test accounts behind and prints the cleanup SQL;
  `journey-live.mjs` removes its own.

## Camera capture and the community admin — 14 September 2026

### Camera capture

`components/app/document-capture.tsx` adds an in-app camera for the certificate, photographs
and janmakshar, alongside the existing file picker rather than replacing it — a PDF from a
municipal portal is as common as a photo.

`<input capture>` would have been a fraction of the code, but it hands off to the OS camera
app, which saves the shot to the phone's gallery and offers no retake without leaving the form.
For a birth certificate that matters: `getUserMedia` → canvas → JPEG keeps the image off the
gallery entirely, and it goes straight to the private bucket.

Handled explicitly because each needs a different next step: permission denied (points at the
address-bar lock icon), no camera present, camera already in use by another app, and no
`getUserMedia` at all. Every one of them falls back to the file picker rather than dead-ending.
Tracks are stopped on capture and on unmount — leaving them running keeps the phone's camera
indicator lit after the user has moved on. Captures are scaled to a 2000px longest edge for
documents and 1600px for portraits, which keeps a certificate legible at a few hundred KB
instead of several MB over a poor connection.

### The community admin, and three defects it exposed

Asked for: sign in with `07874849983` and PIN `246810`, land on the admin panel.

**The sign-in form enforced `minLength={8}`.** A six-digit PIN could not be typed in. That was
wrong beyond this case — a length rule belongs where a password is *chosen*, and applying it at
sign-in rejects any valid existing password for being short. Now only enforced on sign-up.

**The leading zero would have been rejected.** The field capped input at 10 characters and
validated `^[6-9]\d{9}$`, so `07874849983` truncated to `0787484998` and failed. `lib/phone.ts`
normalises the four ways people write an Indian mobile — bare, with a `0` trunk prefix, with
`+91`, with `0091` — all to ten digits, and is unit-checked against all four plus rubbish.

**An admin with no candidate was sent to the registration form.** `homeFor()` switched purely on
`access_state`, and a staff account holding no candidate resolves to `no_application`. Spec §2
is explicit that admin is a separate role rather than a member access state; `homeFor()` now
checks the role first. The shell also gained a shield link so staff on a member screen can reach
the console.

Verified on production: signing in with that number issues a session, `my_context()` reports
`roles: ['superadmin']` and `access_state: no_application`, `/` redirects to `/admin`, and the
console renders. A signed-out visitor is still bounced to `/sign-in`.

### A note on the PIN

Six digits is a million combinations, guarding an account that can read every birth certificate,
decide every registration, grant roles and rewrite community rules. Supabase rate-limits the
token endpoint, which helps, but this is a deliberate convenience trade rather than a secure
default. Two ways to narrow it without touching the UX: make this account `admin` rather than
`superadmin` (it keeps approve, reject, request-correction and certificate inspection; it loses
role-granting and rule-editing, which the other superadmin still has), or use eight digits.

## Sign-out, and a localised validation message — 14 September 2026

Two reports from using the deployed app.

**There was no way to log out.** `SignOutButton` was rendered only at the foot of the Family
screen. Admin screens carry no tab bar and no Family tab, and neither does the "awaiting
review" screen — so an admin, and any applicant still in review, had no route out of the
session at all. Sign-out now lives in the shell top bar for every signed-in visitor, with the
labelled version kept on Family where someone looking for account settings will go.

**The app interrupted in English.** Sign-up on a fully Gujarati screen produced the browser's
own "Please lengthen this text to 8 characters or more". Two problems: constraint messages
follow the browser's language rather than the app's, and a client-side block means the request
never reaches the server — so an operator who already has an account never saw the far more
useful "That number already has an account. Sign in instead." and was left arguing with a
character count. Both fields now set a localised message, and the sign-up hint carries a direct
link to sign-in beside the rule that blocks them.

The eight-character minimum itself is unchanged and correct: it applies where a password is
*chosen*, not where one is entered. `/sign-in` ships with no `minLength`, which is what lets the
six-digit admin PIN through — confirmed by reading the attributes off the deployed HTML rather
than assuming the build matched the source.
