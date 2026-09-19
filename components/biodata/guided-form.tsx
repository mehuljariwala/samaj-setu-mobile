'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Check, ChevronRight, ShieldCheck, Users, GraduationCap, Clock3, Heart,
  LockKeyhole, Save, Pencil, CircleCheck, UserRound, Phone, Info, CircleHelp, Send,
} from 'lucide-react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { MediaUploader, type UploadedMedia } from '@/components/app/media-uploader';
import { saveBiodataDraftAction, submitBiodataAction } from '@/app/actions/biodata';
import { requestIdentityChangeAction } from '@/app/actions/registration';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';
import {
  validateKeys, completion, displayValue, fieldByKey, persistable,
  type Values, type Field,
} from './model';

type Props = {
  lang: Lang;
  candidateId: string;
  revisionId: string | null;
  /** 'draft' | 'correction_requested' are editable; the rest are read-only. */
  status: string;
  initialValues: Values;
  verified: { name: string; dob: string; father: string; city: string };
  relation: string;
  decisionReason: string | null;
  /** Field-level issues the reviewer raised, in both languages (spec §10). */
  issues: { field_key: string; message_gu: string; message_en: string }[];
  photos: UploadedMedia[];
  kundali: UploadedMedia[];
};

/**
 * Visible sections. `keys` are always shown; `extra` sits behind the
 * "More details" toggle. Both are validated, so a section's status badge can
 * never disagree with the submit gate.
 */
const groups = [
  { id: 'personal', gu: 'વ્યક્તિગત વિગતો', en: 'Personal details', icon: UserRound, keys: ['gender', 'height', 'marital'], extra: ['diet'] },
  { id: 'community', gu: 'સમાજ અને મોસાળ', en: 'Community & mosal', icon: Users, keys: ['community', 'sect', 'surname', 'mosal'], extra: [] },
  { id: 'work', gu: 'અભ્યાસ અને વ્યવસાય', en: 'Education & work', icon: GraduationCap, keys: ['education', 'work'], extra: ['degree', 'role', 'employer'] },
  { id: 'family', gu: 'પરિવાર', en: 'Family', icon: Heart, keys: ['mother', 'native'], extra: ['brothers', 'sisters'] },
  { id: 'birth', gu: 'જન્મ અને જ્યોતિષ', en: 'Birth & astrology', icon: Clock3, keys: ['birthplace', 'birthtime'], extra: ['rashi', 'gan', 'mangal'] },
  { id: 'contact', gu: 'સંપર્ક અને ફોટા', en: 'Contact & photos', icon: Phone, keys: ['contactKind', 'phone'], extra: ['extraPhone'] },
];

const NONE = '__none';
/** Roles where an employer/role question does not apply. */
const NOT_WORKING = ['student', 'not_working'];
/** Long enough that typing a sentence is one write, short enough to feel safe. */
const AUTOSAVE_MS = 1200;

