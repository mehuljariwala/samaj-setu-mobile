'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Camera, Check, CircleAlert, CircleHelp, Clock3, GraduationCap, Heart,
  Info, LockKeyhole, MessageSquareText, Minus, Pencil, Phone, Plus, Send, ShieldCheck, Sparkles,
  UserRound, Users,
} from 'lucide-react';
import { MediaUploader, type UploadedMedia } from '@/components/app/media-uploader';
import {
  discardBiodataChangesAction, saveBiodataDraftAction, startBiodataEditAction, submitBiodataAction,
} from '@/app/actions/biodata';
import { submitRegistrationAction } from '@/app/actions/registration';
import type { DetailChanges } from '@/lib/data/biodata';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';
import { formatPhone } from '@/lib/org';
import { ageFrom, formatDate } from '@/lib/age';
import { isValidLocalPhone, normalizeLocalPhone } from '@/lib/phone';
import {
  validateKeys, completion, displayValue, fieldByKey, isRequired, isSanatan, persistable, SAMAJ_ONLY, SANATAN_ONLY,
  type Values, type Field,
} from './model';
import { IdentityEditor, type IdentityDetails } from './identity-editor';

type Props = {
  lang: Lang;
  candidateId: string;
  /**
   * Set while the family is still preparing its registration: the last screen
   * then sends the registration and this biodata together, for the one admin
   * approval. Null for a verified member editing a published biodata.
   */
  applicationId: string | null;
  revisionId: string | null;
  /** 'draft' | 'correction_requested' are editable; the rest are read-only. */
  status: string;
  initialValues: Values;
  verified: IdentityDetails;
  /**
   * An approved profile. Its family changes it as a new version, sent to an
   * admin, while the approved one stays live; null `applicationId` alone also
   * covers a verified family whose biodata was never approved.
   */
  live: boolean;
  /** Registration details the open version asks to change, as the database spells them. */
  detailChanges: DetailChanges;
  /** Why the family's last changes to the live biodata were not approved. */
  refusedChanges: string | null;
  relation: string;
  decisionReason: string | null;
  /** Field-level issues the reviewer raised, in both languages (spec §10). */
  issues: { field_key: string; message_gu: string; message_en: string }[];
  photos: UploadedMedia[];
  kundali: UploadedMedia[];
};

/**
 * The screens, in order. One topic each, so a family answers a handful of
 * questions at a time instead of facing six folded sections and a wall of
 * dropdowns. Steps are a layout over model.ts, which still owns validation.
 */
const STEPS = [
  { id: 'about', Icon: UserRound, keys: ['gender', 'height', 'marital', 'diet'] },
  { id: 'community', Icon: Users, keys: ['community', 'caste', 'sect', 'surname', 'mosal'] },
  { id: 'work', Icon: GraduationCap, keys: ['education', 'degree', 'work', 'role', 'employer'] },
  { id: 'family', Icon: Heart, keys: ['mother', 'fatherWork', 'native', 'hometown', 'state', 'brothers', 'sisters'] },
  { id: 'birth', Icon: Clock3, keys: ['birthplace', 'birthtime', 'rashi', 'gan', 'mangal'], optional: true },
  { id: 'contact', Icon: Phone, keys: ['contactKind', 'phone', 'extraPhone', 'fatherPhone', 'address'] },
  { id: 'photos', Icon: Camera, keys: [] as string[], optional: true },
] as const;
type Step = (typeof STEPS)[number];

/** The last screen: everything at a glance, then send. */
const REVIEW = STEPS.length;

/** Roles where an employer/role question does not apply. */
const NOT_WORKING = ['student', 'not_working'];
/** Long enough that typing a sentence is one write, short enough to feel safe. */
const AUTOSAVE_MS = 1200;

/**
 * Families think in feet and inches; the catalogue stores centimetres. Every
 * inch from 4′0″ to 7′0″, each carrying its rounded centimetre value.
 */
const HEIGHTS = Array.from({ length: 37 }, (_, i) => {
  const inches = 48 + i;
  return { cm: String(Math.round(inches * 2.54)), label: `${Math.floor(inches / 12)}′ ${inches % 12}″` };
});

function feetAndInches(cm: string) {
  const inches = Math.round(Number(cm) / 2.54);
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
}

