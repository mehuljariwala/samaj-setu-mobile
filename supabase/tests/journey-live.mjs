#!/usr/bin/env node
// ---------------------------------------------------------------------------
// The whole product flow, end to end, against a live project.
//
// verify-live.mjs proves the boundaries hold. This proves the thing actually
// works: three families register, an admin verifies them, biodata is written
// and approved, candidates consent, profiles publish, one family finds another,
// an introduction is sent and accepted, and contact details appear — in that
// order, through the same RPCs the application calls.
//
//   ADMIN_PHONE=9999900001 ADMIN_PASSWORD=… node supabase/tests/journey-live.mjs
//
// Everything it creates is removed at the end, whether it passes or fails.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = env.SUPABASE_SECRET_KEY;
const ADMIN_PHONE = process.env.ADMIN_PHONE;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PHONE || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_PHONE and ADMIN_PASSWORD.');
  process.exit(1);
}

let passed = 0;
const failures = [];
const createdUsers = [];

const ok = (name, condition, detail = '') => {
  if (condition) { passed += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const step = (t) => console.log(`\n${t}`);

async function api(path, { token, method = 'GET', body, key } = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: {
      apikey: key ?? KEY,
      Authorization: `Bearer ${token ?? key ?? KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

/** Throws on failure, so the journey stops where it actually broke. */
async function rpc(name, args, token) {
  const { status, body } = await api(`/rest/v1/rpc/${name}`, { token, method: 'POST', body: args ?? {} });
  if (status >= 400) throw new Error(`${name} → ${status} ${JSON.stringify(body)}`);
  return body;
}

const stamp = Date.now().toString().slice(-6);
let seq = 0;

async function newAccount(label) {
  seq += 1;
  const phone = `+9198${stamp}${String(seq).padStart(2, '0')}`;
  const password = 'journey-live-0000';
  const { status, body } = await api('/auth/v1/signup', {
    method: 'POST', body: { phone, password, data: { display_name: label } },
  });
  if (status !== 200 || !body?.access_token) throw new Error(`sign-up ${label}: ${JSON.stringify(body)}`);
  createdUsers.push(body.user.id);
  return { token: body.access_token, id: body.user.id, phone, label };
}

async function adminToken() {
  const { body } = await api('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { phone: `+91${ADMIN_PHONE}`, password: ADMIN_PASSWORD },
  });
  if (!body?.access_token) throw new Error(`admin sign-in failed: ${JSON.stringify(body)}`);
  return body.access_token;
}

const biodataFor = (gender, mosal, extra = {}) => ({
  gender, height: gender === 'male' ? '176' : '163', marital: 'never',
  community: 'surti', sect: 'bhagat', surname: 'Testsurname', mosal,
  education: 'master', work: 'employed', role: 'Engineer',
  contactKind: 'self', phone: '9812345678',
  ...extra,
});

/** Registers, uploads a certificate, submits, and has the admin approve. */
async function verifiedCandidate(account, admin, { name, dob, gender }) {
  const start = await rpc('start_registration', {
    p_relationship: 'self', p_full_name: name, p_date_of_birth: dob,
    p_gender: gender, p_father_name: 'Journey Father', p_city: 'Surat',
  }, account.token);

  const path = `${start.candidate_id}/cert-${stamp}-${seq}.pdf`;
  const upload = await fetch(`${URL_BASE}/storage/v1/object/certificates/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/pdf' },
    body: new Blob([`fictional ${name}`], { type: 'application/pdf' }),
  });
  if (!upload.ok) throw new Error(`upload for ${name}: ${upload.status}`);

  await rpc('attach_certificate', {
    p_application_id: start.application_id, p_storage_path: path,
    p_mime_type: 'application/pdf', p_size_bytes: 64,
  }, account.token);
  await rpc('submit_registration', { p_application_id: start.application_id }, account.token);
  await rpc('admin_decide_registration', {
    p_application_id: start.application_id, p_action: 'approve',
    p_expected_status: 'submitted', p_reason: 'Matches the certificate.',
  }, admin);

  return { candidateId: start.candidate_id, applicationId: start.application_id, code: start.public_code };
}

/** Fills biodata, submits it, has the admin approve, and consents. */
async function publish(account, admin, candidateId, data) {
  const saved = await rpc('save_biodata_draft',
    { p_candidate_id: candidateId, p_data: data }, account.token);
  await rpc('submit_biodata', { p_revision_id: saved.revision_id }, account.token);
  await rpc('admin_decide_biodata', {
    p_revision_id: saved.revision_id, p_action: 'approve',
    p_expected_status: 'submitted', p_reason: 'Complete.',
  }, admin);
  await rpc('grant_publication_consent', { p_candidate_id: candidateId }, account.token);
}

/* ========================================================================= */

console.log(`End-to-end journey against ${URL_BASE}\n${'='.repeat(64)}`);
let arjun, priya, meera, rekha;

try {
  step('Admin');
  const admin = await adminToken();
  const dash = await rpc('admin_dashboard', {}, admin);
  ok('the admin can open the dashboard', typeof dash?.verification?.open === 'number');

  step('Three candidates register and are verified (spec §3)');
  arjun = await newAccount('Arjun');
  priya = await newAccount('Priya');
  meera = await newAccount('Meera');

  const a = await verifiedCandidate(arjun, admin, { name: 'Arjun Journey', dob: '1996-04-12', gender: 'male' });
  const p = await verifiedCandidate(priya, admin, { name: 'Priya Journey', dob: '1999-08-21', gender: 'female' });
  const m = await verifiedCandidate(meera, admin, { name: 'Meera Journey', dob: '2000-02-02', gender: 'female' });
  ok('three candidates verified', Boolean(a.candidateId && p.candidateId && m.candidateId));

  const ctx = await rpc('my_context', {}, arjun.token);
  ok('approval unlocks member access', ctx.access_state === 'approved', ctx.access_state);

  step('Biodata, approval and consent (spec §5)');
  // Arjun and Meera share a mosal; Priya does not.
  await publish(arjun, admin, a.candidateId, biodataFor('male', 'Trivedi'));
  await publish(priya, admin, p.candidateId, biodataFor('female', 'Patel'));
  await publish(meera, admin, m.candidateId, biodataFor('female', 'Trivedi'));

  const after = await rpc('my_context', {}, arjun.token);
  ok('an approved, consented candidate is published',
    after.candidates[0].discoverable === true && after.candidates[0].publication_status === 'published',
    JSON.stringify(after.candidates[0]?.publication_status));

  step('A guardian cannot consent for a candidate (spec §4)');
  rekha = await newAccount('Rekha');
  const sita = await rpc('start_registration', {
    p_relationship: 'daughter', p_full_name: 'Sita Journey', p_date_of_birth: '2001-06-06',
    p_gender: 'female', p_father_name: 'Journey Father', p_city: 'Surat',
  }, rekha.token);
  const denied = await api('/rest/v1/rpc/grant_publication_consent', {
    token: rekha.token, method: 'POST', body: { p_candidate_id: sita.candidate_id },
  });
  ok('a parent is refused publication consent for their child', denied.status >= 400,
    `status ${denied.status}`);

  step('Discovery applies community rules per pair (spec §7)');
  const found = await rpc('discover', { p_viewer_candidate: a.candidateId }, arjun.token);
  const names = found.map((r) => r.full_name);
  ok('Arjun finds Priya (different mosal)', names.includes('Priya Journey'), names.join(', '));
  ok('Arjun does NOT find Meera (shared mosal)', !names.includes('Meera Journey'), names.join(', '));
  ok('Arjun does not find himself', !names.includes('Arjun Journey'));

  const verdict = await rpc('check_eligibility',
    { p_viewer: a.candidateId, p_target: m.candidateId }, arjun.token);
  ok('the exclusion is named, not silent', verdict === 'excluded_shared_mosal', String(verdict));

  step('Introduction and contact reveal (spec §8)');
  const before = await rpc('get_candidate_profile',
    { p_viewer_candidate: a.candidateId, p_target_candidate: p.candidateId }, arjun.token);
  ok('no contact details before an introduction', (before.contacts ?? []).length === 0);

  const interestId = await rpc('send_interest',
    { p_from_candidate: a.candidateId, p_to_candidate: p.candidateId, p_message: 'Namaste.' }, arjun.token);
  ok('the introduction is sent', Boolean(interestId));

  const dup = await api('/rest/v1/rpc/send_interest', {
    token: arjun.token, method: 'POST',
    body: { p_from_candidate: a.candidateId, p_to_candidate: p.candidateId },
  });
  ok('a duplicate introduction is refused', dup.status >= 400, `status ${dup.status}`);

  const blocked = await api('/rest/v1/rpc/send_interest', {
    token: arjun.token, method: 'POST',
    body: { p_from_candidate: a.candidateId, p_to_candidate: m.candidateId },
  });
  ok('an introduction to an excluded candidate is refused', blocked.status >= 400,
    `status ${blocked.status}`);

  const inbox = await rpc('list_interests', { p_candidate_id: p.candidateId, p_box: 'received' }, priya.token);
  ok('it appears in the recipient’s inbox', inbox.length === 1 && inbox[0].counterpart_name === 'Arjun Journey');
  ok('contact is not visible while pending', inbox[0]?.contact_visible === false);

  await rpc('respond_interest', { p_interest_id: interestId, p_accept: true }, priya.token);

  const revealed = await rpc('get_candidate_profile',
    { p_viewer_candidate: a.candidateId, p_target_candidate: p.candidateId }, arjun.token);
  ok('accepting reveals contact details', (revealed.contacts ?? []).length > 0,
    JSON.stringify(revealed.contacts));

  const mutual = await rpc('get_candidate_profile',
    { p_viewer_candidate: p.candidateId, p_target_candidate: a.candidateId }, priya.token);
  ok('the reveal is mutual', (mutual.contacts ?? []).length > 0);

  step('Withholding contact overrides the grant (spec §8)');
  await api(`/rest/v1/candidate_privacy?candidate_id=eq.${p.candidateId}`, {
    token: priya.token, method: 'PATCH', body: { reveal_contact_on_accept: false },
  });
  const withheld = await rpc('get_candidate_profile',
    { p_viewer_candidate: a.candidateId, p_target_candidate: p.candidateId }, arjun.token);
  ok('a candidate who withholds their number is respected', (withheld.contacts ?? []).length === 0);

  step('Immediate controls (spec §5)');
  await api(`/rest/v1/candidates?id=eq.${p.candidateId}`, {
    token: priya.token, method: 'PATCH', body: { paused: true },
  });
  const paused = await rpc('discover', { p_viewer_candidate: a.candidateId }, arjun.token);
  ok('pausing removes a profile from the directory at once',
    !paused.map((r) => r.full_name).includes('Priya Journey'));

  await api(`/rest/v1/candidates?id=eq.${p.candidateId}`, {
    token: priya.token, method: 'PATCH', body: { paused: false },
  });
  await rpc('withdraw_publication_consent', { p_candidate_id: p.candidateId }, priya.token);
  const withdrawn = await rpc('discover', { p_viewer_candidate: a.candidateId }, arjun.token);
  ok('withdrawing consent hides the profile at once',
    !withdrawn.map((r) => r.full_name).includes('Priya Journey'));

  step('Protected sharing (spec §9)');
  const link = await rpc('create_share_link', { p_candidate_id: a.candidateId }, arjun.token);
  ok('a share link is issued with its token shown once', Boolean(link?.token));
  // Priya, not Meera: Meera shares Arjun's mosal, so she is excluded from his
  // profile and the link correctly refuses her. A share link is a shortcut to
  // the profile screen, never a way around its rules (spec §9).
  const refusedByRules = await api('/rest/v1/rpc/resolve_share_link', {
    token: meera.token, method: 'POST',
    body: { p_token: link.token, p_viewer_candidate: m.candidateId },
  });
  ok('a share link does not bypass community rules',
    refusedByRules.status >= 400
      && String(refusedByRules.body?.message ?? '').includes('not_eligible'),
    JSON.stringify(refusedByRules.body).slice(0, 90));

  const opened = await rpc('resolve_share_link',
    { p_token: link.token, p_viewer_candidate: p.candidateId }, priya.token);
  ok('an approved, eligible member can open it', opened?.public_code === a.code,
    JSON.stringify(opened).slice(0, 90));
  const badToken = await api('/rest/v1/rpc/resolve_share_link', {
    token: meera.token, method: 'POST',
    body: { p_token: 'not-a-real-token', p_viewer_candidate: m.candidateId },
  });
  ok('an invalid token is refused', badToken.status >= 400, `status ${badToken.status}`);
} catch (error) {
  failures.push(`journey aborted: ${error.message}`);
  console.log(`\n  ABORTED — ${error.message}`);
} finally {
  /* ------------------------------------------------------------- cleanup -- */
  step('Cleanup');
  let removed = 0;

  for (const id of createdUsers) {
    const res = await fetch(`${URL_BASE}/auth/v1/admin/users/${id}`, {
      method: 'DELETE', headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
    });
    if (res.ok) removed += 1;
  }

  // Objects must go through the Storage API, and candidates whose last
  // membership is gone are orphaned rather than removed.
  for (const bucket of ['certificates', 'candidate-photos', 'kundali']) {
    const list = await fetch(`${URL_BASE}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 200 }),
    });
    const folders = list.ok ? await list.json() : [];
    for (const folder of folders) {
      const inner = await fetch(`${URL_BASE}/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: folder.name, limit: 200 }),
      });
      for (const file of inner.ok ? await inner.json() : []) {
        await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${folder.name}/${file.name}`, {
          method: 'DELETE', headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
        });
      }
    }
  }

  console.log(`  removed ${removed}/${createdUsers.length} accounts and their uploads`);
  console.log('  orphaned candidates need one SQL statement — see docs/backend/operations.md');

  console.log(`\n${'='.repeat(64)}`);
  if (failures.length === 0) console.log(`PASS — ${passed} checks, full journey completed.`);
  else {
    console.log(`${passed} passed, ${failures.length} FAILED:`);
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failures.length === 0 ? 0 : 1);
}
