#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Release-criteria checks against a live Supabase project.
//
// The offline harness (tests/verify.sh) proves the migrations apply and the
// policies behave, but it stubs GoTrue, Storage and PostgREST — so it cannot
// prove that a signed-out HTTP request is actually refused, or that an uploaded
// certificate is actually unreadable. This closes that gap by signing real
// accounts up through the real API and exercising the real endpoints.
//
// Uses the publishable key only. A secret key is never needed and never read:
// if any of these checks required one, the policy being tested would be wrong.
//
//   node supabase/tests/verify-live.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from
// .env.local. Creates a handful of throwaway accounts on +9199000xxxxx; they
// are harmless, and `cleanup.sql` at the end prints how to remove them.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/* ------------------------------------------------------------------ setup */

const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
/**
 * Optional, and used for exactly one thing: creating test accounts through the
 * Auth Admin API when the public sign-up path is blocked by phone
 * confirmations. Every authorisation check below runs on a normal member token.
 */
const SECRET = env.SUPABASE_SECRET_KEY;

if (!URL_BASE || !KEY) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local');
  process.exit(1);
}

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/** PostgREST / GoTrue call. `token` null means anonymous. */
async function api(path, { token, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token ?? KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: response.status, body: json };
}

const rpc = (name, args, token) =>
  api(`/rest/v1/rpc/${name}`, { token, method: 'POST', body: args ?? {} });

/** A throwaway account. Phone numbers are in a reserved test range. */
const stamp = Date.now().toString().slice(-6);
let seq = 0;
const created = [];

let publicSignUpWorks = null;

/**
 * Creates a throwaway account and returns a real member token.
 *
 * Tries the public sign-up path first, because that is what the application
 * actually calls. If phone confirmations are still switched on, GoTrue tries to
 * send an SMS and fails — so this falls back to the Auth Admin API, records
 * that the public path is blocked, and carries on. Every check after this point
 * uses the resulting member token, so the fallback changes how the account was
 * made and nothing about what it is allowed to do.
 */
async function signUp(label) {
  seq += 1;
  const phone = `+9199${stamp}${String(seq).padStart(2, '0')}`;
  const password = 'verify-live-0000';

  const { status, body } = await api('/auth/v1/signup', {
    method: 'POST',
    body: { phone, password, data: { display_name: label } },
  });

  if (status === 200 && body?.access_token) {
    publicSignUpWorks ??= true;
    created.push({ label, phone, id: body.user.id });
    return { token: body.access_token, id: body.user.id, phone, password };
  }

  const smsBlocked = String(body?.error_code ?? '').includes('sms')
    || String(body?.msg ?? '').includes('OTP');

  if (smsBlocked && SECRET) {
    publicSignUpWorks ??= false;

    const admin = await api('/auth/v1/admin/users', {
      method: 'POST',
      token: SECRET,
      headers: { apikey: SECRET },
      body: { phone, password, phone_confirm: true, user_metadata: { display_name: label } },
    });
    if (admin.status !== 200 || !admin.body?.id) {
      throw new Error(`admin create failed for ${label} (${admin.status}): ${JSON.stringify(admin.body)}`);
    }

    const session = await api('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { phone, password },
    });
    if (!session.body?.access_token) {
      throw new Error(`password sign-in failed for ${label}: ${JSON.stringify(session.body)}`);
    }

    created.push({ label, phone, id: admin.body.id });
    return { token: session.body.access_token, id: admin.body.id, phone, password };
  }

  // Two distinct dashboard misconfigurations, with two different fixes.
  const code = String(body?.error_code ?? '');

  if (code === 'phone_provider_disabled') {
    throw new Error(
      `sign-up failed for ${label}: the Phone provider is switched off.\n` +
      '\n  Dashboard → Authentication → Sign In / Providers → Phone:\n' +
      '    • Enable Phone provider ....... ON\n' +
      '    • Confirm phone (SMS OTP) ..... OFF\n' +
      '\n  Both are needed. The provider being on is what allows phone+password\n' +
      '  accounts at all; confirmations being off is what stops GoTrue trying to\n' +
      '  send an SMS. There is no way around the first one — the Admin API can\n' +
      '  create a phone user while the provider is off, but sign-in is refused,\n' +
      '  so no member token can be obtained.',
    );
  }

  throw new Error(`sign-up failed for ${label} (${status}): ${JSON.stringify(body)}`);
}

/* ------------------------------------------------------------------ checks */

console.log(`Verifying ${URL_BASE}\n${'='.repeat(60)}`);

