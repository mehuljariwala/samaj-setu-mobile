# Samaj Setu — સમાજ સેતુ

A fresh, Gujarati-first mobile web prototype for a community matrimonial platform.

## Current experience

- Mobile registration with simulated OTP and mandatory sample certificate attachment.
- Admin registration review: approve, request correction, or reject.
- Member home, profile discovery, saved profiles, and private photo request previews.
- Guided biodata form with short steps, selectable answers, local draft saving, and editable review.
- Navy headers, white forms, bold blue actions, and Gujarati/English switching.

## Run locally

Requires Node.js 22.13 or later.

```sh
npm ci
npm run dev
```

Use the local URL printed by the development server.

```sh
npm run build
npx tsc --noEmit
```

## Prototype boundaries

This is a design prototype, not a production matrimonial service. OTP delivery, document uploads, real account access controls, consent capture, and notifications are simulated or not implemented. Use fictional data only. Biodata drafts are stored on the current device for up to 30 days; other preview state is held in memory.

Publication requires separate candidate consent and admin biodata review in the planned product. Finishing a prototype draft does not publish a profile.

## Source layout

- `app/page.tsx`: prototype screens and interactions.
- `app/globals.css`: responsive styling and navy/white theme.
- `components/biodata/`: guided form and validation model.
- `components/ui/`: starter UI primitives.
- `docs/`: product specification, implementation notes, design rationale, and verification records.

The `.openai/hosting.json` file identifies the existing private Sites preview. GitHub pushes do not automatically deploy it.
