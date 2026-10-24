'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, CircleHelp, House, LockKeyhole, MapPin } from 'lucide-react';

import { saveLiveAddressAction } from '@/app/actions/biodata';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';
import { isRequired, steps, validateKeys, type Field, type Values } from './model';

const CURRENT = steps.find((s) => s.id === 'address')!.fields;
const NATIVE = steps.find((s) => s.id === 'native')!.fields;
const KEYS = [...CURRENT, ...NATIVE].map((f) => f.key);

/**
 * The full address on its own, for an approved biodata: it goes straight onto
 * the live version, with no new version and no admin approval, because other
 * families never see it (migration 20261024000200). The questions are the
 * form's own, from model.ts, so the two always ask the same thing.
 */
export function AddressForm({
  lang,
  candidateId,
  name,
  self,
  initialValues,
}: {
  lang: Lang;
  candidateId: string;
  name: string;
  self: boolean;
  initialValues: Values;
}) {
  const t = translator(lang);
  const en = lang === 'en';
  const router = useRouter();
  const [data, setData] = useState<Values>(initialValues);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function update(key: string, value: string) {
    setData((current) => ({ ...current, [key]: value }));
    setErrors((current) => current.filter((k) => k !== key));
    setMessage('');
  }

  function fail(keys: string[]) {
    setErrors(keys);
    setMessage(t('રંગથી દર્શાવેલી વિગત ભરો.', 'Please fill in the highlighted detail.'));
    const first = document.getElementById(`addr-${keys[0]}`);
    first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    first?.focus({ preventScroll: true });
  }

  async function save() {
    const values = Object.fromEntries(KEYS.map((k) => [k, (data[k] ?? '').trim()]));
    const invalid = validateKeys(KEYS, values);
    if (invalid.length) return fail(invalid);

    setBusy(true);
    const result = await saveLiveAddressAction(candidateId, values);
    setBusy(false);
    if (!result.ok) {
      if (result.code === 'incomplete' && result.detail.length) return fail(result.detail);
      setMessage(result.message);
      return;
    }
    setSaved(true);
  }

  function renderField(f: Field, optionalMarks: boolean) {
    const value = data[f.key] ?? '';
    const bad = errors.includes(f.key);
    const id = `addr-${f.key}`;
    return (
      <div key={f.key} className="bio-field" data-field={f.key}>
        <label className="auth-label" htmlFor={id}>
          {en ? f.en : f.gu}
          {optionalMarks && !isRequired(f, data) && <small> · {t('વૈકલ્પિક', 'optional')}</small>}
        </label>
        <div className={`auth-input${bad ? ' invalid' : ''}`}>
          <input
            id={id}
            maxLength={f.type === 'pin' ? 6 : 150}
            inputMode={f.type === 'pin' ? 'numeric' : undefined}
            autoComplete={f.autoComplete}
            enterKeyHint="next"
            placeholder={f.hint ? (en ? f.hint[1] : f.hint[0]) : undefined}
            value={value}
            onChange={(e) => update(f.key, f.type === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value)}
            aria-invalid={bad}
          />
        </div>
        {bad && (
          <p className="auth-error bio-field-error" role="alert">
            <CircleHelp size={17} />
            <span>
              {!value.trim() ? t('આ વિગત ભરો.', 'Fill this in.')
                : f.type === 'pin' ? t('6 અંકનો પિન કોડ લખો.', 'Enter the 6-digit PIN code.')
                  : t('સાચી વિગત લખો.', 'Enter a valid value.')}
            </span>
          </p>
        )}
      </div>
    );
  }

  if (saved) {
    return (
      <div className="member-screen bio-screen tone-green">
        <div className="auth-step bio-step from-next">
          <span className="auth-badge"><Check size={26} /></span>
          <h1>{t('સરનામું સચવાયું', 'Address saved')}</h1>
          <p className="auth-lead">
            {t(
              'તે બાયોડેટામાં ઉમેરાઈ ગયું છે. એડમિનની મંજૂરી જોઈતી નથી, અને બીજા પરિવારોને તે દેખાતું નથી.',
              'It is on the biodata now. No admin approval is needed, and other families do not see it.',
            )}
          </p>
        </div>
        <div className="auth-actions bio-actions">
          <button className="cta" type="button" onClick={() => router.push('/home')}>
            {t('હોમ પર જાઓ', 'Go home')}<ArrowRight size={20} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="member-screen bio-screen tone-rose">
      <div className="auth-top">
        <button type="button" className="round-button" aria-label={t('પાછળ', 'Back')} onClick={() => router.push('/home')}>
          <ArrowLeft size={20} />
        </button>
        <span className="auth-top-fill" />
      </div>

      <div className="auth-step bio-step from-next">
        <span className="auth-badge"><MapPin size={26} /></span>
        <h1>{t('પૂરું સરનામું', 'Full address')}</h1>
        <p className="auth-lead">
          {self
            ? t('તમારા બાયોડેટા માટે. ', 'For your biodata. ')
            : t(`${name}ના બાયોડેટા માટે. `, `For ${name}’s biodata. `)}
          {t(
            'સાચવતાં જ ઉમેરાઈ જશે, એડમિનની મંજૂરી વગર.',
            'It is added as soon as you save, with no admin approval.',
          )}
        </p>
      </div>

      <div className="auth-fields bio-fields">
        <h2 className="bio-group-title"><MapPin size={18} />{t('હાલનું સરનામું', 'Current address')}</h2>
        {CURRENT.map((f) => renderField(f, true))}
        <h2 className="bio-group-title">
          <House size={18} />{t('મૂળ વતનનું સરનામું', 'Native address')} <small>· {t('વૈકલ્પિક', 'optional')}</small>
        </h2>
        <p className="auth-hint">
          {t('હાલના સરનામા જેવું જ હોય તો છોડી દો.', 'Skip it if it is the same as the current address.')}
        </p>
        {NATIVE.map((f) => renderField(f, false))}
        <p className="auth-hint">
          <LockKeyhole size={15} />
          {t('સરનામું ફક્ત એડમિન જુએ છે, બીજા પરિવારો નહીં.', 'Only an admin sees the address, not other families.')}
        </p>
        {message && <p role="alert" className="auth-error"><CircleHelp size={18} /><span>{message}</span></p>}
      </div>

      <div className="auth-actions bio-actions">
        <button className="cta" type="button" disabled={busy} onClick={() => void save()}>
          {busy
            ? <><span className="cta-spinner" aria-hidden="true" />{t('સાચવી રહ્યા છીએ…', 'Saving…')}</>
            : <>{t('સરનામું સાચવો', 'Save the address')}<Check size={20} /></>}
        </button>
      </div>
    </div>
  );
}