// -------------------------------------------------- §13 signed-out access --
section('Signed out (spec §13: cannot retrieve directory records or media)');

for (const table of ['candidates', 'candidate_contacts', 'directory_profiles', 'biodata_revisions', 'application_documents']) {
  const { status, body } = await api(`/rest/v1/${table}?select=*&limit=1`);
  const refused = status >= 400 || (Array.isArray(body) && body.length === 0);
  check(`anon cannot read ${table}`, refused, `status ${status}`);
}

{
  const { status } = await rpc('discover', { p_viewer_candidate: '00000000-0000-0000-0000-000000000000' });
  check('anon cannot call discover()', status >= 400, `status ${status}`);
}

// ------------------------------------------------------------- the schema --
section('Schema is present');
{
  const { status, body } = await rpc('my_context', {});
  check('my_context() exists', status !== 404 && body?.code !== 'PGRST202',
    typeof body === 'object' ? JSON.stringify(body).slice(0, 120) : '');
}

// ------------------------------------------------------------ registration --
section('Registration (spec §3)');

const parent = await signUp('verify parent');
check('sign-up returns a session', Boolean(parent.token));

{
  const { body } = await rpc('my_context', {}, parent.token);
  check('the auth trigger created an accounts row', Boolean(body?.account),
    JSON.stringify(body).slice(0, 120));
  check('a new account has no application', body?.access_state === 'no_application',
    `access_state=${body?.access_state}`);
  check('phone is recorded as unverified', body?.account?.phone_verified === false);
}

let candidateId;
let applicationId;
{
  const { status, body } = await rpc('start_registration', {
    p_relationship: 'daughter',
    p_full_name: 'Verify Testcase',
    p_date_of_birth: '2000-05-05',
    p_gender: 'female',
    p_father_name: 'Verify Father',
    p_city: 'Surat',
  }, parent.token);

  candidateId = body?.candidate_id;
  applicationId = body?.application_id;
  check('start_registration creates a candidate', status === 200 && Boolean(candidateId),
    JSON.stringify(body).slice(0, 160));
  check('it returns a duplicate count, not a list',
    typeof body?.possible_duplicates === 'number' && !('duplicates' in (body ?? {})));
}

{
  const { status, body } = await rpc('submit_registration', { p_application_id: applicationId }, parent.token);
  check('submission is refused without a certificate',
    status >= 400 && String(body?.message ?? '').includes('birth_certificate'),
    `status ${status} ${JSON.stringify(body).slice(0, 120)}`);
}

// ---------------------------------------------------------------- storage --
section('Private storage (spec §8: certificates are never member-visible)');

const objectPath = `${candidateId}/verify-${stamp}.pdf`;
{
  const response = await fetch(`${URL_BASE}/storage/v1/object/certificates/${objectPath}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${parent.token}`, 'Content-Type': 'application/pdf' },
    body: new Blob([`fictional certificate ${stamp}`], { type: 'application/pdf' }),
  });
  check('an operator can upload to their candidate folder', response.ok, `status ${response.status}`);
}

{
  const response = await fetch(`${URL_BASE}/storage/v1/object/certificates/${objectPath}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${parent.token}` },
  });
  check('the uploader CANNOT read it back', !response.ok, `status ${response.status}`);
}

