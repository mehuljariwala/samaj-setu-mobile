# Samaj Setu — સમાજ સેતુ

A Gujarati-first mobile web matrimonial directory for the Khatri Kshatriya community,
built on Next.js 16 and Supabase.

## What it does

- **Accounts** — phone and password, no OTP. Identity is established by admin review of the
  birth certificate, so the phone number stays a self-declared claim until then.
- **Two-step registration** — who the profile is for and the candidate's name, then birth date,
  city, father's name and the certificate. The certificate uploads straight to a private bucket;
  nobody but a verification admin can ever read it back, including the person who uploaded it.
- **Camera capture** for certificates, photographs and janmakshar, with a file picker alongside
  for PDFs. The in-app camera asks permission, previews, and allows a retake — and the image
  never reaches the phone's gallery, which is where the OS camera app would leave a photographed
  birth certificate.
- **Admin review** — registration and publication queues with overdue targets, private
  certificate inspection, duplicate comparison, and approve / request-correction / reject.
- **Biodata** — six collapsible sections, 25 fields, autosaved server-side as a versioned
  revision. The approved version stays visible while a new one is in review.
- **Consent** — only the candidate's own account can consent to publication, and withdrawing it
  hides the profile in the same transaction.
- **Discovery** — community rules applied per viewer, so two siblings on one account see
  different results. A shared mosal excludes a pair; unconfirmed details say so rather than
  quietly passing.
- **Introductions, photos and contacts** — three separate permissions with three separate
  revocations. Contact details appear only after an introduction is accepted.
- **Protected sharing** — a link whose token is never stored, only its hash, and which still
  needs an approved, eligible member at the other end.
- Gujarati / English switching throughout, on a server-rendered cookie so there is no flash.

## Run locally

Requires Node.js 22.13 or later and a Supabase project — hosted, or local via
`supabase start` if you have Docker.

```sh
npm ci
cp .env.example .env.local   # then fill in the URL and keys
npm run dev                  # next dev, bound to 0.0.0.0 so a phone on the same Wi-Fi can open it
```

Without those environment variables every page returns a clear configuration error rather than
a blank screen. See [`docs/backend/operations.md`](docs/backend/operations.md) for the full
setup, including the seeded development accounts.

The dev server prints both a `Local:` and a `Network:` URL. Use the Network one on a phone.

```sh
npm run build      # next build
npm start          # serve the production build
npm run typecheck  # tsc --noEmit
npm run lint       # oxlint
```

The backend has its own commands, which need a local PostgreSQL 17 server but
not Docker:

```sh
npm run db:verify  # rebuild a throwaway database, migrate, seed, assert
npm run db:types   # regenerate lib/supabase/database.types.ts from it
npm run db:check   # both, then typecheck
```

> **Formatting:** the repo's `npm run format` uses **oxfmt** (single quotes). If your editor
> formats on save with Prettier (double quotes) the two will fight over every file. Pick one.

## Deployment

Deployed on Vercel: **https://samaj-setu-prototype.vercel.app**

```sh
npx vercel --prod --scope mehul-jariwalas-projects
```

The single route is statically prerendered, so it is served from Vercel's edge CDN. The app has
no server component beyond that — all state is client-side (see Prototype boundaries).

## Design system

Everything visual is driven by the token block at the top of `app/globals.css`. Changing
`--brand` re-skins every button, tab, chip, badge and highlight in the app; `--app-w`,
`--topbar-h`, `--tabbar-h`, `--pad` and the `--r-*` radii control layout and shape.

The shell is a real app shell: a fixed top bar, one scrolling surface, and a fixed bottom tab
bar. On desktop that column is centred and floated rather than embedded in a mockup frame.

## Architecture

Nineteen migrations in `supabase/` carry the whole first release: registration and identity
review, duplicate resolution, family linking, biodata revisions, candidate consent, publication
moderation, community-rule evaluation, private discovery, interests, viewer-specific photo
permissions, contact reveal, protected sharing, admin queues and an audit trail.

The rule the whole design follows: **row level security answers "my data, plus the queues if I
am staff", and every cross-member read goes through a `SECURITY DEFINER` RPC** that applies
consent, community rules and grants first. A policy cannot express "…and the rules permit this
particular pair", because that depends on which candidate the viewer is acting for.

The application is a thin layer over that. Pages are server components; `lib/data/` is a
server-only data access layer; `app/actions/` are thin Server Actions; `proxy.ts` refreshes the
session and makes no authorisation decision. Nothing in the UI is a security boundary — every
Server Action is reachable by direct POST, so each one re-verifies.

Design notes, the security model and the deployment checklist are in
[`docs/backend/`](docs/backend/README.md).

## Boundaries

**No SMS, push or email provider is configured.** `public.notification_outbox` queues messages
and nothing drains it — a row there means *queued*, never *delivered*. In-app notifications work.

**No OTP.** The phone number is a self-declared identifier corroborated by an admin during
certificate review. `accounts.phone_verified_at` stays null to record that. Turning OTP on is a
config change plus a backfill; no schema change.

**Revocation is forward-looking.** Withdrawing consent, pausing, or revoking a photo grant takes
effect immediately, but cannot recall what someone has already seen. The UI says so and never
implies screenshot prevention.

**Three community rules ship disabled.** `paternal_surname` and `declared_relation` have no
leadership-ratified comparison definition (spec §7), so they are recorded, visible to admins,
and have no effect.

Use fictional data only until the community has ratified the open decisions listed in
[`docs/backend/operations.md`](docs/backend/operations.md).

## Source layout

- `app/`: one route per screen — welcome, sign-in/up, register, review, home, discover,
  biodata, interests, family, notifications, support, the `/s/[token]` share resolver, and
  `/admin`.
- `app/globals.css`: design tokens, app shell, and all screen styling.
- `app/layout.tsx`: document metadata, viewport, safe-area and the language cookie.
- `components/app/`: the shell and the client islands (forms, uploads, decisions).
- `components/biodata/model.ts`: field definitions and validation, mirroring
  `public.biodata_fields`. The database copy is authoritative.
- `components/biodata/guided-form.tsx`: the biodata form.
- `components/ui/`: vendored shadcn "base-nova" primitives wrapping `@base-ui/react`.
  Only a handful are imported; the rest are unpruned starter files.
- `supabase/`: migrations, seed, and the offline verification harness.
- `lib/supabase/`: Supabase clients and generated database types.
- `lib/data/`: server-only data access layer — one module per domain.
- `app/actions/`: Server Actions, thin wrappers over the data access layer.
- `proxy.ts`: session refresh (Next.js 16's renamed Middleware).
- `scripts/gen-db-types.mjs`: type generator for when the Supabase CLI is unavailable.
- `docs/`: product specification, plan, design rationale, backend design, and verification
  records.

`.openai/hosting.json` is a leftover from the original OpenAI Sites scaffold and is no longer
part of the build.

### History

This started as an OpenAI Sites scaffold built with `vinext` (Next.js-on-Vite) targeting a
Cloudflare Worker. It was ported to stock Next.js 16 on 2026-09-10 so it could deploy to Vercel;
`vinext`, `wrangler`, the Cloudflare Vite plugin and the Sites plugin were removed. No
application code changed in the port — only the build toolchain.
