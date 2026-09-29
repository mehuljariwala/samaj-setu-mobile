'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Check, CircleHelp, Eye, EyeOff, FileCheck2, FileStack, Heart,
  LockKeyhole, ShieldCheck, Smartphone, Upload, UserRound, Users, X,
} from 'lucide-react';

import { signUpAction } from '@/app/actions/auth';
import {
  attachCertificateAction, attachIdentityDocumentAction, startRegistrationAction,
  submitRegistrationAction, updateRegistrationAction,
} from '@/app/actions/registration';
import { DocumentCapture } from '@/components/app/document-capture';
import { RulesSheet } from '@/components/onboarding/rules-sheet';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { BUCKETS, CERTIFICATE_TYPES, MAX_UPLOAD_BYTES, objectPath } from '@/lib/storage';
import type { AttachedDocuments, IdentityType } from '@/lib/data/registration';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';
import { isValidLocalPhone } from '@/lib/phone';
import { RULES_VERSION } from '@/lib/rules';

const MIN_PASSWORD = 8;
const CITIES = ['Surat', 'Ahmedabad', 'Vadodara', 'Rajkot', 'Mumbai'];

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
  documents: AttachedDocuments;
  correctionFields: string[];
  decisionReason: string | null;
};

type Field =
  | 'phone' | 'password' | 'fullName' | 'dateOfBirth' | 'fatherName' | 'city'
  | 'certificate' | 'identityFront' | 'identityBack';

/** Which screen owns each field, so an error can send the member straight to it. */
const STEP_OF: Record<Field, number> = {
  phone: 0, password: 0, fullName: 1, dateOfBirth: 1, fatherName: 1, city: 1,
  certificate: 2, identityFront: 2, identityBack: 2,
};

/** The database names fields in snake_case; the form in camelCase. */
const FROM_SERVER: Record<string, Field> = {
  full_name: 'fullName', date_of_birth: 'dateOfBirth', father_name: 'fatherName', city: 'city',
  birth_certificate: 'certificate', identity_front: 'identityFront', identity_back: 'identityBack',
};

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/** A chosen file, with a preview URL when it is a photo. */
type Picked = { file: File; preview: string | null };

/** Swaps in a new pick, releasing the old preview's memory. */
function pick(file: File | null | undefined, previous: Picked | null): Picked | null {
  if (previous?.preview) URL.revokeObjectURL(previous.preview);
  if (!file) return null;
  return { file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null };
}

/**
 * Joining, start to finish, as three screens:
 *
 *   1. your account      mobile number and password
 *   2. who it is for     relationship, name, birth date, father's name, city
 *   3. documents         the birth certificate, and both sides of an Aadhaar
 *                        card or voter ID
 *
 * It used to be five screens on two pages — three on /sign-up for the
 * account, then a separate two-step /register that felt like being asked to
 * register again. Now it is one page, /register, and one counter.
 *
 * Screen 1 creates the account the moment it is left, because screens 2 and 3
 * need a signed-in account to save anything. Someone who stops after screen 1
 * is signed in with no application, so the next time they open the app they
 * land back here at screen 2.
 *
 * Submitting screen 3 is a sequence rather than one call, because the files
 * go to a bucket keyed on a candidate id that does not exist until the
 * application has been saved:
 *
 *   start_registration  →  upload + attach, once per file  →  submit
 *
 * An interruption partway leaves a draft, which is exactly what the member
 * returns to, with whatever already went up marked as attached.
 * `submit_registration` is the only call that starts the 24-hour review clock,
 * and it refuses until all three documents are recorded.
 */
