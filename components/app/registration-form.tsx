'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, CircleHelp, FileCheck2, Heart, LockKeyhole,
  ShieldCheck, Upload, UserRound, Users, X,
} from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  attachCertificateAction, startRegistrationAction, submitRegistrationAction,
  updateRegistrationAction,
} from '@/app/actions/registration';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { BUCKETS, CERTIFICATE_TYPES, MAX_UPLOAD_BYTES, objectPath } from '@/lib/storage';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

const STEPS = 2;

/**
 * Computed once at module load rather than per render: calling Date.now()
 * during render makes the output depend on when React happens to re-run, which
 * the React compiler flags as impure. A day's drift in the maximum selectable
 * birth date is not worth an unstable render.
 */
const LATEST_BIRTH_DATE = new Date(Date.now() - 18 * 365.25 * 86_400_000)
  .toISOString()
  .slice(0, 10);

export type ExistingApplication = {
  applicationId: string;
  candidateId: string;
  fullName: string;
  dateOfBirth: string;
  fatherName: string;
  city: string;
  gender: 'male' | 'female';
  relationship: string;
  hasCertificate: boolean;
  correctionFields: string[];
  decisionReason: string | null;
};

/**
 * Registration, in the two grouped steps the prototype settled on.
 *
 * Submitting is a sequence rather than one call, because the certificate has to
 * go to a bucket keyed on a candidate id that does not exist until the first
 * step has been saved:
 *
 *   start_registration  →  upload to storage  →  attach_certificate  →  submit
 *
 * An interruption partway leaves a draft application, which is exactly what the
 * applicant returns to. Nothing is lost and nothing looks finished that is not —
 * `submit_registration` is the only call that starts the 24-hour review clock,
 * and it refuses until the certificate row exists.
 */
