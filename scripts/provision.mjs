#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Provision a hosted Supabase project: auth configuration, then the schema.
//
// Needs a Supabase Personal Access Token (sbp_…) in SUPABASE_ACCESS_TOKEN.
// That is the only credential that can do both jobs — the project's secret key
// is rejected by the Management API, and `supabase db push` needs the database
// password, which does not help with the auth settings anyway.
//
//   SUPABASE_ACCESS_TOKEN=sbp_… node scripts/provision.mjs [--dry-run]
//
// A personal access token is account-wide: it can reach every project you own.
// Revoke it at https://supabase.com/dashboard/account/tokens when finished.
//
// Migrations are applied in filename order and recorded in
// supabase_migrations.schema_migrations, the same table the CLI uses, so a
// later `supabase db push` sees them as already applied rather than replaying
// them.
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF
  ?? readFileSync(resolve(root, '.env.local'), 'utf8')
    .match(/NEXT_PUBLIC_SUPABASE_URL=https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

if (!TOKEN || !REF) {
  console.error('Set SUPABASE_ACCESS_TOKEN (sbp_…). Project ref read from .env.local.');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${REF}`;

async function mgmt(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: response.status, body: json };
}

const sql = (query) => mgmt('/database/query', { method: 'POST', body: { query } });

function die(what, result) {
  console.error(`\n✗ ${what} (${result.status})`);
  console.error(typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2));
  process.exit(1);
}

/* ------------------------------------------------------------------ auth -- */

console.log(`Project ${REF}${dryRun ? '  (dry run)' : ''}\n${'='.repeat(60)}`);
console.log('\n1. Auth configuration');

const current = await mgmt('/config/auth');
if (current.status !== 200) die('could not read the auth config', current);

console.log(`   phone provider : ${current.body.external_phone_enabled}`);
console.log(`   sms_autoconfirm: ${current.body.sms_autoconfirm}`);

// Phone sign-in on, SMS confirmation off. That pair is what makes this a
// phone + password account with no OTP — the decision recorded in
// supabase/config.toml and docs/backend/security-model.md. Any SMS provider
// attached to the project then goes unused.
const wanted = { external_phone_enabled: true, sms_autoconfirm: true };
const needsChange = Object.entries(wanted).some(([key, value]) => current.body[key] !== value);

if (!needsChange) {
  console.log('   already correct');
} else if (dryRun) {
  console.log(`   would set ${JSON.stringify(wanted)}`);
} else {
  const updated = await mgmt('/config/auth', { method: 'PATCH', body: wanted });
  if (updated.status !== 200) die('could not update the auth config', updated);
  console.log(`   set phone provider=${updated.body.external_phone_enabled}, `
    + `sms_autoconfirm=${updated.body.sms_autoconfirm}`);
}

/* ------------------------------------------------------------ migrations -- */

console.log('\n2. Migrations');

const files = readdirSync(resolve(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort();

if (!dryRun) {
  const prepared = await sql(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    );
  `);
  if (prepared.status !== 201 && prepared.status !== 200) {
    die('could not prepare the migration history table', prepared);
  }
}

const appliedResult = dryRun
  ? { status: 201, body: [] }
  : await sql('select version from supabase_migrations.schema_migrations');
if (appliedResult.status >= 400) die('could not read migration history', appliedResult);

const applied = new Set((appliedResult.body ?? []).map((row) => row.version));

for (const file of files) {
  const version = basename(file).split('_')[0];
  const name = basename(file, '.sql').slice(version.length + 1);

  if (applied.has(version)) {
    console.log(`   skip  ${file} (already applied)`);
    continue;
  }
  if (dryRun) {
    console.log(`   would apply ${file}`);
    continue;
  }

  process.stdout.write(`   apply ${file} … `);
  const body = readFileSync(resolve(root, 'supabase/migrations', file), 'utf8');

  const result = await sql(body);
  if (result.status >= 400) {
    console.log('FAILED');
    die(`migration ${file} failed — nothing after it was applied`, result);
  }

  // Recorded only after the migration itself succeeded, so a failure halfway
  // leaves an honest history rather than one that claims more than it did.
  const recorded = await sql(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values ('${version}', '${name.replace(/'/g, "''")}', array[]::text[])
     on conflict (version) do nothing`,
  );
  if (recorded.status >= 400) die(`could not record ${file} in the history table`, recorded);

  console.log('ok');
}

/* ----------------------------------------------------------------- check -- */

if (!dryRun) {
  console.log('\n3. Sanity check');
  const counts = await sql(`
    select
      (select count(*) from pg_tables where schemaname = 'public') as tables,
      (select count(*) from pg_policies where schemaname in ('public', 'storage')) as policies,
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app')) as functions,
      (select count(*) from storage.buckets) as buckets
  `);
  if (counts.status >= 400) die('sanity check failed', counts);
  console.log(`   ${JSON.stringify(counts.body?.[0])}`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(dryRun
  ? 'Dry run complete. Re-run without --dry-run to apply.'
  : 'Provisioned. Next: npm run db:verify:live');