export function GuidedBiodata({
  lang, candidateId, applicationId, revisionId, status, initialValues, verified, live, detailChanges,
  refusedChanges, relation, decisionReason, issues, photos, kundali,
}: Props) {
  const t = translator(lang);
  const en = lang === 'en';
  const router = useRouter();
  const applying = applicationId !== null;
  /** Where Back and Finish later go: the registration, or the member home. */
  const home = applying ? '/register' : '/home';

  const editable = status === 'draft' || status === 'correction_requested';
  /** Registration details changed with this version, waiting on the same approval. */
  const [changes, setChanges] = useState<DetailChanges>(detailChanges);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const shown: IdentityDetails = {
    name: changes.full_name ?? verified.name,
    dob: changes.date_of_birth ?? verified.dob,
    father: changes.father_name ?? verified.father,
    city: changes.city ?? verified.city,
    gender: changes.gender ?? verified.gender,
  };
  const changed = Object.keys(changes).length > 0;
  const first = shown.name.split(' ')[0] || shown.name;
  /** Registration already asked; the question only returns if the two disagree. */
  const impliedGender = shown.gender
    || (relation === 'son' ? 'male' : relation === 'daughter' ? 'female' : '');

  // An empty answer in an older draft must not hide what is already known.
  const [data, setData] = useState<Values>(() => ({
    ...initialValues,
    gender: initialValues.gender || impliedGender,
    contactKind: initialValues.contactKind || (relation === 'self' ? 'self' : 'father'),
  }));
  const issueFor = useMemo(
    () => new Map(issues.map((issue) => [issue.field_key, en ? issue.message_en : issue.message_gu])),
    [issues, en],
  );
  const [step, setStep] = useState(() => (editable ? startingStep(data, issues.map((i) => i.field_key)) : REVIEW));
  const [direction, setDirection] = useState<'next' | 'back'>('next');
  /** Came here from the final check: Continue goes straight back to it. */
  const [fromReview, setFromReview] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [accurate, setAccurate] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [shake, setShake] = useState(0);
  /** The missing field to bring into view; `n` re-runs the jump for the same field. */
  const [jump, setJump] = useState<{ key: string; n: number } | null>(null);
  const [busy, setBusy] = useState('');

  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Values typed but not yet written; null once the server has them. */
  const pending = useRef<Values | null>(null);

  /** Fields a step asks, honouring the work-status and implied-gender rules. */
  function visibleKeys(s: Step, values: Values = data): string[] {
    const hideJob = NOT_WORKING.includes(values.work);
    // A Sanatan daughter is asked her caste and family details instead of the
    // Khatri sub-community and mosal; a samaj biodata never sees hers.
    const sanatan = isSanatan(values);
    return s.keys.filter((k) =>
      !(hideJob && (k === 'role' || k === 'employer'))
      && !(k === 'gender' && impliedGender && values.gender === impliedGender)
      && !(sanatan ? SAMAJ_ONLY : SANATAN_ONLY).includes(k));
  }

  /**
   * Autosave.
   *
   * The draft lives in `biodata_revisions`, not on this device, so it survives a
   * new phone and is visible to the admin queue. Only catalogue fields are
   * sent: `save_biodata_draft` rejects an unknown key outright.
   */
  async function write(values: Values) {
    setSaveState('saving');
    const result = await saveBiodataDraftAction(candidateId, persistable(values));
    if (pending.current === values) pending.current = null;
    setSaveState(result.ok ? 'saved' : 'failed');
    if (!result.ok) setMessage(result.message);
    return result;
  }

  function queueSave(next: Values) {
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (pending.current) void write(pending.current); }, AUTOSAVE_MS);
  }

  /** Writes whatever is waiting now rather than after the pause. */
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current) await write(pending.current);
  }

  // Leaving the screen mid-sentence still keeps the sentence.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current) void saveBiodataDraftAction(candidateId, persistable(pending.current));
  }, [candidateId]);

  function update(k: string, v: string) {
    const next = { ...data, [k]: v };
    // Clearing these at the source keeps a stale employer out of the stored
    // draft and out of the summary when the answer switches to "student".
    if (k === 'work' && NOT_WORKING.includes(v)) { next.role = ''; next.employer = ''; }
    if (k === 'birthUnknown' && v) next.birthtime = '';
    setData(next);
    queueSave(next);
    setErrors((e) => e.filter((x) => x !== k));
    setAccurate(false);
    setMessage('');
  }

  /** `toField` skips the jump to the top when a missing field is about to be shown instead. */
  function go(to: number, toField = false) {
    setDirection(to < step ? 'back' : 'next');
    setStep(to);
    setErrors([]);
    setMessage('');
    setJump(null);
    if (!toField) requestAnimationFrame(() => root.current?.scrollIntoView({ block: 'start', behavior: 'instant' }));
  }

  function fail(keys: string[], text: string) {
    setErrors(keys);
    setMessage(text);
    setShake((n) => n + 1);
    setJump((j) => ({ key: keys[0], n: (j?.n ?? 0) + 1 }));
  }

  // Brings the first missing field to the middle of the screen — clear of the
  // sticky Continue bar — once it is on the page, then focuses and pulses it.
  // Runs after commit, so it also works when Send opens an earlier step.
  useEffect(() => {
    if (!jump) return;
    const field = root.current?.querySelector<HTMLElement>(`[data-field="${jump.key}"]`);
    if (!field) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    field.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    const target = field.querySelector<HTMLElement>(`#bio-${jump.key}`)
      ?? field.querySelector<HTMLElement>('input, select, textarea, button');
    target?.focus({ preventScroll: true });
    const done = window.setTimeout(() => setJump((j) => (j === jump ? null : j)), 1600);
    return () => window.clearTimeout(done);
  }, [jump]);

  function next() {
    const invalid = validateKeys(visibleKeys(STEPS[step]), data);
    if (invalid.length) {
      return fail(invalid, t('રંગથી દર્શાવેલી વિગત ભરો.', 'Please fill in the highlighted detail.'));
    }
    void flush();
    if (fromReview) { setFromReview(false); return go(REVIEW); }
    go(step + 1);
  }

  function back() {
    if (step === 0 || (step === REVIEW && !editable)) return router.push(home);
    if (fromReview) { setFromReview(false); return go(REVIEW); }
    go(step - 1);
  }

  function edit(to: number) {
    setFromReview(true);
    go(to);
  }

  /** The first screen that still needs something, or null when all is done. */
  function firstGap(keys?: string[]) {
    const index = STEPS.findIndex((s) => {
      const shown = visibleKeys(s);
      return keys ? shown.some((k) => keys.includes(k)) : validateKeys(shown, data).length > 0;
    });
    return index === -1 ? null : index;
  }

  /**
   * Submitting is a server decision. The client-side check is a courtesy;
   * the server re-validates every field against the catalogue and refuses
   * while anything is unconfirmed, so a stale form cannot slip past. A family
   * still registering sends the registration, which carries this biodata
   * with it (20261004000400); a verified member sends the biodata alone.
   */
  async function submit() {
    // A profile photo is required to send (20261004000600).
    const photoStep = STEPS.findIndex((s) => s.id === 'photos');
    if (photos.length === 0) {
      setFromReview(true);
      go(photoStep, true);
      setMessage(t('મોકલતાં પહેલાં એક પ્રોફાઇલ ફોટો ઉમેરો.', 'Add a profile photo before sending.'));
      return;
    }

    const gap = firstGap();
    if (gap !== null) {
      setFromReview(true);
      go(gap, true);
      fail(
        validateKeys(visibleKeys(STEPS[gap]), data),
        t('આ વિગત હજી બાકી છે.', 'This detail is still missing.'),
      );
      return;
    }

    setBusy(t('મોકલી રહ્યા છીએ…', 'Sending…'));
    if (timer.current) clearTimeout(timer.current);
    const saved = await write(data);
    if (!saved.ok) { setBusy(''); return; }

    const id = saved.data.revisionId ?? revisionId;
    if (!id) {
      setBusy('');
      setMessage(t('ડ્રાફ્ટ મળ્યો નથી.', 'No draft was found.'));
      return;
    }

    const result = applying ? await submitRegistrationAction(applicationId) : await submitBiodataAction(id);
    if (!result.ok) {
      setBusy('');
      // The registration names a missing biodata as `biodata,<keys>`.
      const keys = result.detail[0] === 'biodata' ? result.detail.slice(1) : result.detail;
      const at = result.code === 'incomplete' ? firstGap(keys) : null;
      if (result.code === 'incomplete' && keys[0] === 'photo') {
        setFromReview(true);
        go(photoStep, true);
        setMessage(t('મોકલતાં પહેલાં એક પ્રોફાઇલ ફોટો ઉમેરો.', 'Add a profile photo before sending.'));
      } else if (at !== null) {
        setFromReview(true);
        go(at, true);
        fail(keys.filter((k) => visibleKeys(STEPS[at]).includes(k)), t('આ વિગત હજી બાકી છે.', 'This detail is still missing.'));
      } else if (applying && result.code === 'incomplete') {
        setMessage(t(
          'નોંધણીમાં કોઈ વિગત અથવા દસ્તાવેજ ખૂટે છે. ઉપર “બદલો” દબાવીને ઉમેરો.',
          'A detail or document is missing from the registration. Tap “Change” above to add it.',
        ));
      } else {
        setMessage(result.message);
      }
      return;
    }

    router.replace(applying ? '/review' : '/home');
  }

  async function finishLater() {
    setBusy(t('સાચવી રહ્યા છીએ…', 'Saving…'));
    await flush();
    router.push(home);
  }

  function changeIdentity() {
    // Not verified yet: the details are simply the registration's, and that
    // form is where they change. Once verified they change here, with this
    // version, and wait for the same approval.
    if (applying) {
      void flush().then(() => router.push('/register'));
      return;
    }
    setEditingIdentity(true);
  }

  function identitySaved(saved: DetailChanges) {
    setChanges(saved);
    setEditingIdentity(false);
    // The server keeps the biodata's own gender in step; so does the form,
    // without writing it back, and so does a save still waiting to go.
    const gender = saved.gender ?? verified.gender;
    if (!gender) return;
    setData((d) => ({ ...d, gender }));
    if (pending.current) pending.current = { ...pending.current, gender };
  }

  /** An approved profile: open a new version beside the live one. */
  async function startEditing() {
    setBusy(t('ખોલી રહ્યા છીએ…', 'Opening…'));
    const result = await startBiodataEditAction(candidateId);
    // The page re-renders with the new version, which remounts this form.
    if (!result.ok) { setBusy(''); setMessage(result.message); }
  }

  async function discardChanges() {
    if (!confirm(t(
      'બધા ફેરફાર રદ કરવા છે? મંજૂર બાયોડેટા જેમ છે તેમ રહેશે.',
      'Discard all your changes? The approved biodata stays as it is.',
    ))) return;
    setBusy(t('રદ કરી રહ્યા છીએ…', 'Discarding…'));
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    const result = await discardBiodataChangesAction(candidateId);
    if (!result.ok) { setBusy(''); setMessage(result.message); }
  }

  /* ------------------------------------------------------------ copy --- */
  const heads: Record<Step['id'], { title: string; lead: string; name: string }> = {
    about: {
      name: t('વ્યક્તિગત', 'About'),
      title: relation === 'self' ? t('તમારા વિશે થોડું', 'A little about you') : t(`${first} વિશે થોડું`, `A little about ${first}`),
      lead: t('ફક્ત ટૅપ કરીને પસંદ કરો. બધું આપમેળે સચવાય છે.', 'Just tap to choose. Everything saves as you go.'),
    },
    community: isSanatan(data)
      ? {
        name: t('જ્ઞાતિ', 'Caste'),
        title: t('જ્ઞાતિ અને સંપ્રદાય', 'Caste and sect'),
        lead: t('તમારી જ્ઞાતિ લખો, અને ભગત કે જગત પસંદ કરો.', 'Write your caste, and choose Bhagat or Jagat.'),
      }
      : {
        name: t('સમાજ', 'Community'),
        title: t('સમાજ અને મોસાળ', 'Community and mosal'),
        lead: t('સાચો સંબંધ શોધવા માટે આ સૌથી જરૂરી છે.', 'This matters most for finding the right match.'),
      },
    work: {
      name: t('અભ્યાસ', 'Studies'),
      title: t('અભ્યાસ અને કામ', 'Studies and work'),
      lead: t('સૌથી ઊંચો અભ્યાસ અને હાલનું કામ.', 'The highest qualification, and what they do now.'),
    },
    family: {
      name: t('પરિવાર', 'Family'),
      title: t('પરિવાર', 'Family'),
      lead: t('બધું વૈકલ્પિક છે, પણ પરિવારો આ જોવાનું પસંદ કરે છે.', 'All optional, but families like to see it.'),
    },
    birth: {
      name: t('જન્મ', 'Birth'),
      title: t('જન્મ અને જ્યોતિષ', 'Birth and horoscope'),
      lead: t('ખબર ન હોય તો છોડી દો — પછી પણ ભરી શકાય.', 'Skip anything you don’t know — you can fill it later.'),
    },
    contact: {
      name: t('સંપર્ક', 'Contact'),
      title: t('કોનો સંપર્ક કરવો?', 'Who should families call?'),
      lead: t('નંબર ફક્ત બંને પરિવાર હા કહે પછી જ દેખાય છે.', 'The number is shown only after both families say yes.'),
    },
    photos: {
      name: t('ફોટો', 'Photos'),
      title: t('ફોટો અને જન્માક્ષર', 'Photos and janmakshar'),
      lead: t('ફોટો ધરાવતી પ્રોફાઇલને વધુ જવાબ મળે છે. તમે મંજૂરી આપો તેને જ દેખાય.', 'Profiles with a photo get more replies. Only people you approve see them.'),
    },
  };

  const savedLabel = {
    idle: t('આપમેળે સચવાય છે', 'Saves automatically'),
    saving: t('સાચવી રહ્યા છીએ…', 'Saving…'),
    saved: t('સચવાયું', 'Saved'),
    failed: t('સચવાયું નથી', 'Not saved'),
  }[saveState];

  const percent = completion(data);
  const tone = status === 'correction_requested' ? 'warn' : editable ? 'rose' : status === 'approved' ? 'green' : 'gold';

  /* ---------------------------------------------------------- fields --- */
  const label = (f: Field) => (en ? f.en : f.gu);
  const optionalMark = (f: Field, s: Step) => (!isRequired(f, data) && !('optional' in s && s.optional)
    ? <small> · {t('વૈકલ્પિક', 'optional')}</small>
    : null);

  function problem(f: Field) {
    const issue = issueFor.get(f.key);
    if (issue) return <p className="auth-error bio-field-error" role="alert"><CircleHelp size={17} /><span>{issue}</span></p>;
    if (errors.includes(f.key)) {
      return (
        <p className="auth-error bio-field-error" role="alert">
          <CircleHelp size={17} />
          <span>
            {f.key === 'height' ? t('ઊંચાઈ પસંદ કરો.', 'Choose a height.')
              : f.options ? t('એક પસંદ કરો.', 'Choose one.')
                : f.key === 'phone' || f.key === 'extraPhone' || f.key === 'fatherPhone' ? t('10 અંકનો મોબાઇલ નંબર લખો.', 'Enter a 10-digit mobile number.')
                  : t('સાચી વિગત લખો.', 'Enter a valid value.')}
          </span>
        </p>
      );
    }
    return null;
  }

  function renderField(key: string, s: Step) {
    const f = fieldByKey.get(key);
    if (!f) return null;
    const value = data[key] || '';
    const bad = errors.includes(key) || issueFor.has(key) ? ' invalid' : '';
    const id = `bio-${key}`;

    // Twelve signs are too many to tile; the phone's own picker suits them.
    if (f.options && key !== 'rashi') {
      const count = f.options.length;
      return (
        <fieldset key={key} className={`bio-field${jump?.key === key ? ' attention' : ''}`} data-field={key}>
          <legend className="auth-label">{label(f)}{optionalMark(f, s)}</legend>
          <div className={`bio-options n${count <= 3 ? count : 'x'}${bad}`}>
            {f.options.map(([v, gu, english], i) => (
              <label key={v} className={`auth-choice${value === v ? ' on' : ''}`}>
                <input
                  id={i === 0 ? id : undefined}
                  type="radio"
                  name={key}
                  value={v}
                  checked={value === v}
                  onChange={() => update(key, v)}
                  // A second tap on an optional answer takes it back.
                  onClick={() => { if (value === v && !isRequired(f, data)) update(key, ''); }}
                />
                {value === v && <i className="bio-tick" aria-hidden="true"><Check size={12} strokeWidth={3.5} /></i>}
                <span>{en ? english : gu}</span>
              </label>
            ))}
          </div>
          {problem(f)}
        </fieldset>
      );
    }

    if (f.options || key === 'height') {
      const options = key === 'height'
        ? [...HEIGHTS, ...(value && !HEIGHTS.some((h) => h.cm === value) ? [{ cm: value, label: feetAndInches(value) }] : [])]
          .sort((a, b) => Number(a.cm) - Number(b.cm))
          .map((h) => [h.cm, `${h.label}  ·  ${h.cm} ${t('સે.મી.', 'cm')}`])
        : f.options!.map(([v, gu, english]) => [v, en ? english : gu]);
      return (
        <div key={key} className={`bio-field${jump?.key === key ? ' attention' : ''}`} data-field={key}>
          <label className="auth-label" htmlFor={id}>
            {key === 'height' ? t('ઊંચાઈ', 'Height') : label(f)}{optionalMark(f, s)}
          </label>
          <div className={`auth-input select${bad}${value ? ' filled' : ''}`}>
            <select id={id} value={value} onChange={(e) => update(key, e.target.value)}>
              <option value="">{t('પસંદ કરો', 'Choose')}</option>
              {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
            </select>
          </div>
          {problem(f)}
        </div>
      );
    }

    if (f.type === 'number') {
      const n = value === '' ? null : Number(value);
      return (
        <fieldset key={key} className={`bio-field${jump?.key === key ? ' attention' : ''}`} data-field={key}>
          <legend className="auth-label">{key === 'brothers' ? t('ભાઈઓ', 'Brothers') : t('બહેનો', 'Sisters')}</legend>
          <div className="bio-stepper">
            <button
              type="button"
              aria-label={t('ઓછું', 'Fewer')}
              disabled={n === 0}
              onClick={() => update(key, String(n === null ? 0 : Math.max(0, n - 1)))}
            >
              <Minus size={18} />
            </button>
            <output id={id} tabIndex={-1} aria-live="polite">{n === null ? '–' : n}</output>
            <button
              type="button"
              aria-label={t('વધુ', 'More')}
              disabled={n !== null && n >= (f.max ?? 30)}
              onClick={() => update(key, String(n === null ? 1 : n + 1))}
            >
              <Plus size={18} />
            </button>
          </div>
        </fieldset>
      );
    }

    if (key === 'phone' || key === 'extraPhone' || key === 'fatherPhone') {
      return (
        <div key={key} className={`bio-field${jump?.key === key ? ' attention' : ''}`} data-field={key}>
          <label className="auth-label" htmlFor={id}>{label(f)}{optionalMark(f, s)}</label>
          <div className={`auth-phone${bad}${isValidLocalPhone(value) ? ' valid' : ''}`}>
            <span>+91</span>
            <input
              id={id}
              type="tel"
              inputMode="numeric"
              autoComplete={key === 'phone' ? 'tel-national' : 'off'}
              maxLength={16}
              placeholder="98765 43210"
              value={value}
              onChange={(e) => update(key, normalizeLocalPhone(e.target.value))}
              aria-invalid={Boolean(bad)}
            />
            <i className="auth-tick" aria-hidden="true"><Check size={16} strokeWidth={3} /></i>
          </div>
          {problem(f)}
        </div>
      );
    }

    if (key === 'birthtime') {
      const unknown = data.birthUnknown === 'yes';
      return (
        <div key={key} className={`bio-field${jump?.key === key ? ' attention' : ''}`} data-field={key}>
          <label className="auth-label" htmlFor={id}>{label(f)}</label>
          <div className="bio-time">
            <div className={`auth-input${bad}${unknown ? ' off' : ''}`}>
              <input id={id} type="time" value={value} disabled={unknown} onChange={(e) => update(key, e.target.value)} />
            </div>
            <label className={`auth-choice bio-unknown${unknown ? ' on' : ''}`}>
              <input type="checkbox" checked={unknown} onChange={(e) => update('birthUnknown', e.target.checked ? 'yes' : '')} />
              <span>{t('ખબર નથી', 'Not known')}</span>
            </label>
          </div>
          {problem(f)}
        </div>
      );
    }

    return (
      <div key={key} className={`bio-field${jump?.key === key ? ' attention' : ''}`} data-field={key}>
        <label className="auth-label" htmlFor={id}>{label(f)}{optionalMark(f, s)}</label>
        <div className={`auth-input${bad}`}>
          <input
            id={id}
            maxLength={150}
            enterKeyHint="next"
            placeholder={f.hint ? (en ? f.hint[1] : f.hint[0]) : undefined}
            value={value}
            onChange={(e) => update(key, e.target.value)}
            aria-invalid={Boolean(bad)}
          />
        </div>
        {problem(f)}
      </div>
    );
  }

  /* ---------------------------------------------------------- pieces --- */
  const identityCard = editingIdentity ? (
    <IdentityEditor
      lang={lang}
      candidateId={candidateId}
      current={shown}
      genderLocked={isSanatan(data)}
      onSaved={identitySaved}
      onCancel={() => setEditingIdentity(false)}
    />
  ) : (
    <div className={`bio-identity${changed ? ' changed' : ''}`}>
      <span className="bio-identity-icon"><ShieldCheck size={20} /></span>
      <div>
        <small>
          {applying
            ? t('નોંધણીની વિગતો', 'From the registration')
            : changed ? t('બદલેલું · એડમિન તપાસશે', 'Changed · an admin will check') : t('ચકાસેલું', 'Verified')}
        </small>
        <b>{shown.name}</b>
        <span>
          {[
            shown.dob && formatDate(shown.dob, lang),
            ageFrom(shown.dob) !== null && t(`${ageFrom(shown.dob)} વર્ષ`, `${ageFrom(shown.dob)} yrs`),
            shown.gender === 'male' ? t('પુરુષ', 'Male') : shown.gender === 'female' ? t('સ્ત્રી', 'Female') : null,
            shown.city,
            shown.father && `${t('પિતા', 'Father')}: ${shown.father}`,
          ].filter(Boolean).join(' · ')}
        </span>
      </div>
      {editable && (
        <button type="button" className="bio-link" onClick={changeIdentity}>
          <Pencil size={14} />{t('બદલો', 'Change')}
        </button>
      )}
    </div>
  );

  const note = (refusedChanges || decisionReason) && (
    <p className="auth-correction">
      <MessageSquareText size={18} />
      <span>
        <b>{refusedChanges ? t('તમારા છેલ્લા ફેરફાર મંજૂર ન થયા', 'Your last changes were not approved') : t('એડમિનનો સંદેશ', 'Message from the admin')}</b>
        {refusedChanges ?? decisionReason}
      </span>
    </p>
  );

  /* ---------------------------------------------------------- review --- */
  if (step === REVIEW) {
    const missing = (s: Step) => validateKeys(visibleKeys(s), data);
    const ready = STEPS.every((s) => missing(s).length === 0);

    return (
      <div ref={root} className={`member-screen bio-screen tone-${tone}`}>
        <div className="auth-top">
          <button type="button" className="round-button" aria-label={t('પાછળ', 'Back')} onClick={back}>
            <ArrowLeft size={20} />
          </button>
          <span className="auth-top-fill" />
          {editable && <SavePill state={saveState} label={savedLabel} />}
        </div>

        <div className="member-hero bio-hero">
          <div className="admin-hero-copy">
            <span className="admin-hello">
              <Sparkles size={15} />
              {!editable
                ? status === 'approved' ? t('મંજૂર', 'Approved') : t('સમીક્ષા હેઠળ', 'Under review')
                : live ? t('ફેરફાર ચાલુ છે', 'Making changes')
                  : ready ? t('બધું તૈયાર છે!', 'All set!') : t('લગભગ પૂરું', 'Nearly there')}
            </span>
            <h1>{editable ? t('એક વાર તપાસી લો', 'Check it once') : t('મારો બાયોડેટા', 'My biodata')}</h1>
            <p>
              {editable
                ? live
                  ? t('જે બદલવું હોય તે વિભાગ પર ટૅપ કરો. એડમિન મંજૂર કરે ત્યાં સુધી પરિવારોને મંજૂર બાયોડેટા જ દેખાશે.', 'Tap any section to change it. Families keep seeing the approved biodata until an admin approves your changes.')
                  : t('કંઈ બદલવું હોય તો તે વિભાગ પર ટૅપ કરો.', 'Tap any section to change it.')
                : status === 'approved'
                  ? live
                    ? t('આ બાયોડેટા મંજૂર થયો છે અને પરિવારોને દેખાય છે. કંઈ બદલવું હોય તો નીચે “વિગતો બદલો” દબાવો.', 'This biodata is approved and families can see it. To change anything, tap “Change details” below.')
                    : t('આ બાયોડેટા મંજૂર થયો છે અને પરિવારોને દેખાય છે.', 'This biodata is approved and families can see it.')
                  : live
                    ? t('એડમિન તમારા ફેરફાર તપાસી રહ્યા છે. ત્યાં સુધી પરિવારોને મંજૂર બાયોડેટા જ દેખાય છે.', 'An admin is checking your changes. Until then, families see the approved biodata.')
                    : t('એડમિન તપાસી રહ્યા છે. ત્યાં સુધી બદલી શકાતો નથી.', 'An admin is checking it. It can’t be changed until then.')}
            </p>
          </div>
          <span className="member-dial" style={{ '--p': percent } as React.CSSProperties} aria-label={t(`${percent}% પૂર્ણ`, `${percent}% complete`)}>
            <b>{percent}<small>%</small></b>
            <small>{t('પૂર્ણ', 'done')}</small>
          </span>
        </div>

        {note}
        {identityCard}

        <ul className="bio-summary">
          {STEPS.map((s, i) => {
            const gaps = missing(s);
            const flagged = visibleKeys(s).some((k) => issueFor.has(k));
            const rows = s.keys
              .filter((k) => !(NOT_WORKING.includes(data.work) && (k === 'role' || k === 'employer')))
              .map((k) => fieldByKey.get(k)!)
              .filter((f) => data[f.key] || gaps.includes(f.key));
            const Tag = editable ? 'button' : 'div';
            return (
              <li key={s.id} style={{ '--i': i } as React.CSSProperties}>
                <Tag
                  {...(editable ? { type: 'button' as const, onClick: () => edit(i) } : {})}
                  className={`bio-summary-card${gaps.length || flagged ? ' warn' : ''}`}
                >
                  <span className="bio-summary-head">
                    <span className="bio-summary-icon"><s.Icon size={18} /></span>
                    <b>{heads[s.id].title}</b>
                    {gaps.length || flagged
                      ? <em className="warn"><CircleAlert size={14} />{t('બાકી', 'To do')}</em>
                      : editable && <em><Pencil size={13} />{t('બદલો', 'Edit')}</em>}
                  </span>
                  {s.id === 'photos' ? (
                    <span className="bio-summary-rows">
                      <span>
                        <small>{t('ફોટો', 'Photos')}</small>
                        <span>{photos.length || t('હજી નથી', 'None yet')}</span>
                      </span>
                      <span>
                        <small>{t('જન્માક્ષર', 'Janmakshar')}</small>
                        <span>{kundali.length ? t('જોડ્યું', 'Added') : t('હજી નથી', 'None yet')}</span>
                      </span>
                    </span>
                  ) : rows.length === 0 ? (
                    <span className="bio-summary-empty">{t('હજી કંઈ ભર્યું નથી', 'Nothing filled in yet')}</span>
                  ) : (
                    <span className="bio-summary-rows">
                      {rows.map((f) => (
                        <span key={f.key} className={gaps.includes(f.key) || issueFor.has(f.key) ? 'missing' : undefined}>
                          <small>{f.key === 'height' ? t('ઊંચાઈ', 'Height') : label(f)}</small>
                          <span>
                            {data[f.key]
                              ? f.key === 'height'
                                ? `${feetAndInches(data[f.key])} · ${data[f.key]} ${t('સે.મી.', 'cm')}`
                                : f.key === 'phone' || f.key === 'extraPhone' || f.key === 'fatherPhone'
                                  ? formatPhone(data[f.key])
                                  : displayValue(f, data[f.key], en)
                              : t('ભરવાનું બાકી', 'Needed')}
                          </span>
                        </span>
                      ))}
                      {s.id === 'birth' && data.birthUnknown === 'yes' && (
                        <span><small>{t('જન્મ સમય', 'Birth time')}</small><span>{t('ખબર નથી', 'Not known')}</span></span>
                      )}
                    </span>
                  )}
                </Tag>
              </li>
            );
          })}
        </ul>

        {message && <p role="alert" className="auth-error"><CircleHelp size={18} /><span>{message}</span></p>}

        <div className="auth-actions bio-actions">
          {editable ? (
            <>
              <label className={`bio-confirm${accurate ? ' on' : ''}`}>
                <input type="checkbox" checked={accurate} onChange={(e) => setAccurate(e.target.checked)} />
                <i aria-hidden="true"><Check size={14} strokeWidth={3.5} /></i>
                <span>
                  <b>{t('મેં વિગતો તપાસી છે અને તે સાચી છે.', 'I have checked these details and they are correct.')}</b>
                  {applying && (
                    <small>{t('દસ્તાવેજ અને આ બાયોડેટા એકસાથે એડમિન પાસે જશે.', 'Your documents and this biodata go to the admin together.')}</small>
                  )}
                </span>
              </label>
              <button className="cta" type="button" disabled={!accurate || busy !== ''} onClick={() => void submit()}>
                {busy
                  ? <><span className="cta-spinner" aria-hidden="true" />{busy}</>
                  : <>
                    {status === 'correction_requested'
                      ? t('સુધારો મોકલો', 'Send the correction')
                      : live ? t('ફેરફાર મંજૂરી માટે મોકલો', 'Send changes for approval') : t('મંજૂરી માટે મોકલો', 'Send for approval')}
                    <Send size={18} />
                  </>}
              </button>
              <p className="auth-note muted">
                {live
                  ? t('એડમિન 24 કલાકમાં તપાસશે. મંજૂરી પછી નવી વિગતો પરિવારોને દેખાશે.', 'An admin checks them within 24 hours. Once approved, families see the new details.')
                  : t('એડમિન 24 કલાકમાં તપાસીને મંજૂરી આપે એટલે પ્રોફાઇલ દેખાવા લાગશે.', 'An admin checks it within 24 hours. Once approved, the profile is live.')}
              </p>
              {live && (
                <button type="button" className="bio-later" disabled={busy !== ''} onClick={() => void discardChanges()}>
                  {t('ફેરફાર રદ કરો', 'Discard changes')}
                </button>
              )}
            </>
          ) : live && status === 'approved' ? (
            <>
              <button className="cta" type="button" disabled={busy !== ''} onClick={() => void startEditing()}>
                {busy
                  ? <><span className="cta-spinner" aria-hidden="true" />{busy}</>
                  : <>{t('વિગતો બદલો', 'Change details')}<Pencil size={18} /></>}
              </button>
              <button type="button" className="bio-later" onClick={() => router.push(home)}>
                {t('હોમ પર જાઓ', 'Go home')}
              </button>
            </>
          ) : (
            <button className="cta" type="button" onClick={() => router.push(home)}>
              {t('હોમ પર જાઓ', 'Go home')}<ArrowRight size={20} />
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------------- steps --- */
  const s = STEPS[step];
  const head = heads[s.id];

  return (
    <div ref={root} className={`member-screen bio-screen tone-${tone}`}>
      <div className="auth-top">
        <button type="button" className="round-button" aria-label={step === 0 && !applying ? t('હોમ પર પાછા', 'Back to home') : t('પાછળ', 'Back')} onClick={back}>
          <ArrowLeft size={20} />
        </button>
        <div className="auth-progress">
          <p className="bio-progress-line">
            <span><b>{t(`પગલું ${step + 1}`, `Step ${step + 1}`)}</b> {t(`/ ${STEPS.length}`, `of ${STEPS.length}`)}</span>
            <SavePill state={saveState} label={savedLabel} />
          </p>
          <ol aria-hidden="true">
            {STEPS.map((item, i) => <li key={item.id} className={i <= step ? 'on' : undefined}><i /></li>)}
          </ol>
        </div>
      </div>

      <div key={step} className={`auth-step bio-step from-${direction}`}>
        <span className="auth-badge"><s.Icon size={26} /></span>
        <h1>{head.title}</h1>
        <p className="auth-lead">{head.lead}</p>
      </div>

      {status === 'correction_requested' && note}

      <div key={`f${step}`} className={`auth-fields bio-fields${shake ? ` shake${shake % 2 ? '' : ' again'}` : ''}`}>
        {s.id === 'family' ? (
          <>
            {visibleKeys(s).filter((k) => k !== 'brothers' && k !== 'sisters').map((k) => renderField(k, s))}
            <div className="bio-pair">
              {renderField('brothers', s)}
              {renderField('sisters', s)}
            </div>
          </>
        ) : s.id === 'photos' ? (
          <>
            <section className="bio-media">
              <h2><Camera size={18} />{t('ફોટો', 'Photographs')}</h2>
              <MediaUploader lang={lang} candidateId={candidateId} kind="photo" existing={photos} />
            </section>
            <section className="bio-media">
              <h2><Sparkles size={18} />{t('જન્માક્ષર', 'Janmakshar')} <small>· {t('વૈકલ્પિક', 'optional')}</small></h2>
              <MediaUploader lang={lang} candidateId={candidateId} kind="kundali" existing={kundali} />
            </section>
          </>
        ) : (
          visibleKeys(s).map((k) => renderField(k, s))
        )}

        {s.id === 'community' && !isSanatan(data) && (
          <p className="auth-hint">
            <Info size={15} />
            {t(
              'મોસાળ એટલે માતાના પિતાનું કુટુંબ. એક જ મોસાળ હોય તો સંબંધ થતો નથી, તેથી ખાતરી ન હોય તો પરિવારને પૂછી લો.',
              'Mosal is the maternal grandfather’s family. A shared mosal rules a match out, so check with the family if unsure.',
            )}
          </p>
        )}
        {s.id === 'contact' && (
          <p className="auth-hint">
            <LockKeyhole size={15} />
            {t('સંપર્ક પરસ્પર સંમતિ પછી જ દેખાશે.', 'Contacts are revealed only after mutual acceptance.')}
          </p>
        )}

        {message && <p role="alert" className="auth-error"><CircleHelp size={18} /><span>{message}</span></p>}
      </div>

      <div className="auth-actions bio-actions">
        <button className="cta" type="button" disabled={busy !== ''} onClick={next}>
          {fromReview
            ? <>{t('થઈ ગયું', 'Done')}<Check size={20} /></>
            : step === STEPS.length - 1
              ? <>{t('છેલ્લી તપાસ', 'Final check')}<ArrowRight size={20} /></>
              : <>{t('આગળ', 'Continue')}<ArrowRight size={20} /></>}
        </button>
        <button type="button" className="bio-later" disabled={busy !== ''} onClick={() => void finishLater()}>
          {busy || t('પછીથી પૂરું કરીશ', 'I’ll finish later')}
        </button>
      </div>
    </div>
  );
}

function SavePill({ state, label }: { state: string; label: string }) {
  return (
    <output className={`bio-saved ${state}`}>
      {state === 'saved' && <Check size={13} strokeWidth={3} />}
      {label}
    </output>
  );
}

/**
 * Where to open: the first screen a reviewer flagged, else the first one with
 * something missing, else — everything done — the final check.
 */
function startingStep(values: Values, flagged: string[]): number {
  const hideJob = NOT_WORKING.includes(values.work);
  const keysOf = (s: Step) => s.keys.filter((k) => !(hideJob && (k === 'role' || k === 'employer')));
  const issue = STEPS.findIndex((s) => keysOf(s).some((k) => flagged.includes(k)));
  if (issue !== -1) return issue;
  const gap = STEPS.findIndex((s) => validateKeys(keysOf(s), values).length > 0);
  if (gap !== -1) return gap;
  return REVIEW;
}