export function JoinFlow({
  lang,
  signedIn,
  existing,
}: {
  lang: Lang;
  signedIn: boolean;
  /** The open draft or correction, if the account already has one. */
  existing: ExistingApplication | null;
}) {
  const t = translator(lang);
  const router = useRouter();

  // Once the account exists there is no going back to screen 1.
  const [hasAccount, setHasAccount] = useState(signedIn);
  const [step, setStep] = useState(signedIn ? 1 : 0);
  const [direction, setDirection] = useState<'next' | 'back'>('next');

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [relationship, setRelationship] = useState(existing?.relationship ?? 'son');
  const [gender, setGender] = useState<'male' | 'female'>(existing?.gender ?? 'female');
  const [fullName, setFullName] = useState(existing?.fullName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(existing?.dateOfBirth ?? '');
  const [fatherName, setFatherName] = useState(existing?.fatherName ?? '');
  const [city, setCity] = useState(existing?.city || 'Surat');
  const [certificate, setCertificate] = useState<Picked | null>(null);
  const [idType, setIdType] = useState<IdentityType>(existing?.documents.identityType ?? 'aadhaar');
  const [idFront, setIdFront] = useState<Picked | null>(null);
  const [idBack, setIdBack] = useState<Picked | null>(null);

  const [error, setError] = useState<{ field?: Field; message: string; conflict?: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [shake, setShake] = useState(0);

  const firstStep = hasAccount ? 1 : 0;

  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const birthRef = useRef<HTMLInputElement>(null);
  const fatherRef = useRef<HTMLInputElement>(null);
  const rulesRef = useRef<HTMLDialogElement>(null);

  // The account screen opens with the keyboard already up for the number.
  useEffect(() => {
    if (step === 0) phoneRef.current?.focus({ preventScroll: true });
  }, [step]);

  const phoneOk = isValidLocalPhone(phone);
  const passwordOk = password.length >= MIN_PASSWORD;
  const docs = existing?.documents;
  // A side already on file only counts if it is the kind of ID chosen now;
  // switching kind supersedes it on the server too.
  const sameCard = docs?.identityType === idType;
  const onFile = {
    certificate: Boolean(docs?.certificate),
    identityFront: Boolean(docs?.identityFront && sameCard),
    identityBack: Boolean(docs?.identityBack && sameCard),
  };

  /** son/daughter answer the gender question; "myself" has to be asked. */
  const impliedGender = relationship === 'son' ? 'male' : relationship === 'daughter' ? 'female' : null;
  const effectiveGender = impliedGender ?? gender;

  const screens = [
    {
      Icon: Smartphone,
      title: t('તમારું ખાતું બનાવો', 'Create your account'),
      lead: t('આ નંબર અને પાસવર્ડથી તમે લૉગ ઇન કરશો.', 'You will log in with this number and password.'),
    },
    {
      Icon: Users,
      title: t('પ્રોફાઇલ કોના માટે છે?', 'Who is this profile for?'),
      lead: t('ઉમેદવારની વિગતો — જન્મ પ્રમાણપત્ર મુજબ.', 'The candidate’s details, as on the birth certificate.'),
    },
    {
      Icon: FileStack,
      title: t('દસ્તાવેજ જોડો', 'Add the documents'),
      lead: t('એડમિન આ ત્રણેય એકસાથે જોઈને વિગતો ચકાસશે.', 'An admin looks at all three together to check the details.'),
    },
  ];
  const screen = screens[step];

  const invalid = (field: Field, dbName?: string) =>
    error?.field === field || (dbName && existing?.correctionFields.includes(dbName)) ? ' invalid' : '';

  const refs: Partial<Record<Field, React.RefObject<HTMLInputElement | null>>> = {
    phone: phoneRef, password: passwordRef, fullName: nameRef, dateOfBirth: birthRef, fatherName: fatherRef,
  };

  const fail = (field: Field | undefined, message: string, conflict = false) => {
    if (field && STEP_OF[field] !== step && STEP_OF[field] >= firstStep) {
      setDirection(STEP_OF[field] < step ? 'back' : 'next');
      setStep(STEP_OF[field]);
    }
    setError({ field, message, conflict });
    setShake((n) => n + 1);
    if (field) requestAnimationFrame(() => refs[field]?.current?.focus());
  };

  /** Checks one screen; the server re-validates everything. */
  const problem = (at: number): [Field, string] | null => {
    if (at === 0) {
      if (!phoneOk) return ['phone', t('દસ અંકનો મોબાઇલ નંબર લખો.', 'Enter a ten-digit mobile number.')];
      if (!passwordOk) return ['password', t('પાસવર્ડ ઓછામાં ઓછા 8 અક્ષરનો રાખો.', 'Use at least 8 characters.')];
    }
    if (at === 1) {
      if (fullName.trim().length < 2) return ['fullName', t('ઉમેદવારનું પૂરું નામ લખો.', 'Enter the candidate’s full name.')];
      if (!dateOfBirth) return ['dateOfBirth', t('જન્મ તારીખ પસંદ કરો.', 'Choose the date of birth.')];
      if (!fatherName.trim()) return ['fatherName', t('પિતાનું પૂરું નામ લખો.', 'Enter the father’s full name.')];
    }
    if (at === 2) {
      const files: [Field, Picked | null, boolean, string][] = [
        ['certificate', certificate, onFile.certificate, t('જન્મ પ્રમાણપત્ર જોડો.', 'Add the birth certificate.')],
        ['identityFront', idFront, onFile.identityFront, t('ઓળખપત્રની આગળની બાજુનો ફોટો જોડો.', 'Add a photo of the front of the ID.')],
        ['identityBack', idBack, onFile.identityBack, t('ઓળખપત્રની પાછળની બાજુનો ફોટો જોડો.', 'Add a photo of the back of the ID.')],
      ];
      for (const [field, picked, attached, missing] of files) {
        if (!picked && !attached) return [field, missing];
        if (picked && !CERTIFICATE_TYPES.includes(picked.file.type)) {
          return [field, t('PDF અથવા ફોટો જ ચાલશે.', 'Only a PDF or a photo can be uploaded.')];
        }
        if (picked && picked.file.size > MAX_UPLOAD_BYTES) {
          return [field, t('ફાઇલ 10 MB કરતાં નાની હોવી જોઈએ.', 'The file must be under 10 MB.')];
        }
      }
    }
    return null;
  };

  const back = () => {
    setError(null);
    setDirection('back');
    setStep((s) => s - 1);
  };

  async function createAccount() {
    setBusy(t('ખાતું બની રહ્યું છે…', 'Creating your account…'));
    const formData = new FormData();
    formData.set('phone', phone);
    formData.set('password', password);
    formData.set('rulesVersion', RULES_VERSION);
    const result = await signUpAction(null, formData);
    if (!result.ok) {
      setBusy('');
      if (result.code === 'conflict') {
        return fail('phone', t('આ નંબરનું ખાતું પહેલેથી છે.', 'That number already has an account.'), true);
      }
      // The server wants the rules accepted (say, a page open from before the
      // rules existed): show them again rather than a message with no way on.
      if (result.detail[0] === 'rules') {
        rulesRef.current?.showModal();
        rulesRef.current?.focus();
        return;
      }
      return fail((result.detail[0] as Field | undefined) ?? 'phone', result.message);
    }
    // Signed in now: carry on to screen 2 on the same page. The refresh only
    // re-renders the server parts, such as the top bar's sign-out button; this
    // component and what has been typed are kept.
    setBusy('');
    setHasAccount(true);
    setDirection('next');
    setStep(1);
    router.refresh();
  }

  async function submitApplication() {
    try {
      setBusy(t('વિગતો સચવાઈ રહી છે…', 'Saving the details…'));

      let applicationId = existing?.applicationId;
      let candidateId = existing?.candidateId;
      const details = {
        fullName, dateOfBirth, gender: effectiveGender, fatherName, city, nativePlace: city,
      };

      if (existing) {
        const updated = await updateRegistrationAction(existing.applicationId, details);
        if (!updated.ok) return fail(FROM_SERVER[updated.detail[0] ?? ''], updated.message);
      } else {
        const formData = new FormData();
        for (const [key, value] of Object.entries({ relationship, ...details })) formData.set(key, value);
        const created = await startRegistrationAction(null, formData);
        if (!created.ok) return fail(FROM_SERVER[created.detail[0] ?? ''], created.message);
        applicationId = created.data.applicationId;
        candidateId = created.data.candidateId;
      }

      if (!applicationId || !candidateId) {
        return fail(undefined, t('કંઈક ખોટું થયું. ફરી પ્રયાસ કરો.', 'Something went wrong. Please try again.'));
      }

      // Each file: straight to the private bucket from the browser, then
      // recorded by an RPC. The next one starts only when this one is in.
      const uploads: [Field, Picked | null, string][] = [
        ['certificate', certificate, t('પ્રમાણપત્ર અપલોડ થઈ રહ્યું છે…', 'Uploading the certificate…')],
        ['identityFront', idFront, t('ઓળખપત્રની આગળની બાજુ…', 'Uploading the ID front…')],
        ['identityBack', idBack, t('ઓળખપત્રની પાછળની બાજુ…', 'Uploading the ID back…')],
      ];
      for (const [field, picked, label] of uploads) {
        if (!picked) continue;
        setBusy(label);
        const { file } = picked;
        const path = objectPath(candidateId, file.name);
        const { error: uploadError } = await getSupabaseBrowserClient()
          .storage.from(BUCKETS.certificates)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) {
          return fail(field, t(
            'ફાઇલ અપલોડ થઈ શકી નથી. ફરી પ્રયાસ કરો.',
            'The file could not be uploaded. Please try again.',
          ));
        }

        const upload = { applicationId, candidateId, storagePath: path, mimeType: file.type, sizeBytes: file.size };
        const attached = field === 'certificate'
          ? await attachCertificateAction(upload)
          : await attachIdentityDocumentAction({
            ...upload, side: field === 'identityFront' ? 'front' : 'back', identityType: idType,
          });
        if (!attached.ok) return fail(field, attached.message);
      }

      setBusy(t('ચકાસણી માટે મોકલી રહ્યા છીએ…', 'Sending for verification…'));
      const submitted = await submitRegistrationAction(applicationId);
      if (!submitted.ok) {
        // `incomplete` names the missing fields; go to the first of them.
        return submitted.code === 'incomplete'
          ? fail(FROM_SERVER[submitted.detail[0] ?? ''], t('આ વિગત અથવા દસ્તાવેજ ખૂટે છે.', 'This detail or document is missing.'))
          : fail(undefined, submitted.message);
      }

      router.replace('/review');
    } catch (caught) {
      fail(undefined, caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy('');
    }
  }

  const onSubmit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const found = problem(step);
    if (found) return fail(...found);
    setError(null);
    // The rules come first: the account is created from inside the sheet.
    if (step === 0) {
      rulesRef.current?.showModal();
      rulesRef.current?.focus();
      return;
    }
    if (step === 1) {
      setDirection('next');
      setStep(2);
      return;
    }
    // Screen 3 also re-checks screen 2, in case a correction emptied a field.
    const earlier = problem(1);
    if (earlier) return fail(...earlier);
    void submitApplication();
  };

  const ctaLabel = step === 0
    ? t('ખાતું બનાવો', 'Create account')
    : step === 1
      ? t('આગળ', 'Continue')
      : existing?.correctionFields.length
        ? t('સુધારો મોકલો', 'Send the correction')
        : t('ચકાસણી માટે મોકલો', 'Send for verification');

  return (
    <>
      <form className="auth" noValidate onSubmit={onSubmit}>
        <div className="auth-top">
          {step > firstStep ? (
            <button type="button" className="round-button" aria-label={t('પાછળ', 'Back')} onClick={back}>
              <ArrowLeft size={20} />
            </button>
          ) : !hasAccount ? (
            <Link className="round-button" href="/" aria-label={t('પાછળ', 'Back')}>
              <ArrowLeft size={20} />
            </Link>
          ) : (
            // The account already exists, so there is nothing to go back to.
            <span className="round-button done" aria-hidden="true"><Check size={20} strokeWidth={2.6} /></span>
          )}
          <div className="auth-progress">
            <p>
              <b>{t(`પગલું ${step + 1}`, `Step ${step + 1}`)}</b> {t('/ 3', 'of 3')}
            </p>
            <ol aria-hidden="true">
              {screens.map((item, i) => <li key={item.title} className={i <= step ? 'on' : undefined}><i /></li>)}
            </ol>
          </div>
        </div>

        <div key={step} className={`auth-step from-${direction}`}>
          <span className="auth-badge"><screen.Icon size={26} /></span>
          <h1>{screen.title}</h1>
          <p className="auth-lead">{screen.lead}</p>
        </div>

        {/* What the admin asked for, above the fields they flagged. */}
        {step > 0 && existing?.decisionReason && (
          <p className="auth-correction">
            <CircleHelp size={18} />
            <span>{existing.decisionReason}</span>
          </p>
        )}

        <div className={`auth-fields${shake ? ` shake${shake % 2 ? '' : ' again'}` : ''}`}>
          {step === 0 && (
            <div key="account" className="auth-field">
              <label className="auth-label" htmlFor="phone">{t('મોબાઇલ નંબર', 'Mobile number')}</label>
              <div className={`auth-phone${invalid('phone')}${phoneOk ? ' valid' : ''}`}>
                <span>+91</span>
                <input
                  ref={phoneRef}
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  enterKeyHint="next"
                  maxLength={14}
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(event) => { setPhone(event.target.value); setError(null); }}
                  aria-invalid={error?.field === 'phone'}
                />
                <i className="auth-tick" aria-hidden="true"><Check size={16} strokeWidth={3} /></i>
              </div>

              <label className="auth-label spaced" htmlFor="password">{t('પાસવર્ડ બનાવો', 'Create a password')}</label>
              <div className={`auth-input${invalid('password')}`}>
                <input
                  ref={passwordRef}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  enterKeyHint="go"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setError(null); }}
                  aria-invalid={error?.field === 'password'}
                />
                <button
                  type="button"
                  className="auth-eye"
                  aria-label={showPassword ? t('પાસવર્ડ છુપાવો', 'Hide password') : t('પાસવર્ડ બતાવો', 'Show password')}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {/* Ticks as they type, so the rule is met rather than failed. */}
              <p className={`auth-rule${passwordOk ? ' met' : ''}`}>
                <span><Check size={13} strokeWidth={3} /></span>
                {t('ઓછામાં ઓછા 8 અક્ષર', 'At least 8 characters')}
              </p>
            </div>
          )}

          {step === 1 && (
            <div key="candidate" className="auth-field">
              {/* A correction cannot change who the profile is for. */}
              {!existing && (
                <fieldset className="auth-choices">
                  <legend className="auth-label">{t('પ્રોફાઇલ કોના માટે?', 'Profile for')}</legend>
                  {([
                    ['self', t('મારા માટે', 'Myself'), UserRound],
                    ['son', t('પુત્ર માટે', 'My son'), Users],
                    ['daughter', t('પુત્રી માટે', 'My daughter'), Heart],
                  ] as const).map(([value, label, Icon]) => (
                    <label key={value} className={`auth-choice${relationship === value ? ' on' : ''}`}>
                      <input
                        type="radio"
                        name="relationship"
                        value={value}
                        checked={relationship === value}
                        onChange={() => setRelationship(value)}
                      />
                      <Icon size={22} strokeWidth={1.8} />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
              )}

              {relationship === 'self' && (
                <fieldset className="auth-choices two">
                  <legend className="auth-label">{t('લિંગ', 'Gender')}</legend>
                  {([
                    ['female', t('સ્ત્રી', 'Female')],
                    ['male', t('પુરુષ', 'Male')],
                  ] as const).map(([value, label]) => (
                    <label key={value} className={`auth-choice${gender === value ? ' on' : ''}`}>
                      <input
                        type="radio"
                        name="gender"
                        value={value}
                        checked={gender === value}
                        onChange={() => setGender(value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
              )}

              <label className="auth-label spaced" htmlFor="candidate-name">
                {relationship === 'self' ? t('તમારું પૂરું નામ', 'Your full name') : t('ઉમેદવારનું પૂરું નામ', 'Candidate’s full name')}
              </label>
              <div className={`auth-input${invalid('fullName', 'full_name')}`}>
                <input
                  ref={nameRef}
                  id="candidate-name"
                  autoComplete={relationship === 'self' ? 'name' : 'off'}
                  enterKeyHint="next"
                  maxLength={160}
                  placeholder={t('પ્રમાણપત્ર મુજબ', 'As on the certificate')}
                  value={fullName}
                  onChange={(event) => { setFullName(event.target.value); setError(null); }}
                />
              </div>

              <label className="auth-label spaced" htmlFor="birth">{t('જન્મ તારીખ', 'Date of birth')}</label>
              <div className={`auth-input${invalid('dateOfBirth', 'date_of_birth')}`}>
                <input
                  ref={birthRef}
                  id="birth"
                  type="date"
                  max={LATEST_BIRTH_DATE}
                  value={dateOfBirth}
                  onChange={(event) => { setDateOfBirth(event.target.value); setError(null); }}
                />
              </div>

              <label className="auth-label spaced" htmlFor="father">{t('પિતાનું પૂરું નામ', 'Father’s full name')}</label>
              <div className={`auth-input${invalid('fatherName', 'father_name')}`}>
                <input
                  ref={fatherRef}
                  id="father"
                  enterKeyHint="next"
                  maxLength={160}
                  placeholder={t('પિતાનું નામ', 'Father’s name')}
                  value={fatherName}
                  onChange={(event) => { setFatherName(event.target.value); setError(null); }}
                />
              </div>

              <label className="auth-label spaced" htmlFor="city">{t('શહેર', 'City')}</label>
              <div className={`auth-input select${invalid('city', 'city')}`}>
                {/* A native select: the phone's own picker is the easiest one to use. */}
                <select id="city" value={city} onChange={(event) => setCity(event.target.value)}>
                  {CITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div key="documents" className="auth-field">
              <p className="auth-label">{t('જન્મ પ્રમાણપત્ર', 'Birth certificate')}</p>
              <UploadTile
                id="certificate"
                picked={certificate}
                attached={onFile.certificate}
                invalid={Boolean(invalid('certificate', 'birth_certificate'))}
                title={certificate?.file.name
                  ?? (onFile.certificate ? t('પ્રમાણપત્ર જોડાયેલું છે', 'Certificate attached') : t('ફાઇલ અથવા ફોટો પસંદ કરો', 'Choose a file or photo'))}
                detail={onFile.certificate && !certificate
                  ? t('બદલવા માટે નવી ફાઇલ પસંદ કરો.', 'Choose a new file to replace it.')
                  : t('PDF અથવા ફોટો, 10 MB સુધી.', 'PDF or photo, up to 10 MB.')}
                clearLabel={t('દૂર કરો', 'Remove')}
                onPick={(next) => { setCertificate(pick(next, certificate)); setError(null); }}
              />

              {/* Most people will photograph the certificate, but a PDF from a
                  municipal portal is common too; neither is the fallback. */}
              <DocumentCapture
                lang={lang}
                facing="environment"
                label={t('કૅમેરાથી ફોટો લો', 'Take a photo with the camera')}
                onCapture={(captured) => { setCertificate(pick(captured, certificate)); setError(null); }}
              />

              {/* Either card will do; both sides, so the admin sees the photo,
                  the name and the address together. */}
              <fieldset className="auth-choices two spaced">
                <legend className="auth-label">{t('ઓળખપત્ર', 'Photo ID')}</legend>
                {([
                  ['aadhaar', t('આધાર કાર્ડ', 'Aadhaar card')],
                  ['voter_id', t('મતદાર ઓળખપત્ર', 'Voter ID')],
                ] as const).map(([value, label]) => (
                  <label key={value} className={`auth-choice${idType === value ? ' on' : ''}`}>
                    <input
                      type="radio"
                      name="identity-type"
                      value={value}
                      checked={idType === value}
                      onChange={() => { setIdType(value); setError(null); }}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>

              <div className="auth-id-sides">
                {([
                  ['identityFront', idFront, setIdFront, t('આગળની બાજુ', 'Front side')],
                  ['identityBack', idBack, setIdBack, t('પાછળની બાજુ', 'Back side')],
                ] as const).map(([field, picked, setPicked, side]) => (
                  <UploadTile
                    key={field}
                    id={field}
                    compact
                    picked={picked}
                    attached={onFile[field]}
                    invalid={Boolean(invalid(field, 'identity_document'))}
                    title={side}
                    detail={picked?.file.name
                      ?? (onFile[field] ? t('જોડાયેલું છે', 'Attached') : t('ફોટો લો અથવા પસંદ કરો', 'Take or choose a photo'))}
                    clearLabel={t(`${side} દૂર કરો`, `Remove ${side.toLowerCase()}`)}
                    onPick={(next) => { setPicked(pick(next, picked)); setError(null); }}
                  />
                ))}
              </div>

              <p className="auth-hint">
                <LockKeyhole size={14} />
                {t(
                  'ફક્ત ચકાસણી કરનાર એડમિન જ આ ફાઇલો જોઈ શકે છે. અહીં લીધેલો ફોટો ગૅલેરીમાં સચવાતો નથી.',
                  'Only the verifying admin can open these files. A photo taken here is not saved to your gallery.',
                )}
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="auth-error">
              <CircleHelp size={18} />
              <span>
                {error.message}
                {error.conflict && <> <Link href="/sign-in">{t('લૉગ ઇન કરો', 'Log in')}</Link></>}
              </span>
            </p>
          )}
        </div>

        <div className="auth-actions">
          {step === 0 && (
            <p className="auth-note">
              <ShieldCheck size={16} />
              {t(
                'કોઈ OTP નથી — એડમિન જન્મ પ્રમાણપત્રથી ઓળખ ચકાસે છે.',
                'No OTP. An admin verifies you from your birth certificate.',
              )}
            </p>
          )}

          <button className="cta" type="submit" disabled={busy !== ''}>
            {busy ? (
              <><span className="cta-spinner" aria-hidden="true" />{busy}</>
            ) : (
              <>{ctaLabel}<ArrowRight size={20} /></>
            )}
          </button>

          {step === 0 && (
            <p className="auth-switch">
              {t('પહેલેથી ખાતું છે?', 'Already have an account?')}{' '}
              <Link href="/sign-in">{t('લૉગ ઇન કરો', 'Log in')}</Link>
            </p>
          )}
          {step === 2 && (
            <p className="auth-note muted">
              {t('24 કલાકમાં ચકાસણી થશે. પછી તમે બાયોડેટા ભરી શકશો.', 'Verified within 24 hours. Then you can fill in the biodata.')}
            </p>
          )}
        </div>
      </form>
      <RulesSheet lang={lang} dialogRef={rulesRef} onAgree={() => void createAccount()} />
    </>
  );
}

/**
 * One document: a big tap target that opens the phone's picker — which on a
 * phone offers the camera too — and, once chosen, a preview of the photo and
 * a way to take it back out.
 */
function UploadTile({
  id, picked, attached, invalid, compact = false, title, detail, clearLabel, onPick,
}: {
  id: string;
  picked: Picked | null;
  /** Already on the server from an earlier visit. */
  attached: boolean;
  invalid: boolean;
  compact?: boolean;
  title: string;
  detail: string;
  clearLabel: string;
  onPick: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const has = Boolean(picked || attached);

  return (
    <>
      <label
        className={`auth-upload${compact ? ' compact' : ''}${has ? ' attached' : ''}${invalid ? ' invalid' : ''}`}
        htmlFor={id}
      >
        {picked?.preview ? (
          <span className="auth-upload-thumb" style={{ backgroundImage: `url(${picked.preview})` }} />
        ) : (
          <span>{has ? <FileCheck2 size={22} /> : <Upload size={22} />}</span>
        )}
        <span>
          <b>{title}</b>
          <small>{detail}</small>
        </span>
        {picked && (
          <button
            type="button"
            className="auth-upload-clear"
            aria-label={clearLabel}
            onClick={(event) => {
              event.preventDefault();
              onPick(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
          >
            <X size={18} />
          </button>
        )}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(event) => onPick(event.target.files?.[0] ?? null)}
      />
    </>
  );
}