export function RegistrationForm({
  lang,
  existing,
}: {
  lang: Lang;
  existing: ExistingApplication | null;
}) {
  const t = translator(lang);
  const router = useRouter();

  // A correction only ever concerns the identity details, so reopen at step 2.
  const [step, setStep] = useState(existing ? 1 : 0);
  const [relationship, setRelationship] = useState(existing?.relationship ?? 'son');
  const [gender, setGender] = useState<'male' | 'female'>(existing?.gender ?? 'female');
  const [fullName, setFullName] = useState(existing?.fullName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(existing?.dateOfBirth ?? '');
  const [city, setCity] = useState(existing?.city ?? 'Surat');
  const [fatherName, setFatherName] = useState(existing?.fatherName ?? '');
  const [file, setFile] = useState<File | null>(null);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const needsCertificate = !existing?.hasCertificate && !file;

  /** son/daughter answer the gender question; "myself" has to be asked. */
  const impliedGender = relationship === 'son' ? 'male' : relationship === 'daughter' ? 'female' : null;
  const effectiveGender = impliedGender ?? gender;

  const flagged = (field: string) =>
    existing?.correctionFields.includes(field) ? 'field invalid' : 'field';

  function next() {
    setError('');
    if (fullName.trim().length < 2) {
      setError(t('ઉમેદવારનું નામ લખો.', 'Enter the candidate’s name.'));
      return;
    }
    setStep(1);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  async function submit() {
    setError('');

    if (!dateOfBirth || !fatherName.trim()) {
      setError(t('જન્મ તારીખ અને પિતાનું નામ જરૂરી છે.', 'Birth date and father’s name are required.'));
      return;
    }
    if (needsCertificate) {
      setError(t('જન્મ પ્રમાણપત્ર જરૂરી છે.', 'The birth certificate is required.'));
      return;
    }
    if (file && !CERTIFICATE_TYPES.includes(file.type)) {
      setError(t('PDF અથવા ફોટો જ ચાલશે.', 'Only a PDF or a photo can be uploaded.'));
      return;
    }
    if (file && file.size > MAX_UPLOAD_BYTES) {
      setError(t('ફાઇલ 10 MB કરતાં નાની હોવી જોઈએ.', 'The file must be under 10 MB.'));
      return;
    }

    try {
      // ------------------------------------------------ 1. the application
      setBusy(t('વિગતો સાચવી રહ્યા છીએ…', 'Saving your details…'));

      let applicationId = existing?.applicationId;
      let candidateId = existing?.candidateId;

      if (existing) {
        const updated = await updateRegistrationAction(existing.applicationId, {
          fullName,
          dateOfBirth,
          gender: effectiveGender,
          fatherName,
          city,
          nativePlace: city,
        });
        if (!updated.ok) throw new Error(updated.message);
      } else {
        const created = await startRegistrationAction(
          null,
          formDataOf({
            relationship,
            fullName,
            dateOfBirth,
            gender: effectiveGender,
            fatherName,
            city,
            nativePlace: city,
          }),
        );
        if (!created.ok) throw new Error(created.message);
        applicationId = created.data.applicationId;
        candidateId = created.data.candidateId;
      }

      if (!applicationId || !candidateId) {
        throw new Error(t('કંઈક ખોટું થયું.', 'Something went wrong.'));
      }

      // -------------------------------------------------- 2. the certificate
      if (file) {
        setBusy(t('પ્રમાણપત્ર અપલોડ થઈ રહ્યું છે…', 'Uploading the certificate…'));

        const path = objectPath(candidateId, file.name);
        const { error: uploadError } = await getSupabaseBrowserClient()
          .storage.from(BUCKETS.certificates)
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadError) {
          throw new Error(
            t(
              'પ્રમાણપત્ર અપલોડ થઈ શક્યું નથી. ફરી પ્રયાસ કરો.',
              'The certificate could not be uploaded. Please try again.',
            ),
          );
        }

        const attached = await attachCertificateAction({
          applicationId,
          candidateId,
          storagePath: path,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        if (!attached.ok) throw new Error(attached.message);
      }

      // ------------------------------------------------------- 3. submit it
      setBusy(t('ચકાસણી માટે મોકલી રહ્યા છીએ…', 'Submitting for verification…'));

      const submitted = await submitRegistrationAction(applicationId);
      if (!submitted.ok) {
        // `incomplete: full_name,city` names the fields, so say which.
        throw new Error(
          submitted.code === 'incomplete'
            ? t('આ વિગતો ખૂટે છે: ', 'These details are missing: ') + submitted.detail.join(', ')
            : submitted.message,
        );
      }

      router.replace('/review');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="screen-pad">
      <div className="reg-top">
        <button
          className="icon-button"
          aria-label={t('પાછા', 'Back')}
          onClick={() => (step > 0 && !existing ? setStep(0) : router.back())}
        >
          <ArrowLeft size={20} />
        </button>
        <span>
          {t('સભ્ય નોંધણી', 'Member registration')} <b>{step + 1}/{STEPS}</b>
        </span>
        <ShieldCheck size={18} />
      </div>
      <Progress
        value={((step + 1) / STEPS) * 100}
        aria-label={t('નોંધણી પ્રગતિ', 'Registration progress')}
        className="step-progress"
      />

      <div className="page-title">
        <span className="eyebrow">
          {step === 0 ? t('પગલું 1 · પરિચય', 'Step 1 · About you') : t('પગલું 2 · ઓળખ', 'Step 2 · Identity')}
        </span>
        <h1>{step === 0 ? t('પ્રોફાઇલ કોના માટે?', 'Who is this for?') : t('ઓળખની ખાતરી કરીએ.', 'Let’s confirm the identity.')}</h1>
        <p>
          {step === 0
            ? t('ઉમેદવાર કોણ છે અને તમારો સંબંધ — બસ આટલું.', 'Who the candidate is, and how you are related. That’s all.')
            : t('એડમિન આ વિગતો પ્રમાણપત્ર સામે ચકાસશે.', 'An admin will check these against the certificate.')}
        </p>
      </div>

      {/* What the admin asked for, alongside the fields they flagged. */}
      {existing?.decisionReason && (
        <div className="note">
          <CircleHelp size={19} />
          <p>{existing.decisionReason}</p>
        </div>
      )}

      <form onSubmit={(event) => { event.preventDefault(); if (step === 0) next(); else void submit(); }}>
        {step === 0 && (
          <>
            <label className="field-label">{t('પ્રોફાઇલ કોના માટે છે?', 'Who is the profile for?')}</label>
            <RadioGroup
              value={relationship}
              onValueChange={(value) => setRelationship(String(value))}
              className="segmented"
              aria-label={t('પ્રોફાઇલ કોના માટે', 'Profile for')}
            >
              {([
                ['self', t('મારા માટે', 'Myself'), UserRound],
                ['son', t('પુત્ર માટે', 'My son'), Users],
                ['daughter', t('પુત્રી માટે', 'My daughter'), Heart],
              ] as const).map(([value, label, Icon]) => (
                <label className={relationship === value ? 'on' : ''} key={value}>
                  <Icon size={21} strokeWidth={1.7} />
                  <span>{label}</span>
                  <RadioGroupItem value={value} aria-label={label} />
                </label>
              ))}
            </RadioGroup>

            <label className="field-label" htmlFor="candidate-name">
              {t('ઉમેદવારનું પૂરું નામ', 'Candidate’s full name')} <span>*</span>
            </label>
            <input
              className={flagged('full_name')}
              id="candidate-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder={t('પ્રમાણપત્ર મુજબ', 'As on the certificate')}
              maxLength={160}
            />
            <p className="field-hint">
              {t('પ્રમાણપત્ર પરના નામ સાથે મેળ ખાવું જોઈએ.', 'This must match the name on the certificate.')}
            </p>

            {/* Only asked when the relationship does not already answer it. */}
            {relationship === 'self' && (
              <>
                <label className="field-label">{t('લિંગ', 'Gender')} <span>*</span></label>
                <RadioGroup
                  value={gender}
                  onValueChange={(value) => setGender(String(value) as 'male' | 'female')}
                  className="segmented"
                  aria-label={t('લિંગ', 'Gender')}
                >
                  {([
                    ['female', t('સ્ત્રી', 'Female')],
                    ['male', t('પુરુષ', 'Male')],
                  ] as const).map(([value, label]) => (
                    <label className={gender === value ? 'on' : ''} key={value}>
                      <span>{label}</span>
                      <RadioGroupItem value={value} aria-label={label} />
                    </label>
                  ))}
                </RadioGroup>
              </>
            )}

            <div className="note brand">
              <ShieldCheck size={19} />
              <p>
                {t(
                  'કોઈ OTP નથી. તમારી ઓળખ જન્મ પ્રમાણપત્રથી એડમિન ચકાસે છે — એ જ આપણી ખરી સુરક્ષા છે.',
                  'No OTP needed. An admin verifies you against your birth certificate — that is the real safeguard here.',
                )}
              </p>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="two-fields">
              <div>
                <label className="field-label" htmlFor="birth">
                  {t('જન્મ તારીખ', 'Date of birth')} <span>*</span>
                </label>
                <input
                  className={flagged('date_of_birth')}
                  id="birth"
                  type="date"
                  max={LATEST_BIRTH_DATE}
                  value={dateOfBirth}
                  onChange={(event) => setDateOfBirth(event.target.value)}
                />
              </div>
              <div>
                <label className="field-label">{t('શહેર', 'City')} <span>*</span></label>
                <Select value={city} onValueChange={(value) => value && setCity(String(value))}>
                  <SelectTrigger className="field-select" aria-label={t('શહેર', 'City')}>
                    <SelectValue>{city}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {['Surat', 'Ahmedabad', 'Vadodara', 'Rajkot', 'Mumbai'].map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="field-label" htmlFor="father">
              {t('પિતાનું પૂરું નામ', 'Father’s full name')} <span>*</span>
            </label>
            <input
              id="father"
              className={flagged('father_name')}
              value={fatherName}
              onChange={(event) => setFatherName(event.target.value)}
              placeholder={t('પિતાનું નામ', 'Father’s name')}
              maxLength={160}
            />

            <label className="field-label" htmlFor="certificate">
              {t('જન્મ પ્રમાણપત્ર', 'Birth certificate')} <span>*</span>
            </label>
            <label className={`upload-box ${file || existing?.hasCertificate ? 'attached' : ''}`} htmlFor="certificate">
              <span>{file || existing?.hasCertificate ? <FileCheck2 size={21} /> : <Upload size={21} />}</span>
              <div>
                <b>
                  {file?.name
                    ?? (existing?.hasCertificate
                      ? t('પ્રમાણપત્ર જોડાયેલું છે', 'Certificate attached')
                      : t('ફાઇલ પસંદ કરો', 'Choose a file'))}
                </b>
                <small>
                  {existing?.hasCertificate && !file
                    ? t('બદલવા માટે નવી ફાઇલ પસંદ કરો.', 'Choose a new file to replace it.')
                    : t('PDF અથવા ફોટો, 10 MB સુધી.', 'PDF or photo, up to 10 MB.')}
                </small>
              </div>
              {file && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t('પ્રમાણપત્ર દૂર કરો', 'Remove certificate')}
                  onClick={(event) => { event.preventDefault(); setFile(null); }}
                >
                  <X size={18} />
                </button>
              )}
            </label>
            <input
              id="certificate"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              hidden
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <p className="field-hint inline-icon">
              <LockKeyhole size={12} />
              {t(
                'ફક્ત ચકાસણી માટેના એડમિન જોઈ શકશે. તમે પણ પછીથી આ ફાઇલ જોઈ શકશો નહીં.',
                'Only verification admins can open this. You will not be able to view it again either.',
              )}
            </p>
          </>
        )}

        {error && (
          <p role="alert" className="error">
            <CircleHelp size={17} />
            {error}
          </p>
        )}

        <div className="form-foot">
          <button className="primary" type="submit" disabled={busy !== ''}>
            {busy || (step === 0 ? t('આગળ વધો', 'Continue') : t('ચકાસણી માટે મોકલો', 'Submit for verification'))}
            <ArrowRight size={19} />
          </button>
          <p>
            <ShieldCheck size={13} />
            {t('તમારી માહિતી, તમારી સુરક્ષા.', 'Your information, protected.')}
          </p>
        </div>
      </form>
    </section>
  );
}

/** The action takes FormData because it is also usable from a plain form post. */
function formDataOf(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}
