# supabase/

The database. Design notes and rationale live in [`docs/backend/`](../docs/backend/).

```
config.toml     local stack and auth configuration
migrations/     applied in filename order; never edit one that has been applied
seed.sql        development data, created by calling the real RPCs
tests/
  00_shim.sql       stands in for Supabase's auth/storage on a plain PostgreSQL server
  01_assertions.sql the spec §13 release criteria, as executable checks
  verify.sh         rebuild everything and run it
```

## Working on it

```sh
npm run db:verify   # rebuild a throwaway database and run every assertion
npm run db:types    # regenerate lib/supabase/database.types.ts from it
npm run db:check    # both, then type-check the app
```

With Docker available, `supabase start` and `supabase db reset` run the same
migrations and seed against the real stack.

## Two rules worth knowing before editing

**Migrations are ordered and immutable.** Add a file with a later timestamp;
never change one that has been applied anywhere.

**`public.biodata_fields` and `components/biodata/model.ts` describe the same
25 fields and must change together.** The database copy is the one that decides
what a write may contain — a form built from a diverging list will submit values
the database refuses.