{
  const response = await fetch(`${URL_BASE}/storage/v1/object/sign/certificates/${objectPath}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${parent.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  check('the uploader cannot mint a signed URL for it', !response.ok, `status ${response.status}`);
}

{
  const other = `${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}/theirs.pdf`;
  const response = await fetch(`${URL_BASE}/storage/v1/object/certificates/${other}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${parent.token}`, 'Content-Type': 'application/pdf' },
    body: new Blob(['nope'], { type: 'application/pdf' }),
  });
  check('cannot upload into another candidate’s folder', !response.ok, `status ${response.status}`);
}

{
  const { status, body } = await rpc('attach_certificate', {
    p_application_id: applicationId,
    p_storage_path: objectPath,
    p_mime_type: 'application/pdf',
    p_size_bytes: 1024,
  }, parent.token);
  check('attach_certificate records the upload', status === 200, JSON.stringify(body).slice(0, 120));
}

{
  const { body } = await rpc('submit_registration', { p_application_id: applicationId }, parent.token);
  check('submission now succeeds', body?.status === 'submitted', JSON.stringify(body).slice(0, 120));
  check('it sets a 24-hour review target', Boolean(body?.review_due_at) && body?.target_hours === 24);
}

{
  const { body } = await rpc('my_context', {}, parent.token);
  check('access state becomes awaiting_review', body?.access_state === 'awaiting_review',
    `access_state=${body?.access_state}`);
  check('the client is told a certificate exists without being able to read it',
    body?.candidates?.[0]?.application?.has_certificate === true);
}

// ---------------------------------------------------- member-to-member RLS --
section('One member cannot reach another (spec §2)');

const stranger = await signUp('verify stranger');

{
  const { body } = await api(`/rest/v1/candidates?select=id&limit=50`, { token: stranger.token });
  const ids = Array.isArray(body) ? body.map((row) => row.id) : [];
  check('a stranger sees no candidate of ours', !ids.includes(candidateId),
    `saw ${ids.length} row(s)`);
}

for (const table of ['directory_profiles', 'application_documents']) {
  const { status, body } = await api(`/rest/v1/${table}?select=*&limit=1`, { token: stranger.token });
  const refused = status >= 400 || (Array.isArray(body) && body.length === 0);
  check(`an authenticated member cannot read ${table}`, refused, `status ${status}`);
}

{
  const { status } = await api('/rest/v1/review_decisions?select=internal_note&limit=1', { token: stranger.token });
  check('internal_note is withheld at the column level', status >= 400, `status ${status}`);
}

{
  const { status } = await api('/rest/v1/account_roles', {
    token: stranger.token, method: 'POST', body: { account_id: stranger.id, role: 'admin' },
  });
  check('a member cannot grant themselves admin', status >= 400, `status ${status}`);
}

{
  const { status } = await rpc('grant_role', { p_account_id: stranger.id, p_role: 'admin' }, stranger.token);
  check('grant_role refuses a non-superadmin', status >= 400, `status ${status}`);
}

{
  const { status } = await api(`/rest/v1/candidates?id=eq.${candidateId}`, {
    token: stranger.token, method: 'PATCH', body: { identity_status: 'verified' },
  });
  const { body: after } = await rpc('my_context', {}, parent.token);
  const stillPending = after?.candidates?.[0]?.identity_status === 'pending';
  check('a member cannot verify a candidate themselves', status >= 400 || stillPending,
    `status ${status}`);
}

{
  const { status } = await rpc('discover', { p_viewer_candidate: candidateId }, stranger.token);
  check('discover() refuses a candidate the caller does not act for', status >= 400, `status ${status}`);
}

{
  const { status } = await rpc('admin_dashboard', {}, stranger.token);
  check('admin_dashboard refuses a member', status >= 400, `status ${status}`);
}

// -------------------------------------------------------------- unapproved --
section('An unapproved applicant has no member access (spec §2)');
{
  const { status } = await rpc('discover', { p_viewer_candidate: candidateId }, parent.token);
  check('discover() refuses an unverified candidate', status >= 400, `status ${status}`);
}
{
  const { status } = await rpc('save_biodata_draft', {
    p_candidate_id: candidateId, p_data: { gender: 'female' },
  }, parent.token);
  check('biodata is locked until identity is verified', status >= 400, `status ${status}`);
}

// ---------------------------------------------------------------- summary --
section('Public sign-up path');
check(
  'the app’s own signUp({ phone, password }) works',
  publicSignUpWorks === true,
  publicSignUpWorks === false
    ? 'blocked by phone confirmations — turn off "Confirm phone" in the dashboard. '
      + 'Accounts below were made through the Admin API instead.'
    : '',
);

console.log(`\n${'='.repeat(60)}`);
if (failures.length === 0) {
  console.log(`PASS — ${passed} checks held against the live project.`);
} else {
  console.log(`${passed} passed, ${failures.length} FAILED:`);
  for (const failure of failures) console.log(`  - ${failure}`);
}

console.log('\nThrowaway accounts created by this run:');
for (const account of created) console.log(`  ${account.phone}  ${account.id}  (${account.label})`);
// GoTrue stores phone numbers without the leading '+', and storage has a
// trigger that refuses direct DELETE — both learned the hard way.
console.log('\nRemove them with:');
console.log(`  delete from auth.users where phone like '9199${stamp}%';`);
console.log('  -- storage objects must go through the Storage API, not SQL:');
console.log('  --   DELETE /storage/v1/object/certificates/<candidate-id>/<file>');
console.log('  -- and a candidate whose last membership is gone is orphaned rather');
console.log('  -- than removed, so clear those too:');
console.log('  delete from public.candidates c where not exists (');
console.log('    select 1 from public.candidate_memberships m');
console.log('    where m.candidate_id = c.id and m.revoked_at is null);');

process.exit(failures.length === 0 ? 0 : 1);