export function GuidedBiodata({
  lang, candidateId, revisionId, status, initialValues, verified, relation,
  decisionReason, issues, photos, kundali,
}: Props) {
  const t = translator(lang);
  const router = useRouter();

  const editable = status === 'draft' || status === 'correction_requested';

  const [data, setData] = useState<Values>(() => ({
    gender: relation === 'daughter' ? 'female' : relation === 'son' ? 'male' : '',
    contactKind: relation === 'self' ? 'self' : 'father',
    ...initialValues,
  }));
  const [open, setOpen] = useState<string[]>(() => [firstIncomplete(initialValues)]);
  const [extras, setExtras] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [reviewing, setReviewing] = useState(false);
  const [accurate, setAccurate] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValues = useRef<Values | null>(null);

  const issueFor = useMemo(
    () => new Map(issues.map((issue) => [issue.field_key, lang === 'en' ? issue.message_en : issue.message_gu])),
    [issues, lang],
  );

  /** Fields a group shows in the editor, honouring the work-status rule. */
  function visibleKeys(g: (typeof groups)[number]) {
    const hideJob = NOT_WORKING.includes(data.work);
    return [...g.keys, ...g.extra].filter((k) => !(hideJob && (k === 'role' || k === 'employer')));
  }

  /**
   * Autosave.
   *
   * The draft lives in `biodata_revisions`, not on this device, so it survives a
   * new phone and is visible to the admin queue — neither of which was true of
   * the localStorage draft this replaces. Only catalogue fields are sent:
   * `save_biodata_draft` rejects an unknown key outright.
   */
  function queueSave(next: Values) {
    pendingValues.current = next;
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(async () => {
      const values = pendingValues.current;
      if (!values) return;

      setSaveState('saving');
      const result = await saveBiodataDraftAction(candidateId, persistable(values));
      setSaveState(result.ok ? 'saved' : 'failed');
      if (!result.ok) setMessage(result.message);
    }, AUTOSAVE_MS);
  }

  // A draft in flight must not be lost to a navigation.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function update(k: string, v: string) {
    const nextData = { ...data, [k]: v };
    // Clearing these at the source keeps a stale employer out of the stored
    // draft and out of the review summary when the answer switches to "student".
    if (k === 'work' && NOT_WORKING.includes(v)) { nextData.role = ''; nextData.employer = ''; }
    setData(nextData);
    queueSave(nextData);
    setErrors((e) => e.filter((x) => x !== k));
    setAccurate(false);
    setMessage('');
  }

  function scrollTop() {
    requestAnimationFrame(() => root.current?.scrollIntoView({ block: 'start', behavior: 'instant' }));
  }

  /** A section is only "complete" when everything it shows validates. */
  function groupErrors(g: (typeof groups)[number]) {
    return validateKeys(visibleKeys(g), data);
  }

  function review() {
    const invalid = groups.flatMap((g) => groupErrors(g));
    setErrors([...new Set(invalid)]);

    if (invalid.length) {
      const i = Math.max(0, groups.findIndex((g) => visibleKeys(g).some((k) => invalid.includes(k))));
      setOpen([groups[i].id]);
      setExtras((current) => [
        ...new Set([...current, ...groups.filter((g) => g.extra.some((k) => invalid.includes(k))).map((g) => g.id)]),
      ]);
      setReviewing(false);
      setMessage(t('રંગથી દર્શાવેલી વિગતો પૂર્ણ કરો.', 'Please complete the highlighted details.'));
      scrollTop();
      return;
    }

    setReviewing(true);
    setMessage('');
    scrollTop();
  }

  /** Flushes the pending autosave and reports the actual result. */
  async function saveNow() {
    if (timer.current) clearTimeout(timer.current);
    setSaveState('saving');

    const result = await saveBiodataDraftAction(candidateId, persistable(data));
    setSaveState(result.ok ? 'saved' : 'failed');
    setMessage(result.ok
      ? t('ડ્રાફ્ટ સાચવ્યો. કોઈ પણ ઉપકરણ પરથી ચાલુ રાખી શકો છો.', 'Draft saved. You can continue from any device.')
      : result.message);
  }

  /**
   * Submitting is a server decision. The client-side check above is a courtesy;
   * `submit_biodata` re-validates every field against the catalogue and refuses
   * while anything is unconfirmed, so a stale form cannot slip past.
   */
  async function submit() {
    setSubmitting(true);
    setMessage('');

    const saved = await saveBiodataDraftAction(candidateId, persistable(data));
    if (!saved.ok) {
      setMessage(saved.message);
      setSubmitting(false);
      return;
    }

    const id = saved.data.revisionId ?? revisionId;
    if (!id) {
      setMessage(t('ડ્રાફ્ટ મળ્યો નથી.', 'No draft was found.'));
      setSubmitting(false);
      return;
    }

    const result = await submitBiodataAction(id);
    setSubmitting(false);

    if (!result.ok) {
      setMessage(
        result.code === 'incomplete'
          ? t('આ વિગતો ખૂટે છે: ', 'These details are missing: ') + result.detail.join(', ')
          : result.message,
      );
      setErrors(result.detail);
      setReviewing(false);
      scrollTop();
      return;
    }

    router.replace('/home');
  }

  function toggleExtra(id: string) {
    setExtras((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
  }

  function renderField(k: string) {
    const f = fieldByKey.get(k);
    if (!f) return null;

    const value = data[f.key] || '';
    const label = lang === 'en' ? f.en : f.gu;
    const issue = issueFor.get(f.key);
    const invalid = errors.includes(f.key) || Boolean(issue);
    const id = 'compact-' + f.key;
    const isPhone = f.key === 'phone' || f.key === 'extraPhone';
    const hintId = f.hint ? `${id}-hint` : undefined;
    const errId = invalid ? `${id}-err` : undefined;
    const describedBy = [errId, hintId].filter(Boolean).join(' ') || undefined;

    return (
      <div className={`compact-field ${f.wide ? 'wide' : ''}`} key={f.key}>
        <label htmlFor={id}>{label}{f.required && <span aria-hidden="true"> *</span>}</label>

        {f.options ? (
          <Select
            value={value || NONE}
            disabled={!editable}
            onValueChange={(v) => update(f.key, !v || v === NONE ? '' : String(v))}
          >
            <SelectTrigger id={id} className="field-select" aria-label={label} aria-invalid={invalid} aria-required={f.required} aria-describedby={describedBy}>
              <SelectValue>{value ? displayValue(f, value, lang === 'en') : t('પસંદ કરો', 'Select')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {!f.required && <SelectItem value={NONE}>{t('— કંઈ નહીં —', '— Not specified —')}</SelectItem>}
              {f.options.map(([v, gu, en]) => <SelectItem key={v} value={v}>{lang === 'en' ? en : gu}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <input
            id={id}
            className={`field ${invalid ? 'invalid' : ''}`}
            value={value}
            readOnly={!editable}
            onChange={(e) => update(f.key, e.target.value)}
            type={isPhone ? 'tel' : f.type === 'number' ? 'number' : f.type === 'time' ? 'time' : 'text'}
            min={f.min}
            max={f.max}
            inputMode={isPhone ? 'numeric' : undefined}
            /* maxLength is ignored by number/time inputs, so only apply it where it works. */
            maxLength={isPhone ? 10 : f.type === 'number' || f.type === 'time' ? undefined : 150}
            aria-invalid={invalid}
            aria-required={f.required}
            aria-describedby={describedBy}
            disabled={f.key === 'birthtime' && data.birthUnknown === 'yes'}
          />
        )}

        {f.key === 'height' && Number(value) >= 100 && Number(value) <= 250 && (
          <small>{Math.floor(Math.round(Number(value) / 2.54) / 12)}′ {Math.round(Number(value) / 2.54) % 12}″</small>
        )}
        {/* A reviewer's note is more useful than a generic validation message. */}
        {issue && <small className="bio-error" id={errId} role="alert">{issue}</small>}
        {!issue && errors.includes(f.key) && (
          <small className="bio-error" id={errId} role="alert">{t('માન્ય વિગત જરૂરી છે', 'Enter a valid value')}</small>
        )}
        {f.hint && !invalid && <small id={hintId}>{lang === 'en' ? f.hint[1] : f.hint[0]}</small>}
      </div>
    );
  }

  /** Rows for the review summary — same visibility rules as the editor. */
  function summaryRows(g: (typeof groups)[number]) {
    return visibleKeys(g)
      .map((k) => fieldByKey.get(k))
      .filter((f): f is Field => !!f)
      .filter((f) => data[f.key]);
  }

  const percent = completion(data);

  const savedLabel = {
    idle: t('ડ્રાફ્ટ આપમેળે સચવાય છે', 'Your draft saves automatically'),
    saving: t('સાચવી રહ્યા છીએ…', 'Saving…'),
    saved: t('સાચવ્યું', 'Saved'),
    failed: t('સાચવી શકાયું નથી', 'Could not save'),
  }[saveState];

  return (
    <div className="compact-bio" ref={root}>
      <div className="compact-title">
        <button className="icon-button" aria-label={t('હોમ પર પાછા', 'Back to home')} onClick={() => router.push('/home')}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1>{t('મારો બાયોડેટા', 'My biodata')}</h1>
          <p>
            {saveState === 'saved' ? <><Check size={12} />{savedLabel}</> : savedLabel}
          </p>
        </div>
        <span className="compact-percent">{percent}%</span>
      </div>

      <div className="compact-identity">
        <ShieldCheck size={19} />
        <div>
          <b>{verified.name}</b>
          <small>{verified.dob} · {verified.city}</small>
        </div>
        <button
          aria-label={t('ચકાસેલી વિગતો બદલો', 'Change verified details')}
          onClick={() => {
            if (!confirm(t(
              'ચકાસેલી વિગતો બદલવાથી ફરી એડમિન સમીક્ષા જરૂરી બનશે અને પ્રોફાઇલ ત્યાં સુધી છુપાઈ જશે. આગળ વધવું?',
              'Changing verified details means another admin review, and the profile is hidden until then. Continue?',
            ))) return;
            void requestIdentityChangeAction(
              candidateId,
              ['full_name', 'date_of_birth', 'father_name'],
              'The family asked to change the verified details.',
            ).then(() => router.push('/register'));
          }}
        >
          <Pencil size={16} />
        </button>
      </div>

      {/* Spec §10: the applicant-facing explanation, shown where they will act. */}
      {decisionReason && !editable && (
        <div className="note"><CircleHelp size={19} /><p>{decisionReason}</p></div>
      )}
      {decisionReason && editable && status === 'correction_requested' && (
        <div className="note"><Pencil size={19} /><p>{decisionReason}</p></div>
      )}

      {!editable && (
        <div className="note brand">
          <Send size={19} />
          <p>
            {status === 'approved'
              ? t('આ બાયોડેટા મંજૂર થયો છે. બદલવા માટે નવી આવૃત્તિ બનશે.', 'This biodata is approved. Editing it will create a new version for review.')
              : t('આ બાયોડેટા સમીક્ષા હેઠળ છે અને હાલ બદલી શકાતો નથી.', 'This biodata is under review and cannot be edited right now.')}
          </p>
        </div>
      )}

      {message && <output className="compact-message">{message}</output>}

      {reviewing ? (
        <div className="compact-review">
          <div className="compact-review-head">
            <h2>{t('એક નજરમાં સમીક્ષા', 'Review at a glance')}</h2>
            <button onClick={() => { setReviewing(false); scrollTop(); }}><Pencil size={15} />{t('સુધારો', 'Edit')}</button>
          </div>

          {groups.map((g) => (
            <section key={g.id}>
              <div>
                <h3>{lang === 'en' ? g.en : g.gu}</h3>
                <button
                  aria-label={t(`${g.gu} સુધારો`, `Edit ${g.en}`)}
                  onClick={() => { setReviewing(false); setOpen([g.id]); scrollTop(); }}
                >
                  <Pencil size={14} />
                </button>
              </div>
              <dl>
                {summaryRows(g).map((f) => (
                  <div key={f.key}>
                    <dt>{lang === 'en' ? f.en : f.gu}</dt>
                    <dd>{displayValue(f, data[f.key], lang === 'en')}</dd>
                  </div>
                ))}
              </dl>
              {g.id === 'contact' && (
                <p className="compact-help">
                  {photos.length > 0
                    ? t(`${photos.length} ફોટો જોડ્યા`, `${photos.length} photo(s) added`)
                    : t('ફોટો નથી', 'No photo')}
                  {' · '}
                  {t('ફોટો મંજૂરીથી જ', 'Photo access by permission')}
                </p>
              )}
            </section>
          ))}

          <label className="compact-check">
            <Checkbox checked={accurate} onCheckedChange={setAccurate} />
            <span>
              {t('મેં વિગતો ચકાસી છે અને તે સાચી છે.', 'I have checked these details and they are correct.')}
              <small>{t('આ ઉમેદવારની પ્રકાશન સંમતિ નથી — એ અલગ પગલું છે.', 'This is not the candidate’s publication consent — that is a separate step.')}</small>
            </span>
          </label>
        </div>
      ) : (
        <>
          <p className="compact-intro">{t('વિભાગ ખોલો અને વિગતો ભરો. * જરૂરી છે.', 'Open a section to fill it in. * Required.')}</p>

          <Accordion value={open} onValueChange={(v) => setOpen(v.slice(-1) as string[])} className="compact-sections">
            {groups.map((g) => {
              const GIcon = g.icon;
              const missing = groupErrors(g);
              const hasRequired = visibleKeys(g).some((k) => fieldByKey.get(k)?.required);
              const filled = visibleKeys(g).some((k) => data[k]);
              const shown = visibleKeys(g);
              const mainKeys = shown.filter((k) => !g.extra.includes(k));
              const extraKeys = shown.filter((k) => g.extra.includes(k));

              return (
                <AccordionItem key={g.id} value={g.id}>
                  <AccordionTrigger>
                    <span className="compact-section-icon"><GIcon size={19} /></span>
                    <span className="compact-section-name">
                      {lang === 'en' ? g.en : g.gu}
                      <small className={missing.length ? 'warn' : ''}>
                        {hasRequired
                          ? missing.length
                            ? t('વિગતો જરૂરી', 'Details needed')
                            : t('પૂર્ણ', 'Complete')
                          : missing.length
                            ? t('વિગત તપાસો', 'Check a value')
                            : t('વૈકલ્પિક', 'Optional')}
                      </small>
                    </span>
                    {missing.length
                      ? <span className="section-count">{missing.length}</span>
                      : filled ? <CircleCheck className="section-complete" size={18} /> : null}
                  </AccordionTrigger>

                  <AccordionContent>
                    <div className="compact-grid">{mainKeys.map(renderField)}</div>

                    {g.id === 'community' && (
                      <p className="compact-help">
                        <Info size={14} />
                        {t(
                          'મોસાળ એટલે માતાના પિતાનું કુટુંબ. એક જ મોસાળ સંબંધને બાકાત કરે છે, અને પુષ્ટિ ન થયેલી વિગત કોઈને પાત્ર ઠેરવતી નથી.',
                          'Mosal is the maternal grandfather’s family. A shared mosal excludes a match, and an unconfirmed value clears nobody.',
                        )}
                      </p>
                    )}

                    {g.id === 'family' && (
                      <p className="compact-help">{t('પિતા: ', 'Father: ')}{verified.father} · {t('ચકાસેલું', 'Verified')}</p>
                    )}

                    {g.id === 'birth' && (
                      <label className="compact-check">
                        <Checkbox
                          checked={data.birthUnknown === 'yes'}
                          onCheckedChange={(v) => {
                            const next = { ...data, birthUnknown: v ? 'yes' : '', birthtime: v ? '' : data.birthtime };
                            setData(next);
                            queueSave(next);
                          }}
                        />
                        <span>{t('જન્મ સમયની જાણ નથી', 'Birth time is unknown')}</span>
                      </label>
                    )}

                    {g.id === 'contact' && (
                      <>
                        <p className="compact-help">
                          <LockKeyhole size={14} />
                          {t('સંપર્ક પરસ્પર સંમતિ પછી જ દેખાશે.', 'Contacts are revealed only after mutual acceptance.')}
                        </p>
                        <MediaUploader lang={lang} candidateId={candidateId} kind="photo" existing={photos} />
                        <MediaUploader lang={lang} candidateId={candidateId} kind="kundali" existing={kundali} />
                      </>
                    )}

                    {extraKeys.length > 0 && (
                      <>
                        <button className="compact-extra" onClick={() => toggleExtra(g.id)} aria-expanded={extras.includes(g.id)}>
                          {extras.includes(g.id) ? '−' : '+'} {t('વધુ વિગતો (વૈકલ્પિક)', 'More details (optional)')}
                        </button>
                        {extras.includes(g.id) && <div className="compact-grid">{extraKeys.map(renderField)}</div>}
                      </>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </>
      )}

      {editable && (
        <footer className="compact-footer">
          <button className="compact-save" onClick={() => void saveNow()} aria-label={t('ડ્રાફ્ટ સાચવો', 'Save draft')}>
            <Save size={17} /><span>{t('સાચવો', 'Save')}</span>
          </button>
          {reviewing ? (
            <button className="primary" disabled={!accurate || submitting} onClick={() => void submit()}>
              {submitting ? t('મોકલી રહ્યા છીએ…', 'Submitting…') : t('સમીક્ષા માટે મોકલો', 'Send for review')}
              <Check size={17} />
            </button>
          ) : (
            <button className="primary" onClick={review}>{t('સમીક્ષા કરો', 'Review details')}<ChevronRight size={18} /></button>
          )}
        </footer>
      )}
    </div>
  );
}

/** Open the first section that still needs something, not always the first one. */
function firstIncomplete(values: Values): string {
  const found = groups.find((g) => validateKeys([...g.keys, ...g.extra], values).length > 0);
  return found?.id ?? 'personal';
}
