'use client';

import { useState } from 'react';
import { Check, CircleHelp, Info } from 'lucide-react';

import { proposeDetailChangesAction } from '@/app/actions/biodata';
import { CITIES, LATEST_BIRTH_DATE } from '@/lib/candidate-details';
import type { DetailChanges } from '@/lib/data/biodata';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

export type IdentityDetails = { name: string; dob: string; father: string; city: string; gender?: string };

/**
 * An approved family's registration details, opened in place on the biodata
 * screen. Saving records them on the open biodata version; they reach the
 * profile only when an admin approves that version, after checking them
 * against the documents already on file.
 */
export function IdentityEditor({
  lang, candidateId, current, genderLocked, onSaved, onCancel,
}: {
  lang: Lang;
  candidateId: string;
  /** What the family sees now: the approved details with any earlier change over them. */
  current: IdentityDetails;
  /** A Sanatan daughter is a girl; only an admin changes that. */
  genderLocked: boolean;
  onSaved: (pending: DetailChanges) => void;
  onCancel: () => void;
}) {
  const t = translator(lang);
  const [name, setName] = useState(current.name);
  const [dob, setDob] = useState(current.dob);
  const [gender, setGender] = useState(current.gender ?? '');
  const [father, setFather] = useState(current.father);
  const [city, setCity] = useState(current.city);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // A city typed in before the list existed stays choosable.
  const cities = city && !CITIES.includes(city) ? [city, ...CITIES] : CITIES;

  async function save() {
    if (name.trim().length < 2) return setError(t('પૂરું નામ લખો.', 'Enter the full name.'));
    if (!dob || dob > LATEST_BIRTH_DATE) return setError(t('સાચી જન્મ તારીખ પસંદ કરો.', 'Choose a valid date of birth.'));
    if (father.trim() && father.trim().length < 2) return setError(t('પિતાનું પૂરું નામ લખો.', 'Enter the father’s full name.'));

    setBusy(true);
    const result = await proposeDetailChangesAction(candidateId, {
      full_name: name.trim(),
      date_of_birth: dob,
      gender: genderLocked ? undefined : gender || undefined,
      father_name: father.trim() || undefined,
      city: city || undefined,
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onSaved(result.data);
  }

  return (
    <div className="bio-identity-edit">
      <p className="auth-hint">
        <Info size={15} />
        {t(
          'એડમિન આ ફેરફાર દસ્તાવેજ સાથે મેળવીને મંજૂર કરશે. ત્યાં સુધી પરિવારોને હાલની વિગતો જ દેખાશે.',
          'An admin checks these against the documents before approving. Until then families see the details as they are now.',
        )}
      </p>

      <label className="auth-label spaced" htmlFor="edit-name">{t('પૂરું નામ', 'Full name')}</label>
      <div className="auth-input">
        <input id="edit-name" maxLength={160} value={name} onChange={(e) => { setName(e.target.value); setError(''); }} />
      </div>

      <label className="auth-label spaced" htmlFor="edit-dob">{t('જન્મ તારીખ', 'Date of birth')}</label>
      <div className="auth-input">
        <input id="edit-dob" type="date" max={LATEST_BIRTH_DATE} value={dob} onChange={(e) => { setDob(e.target.value); setError(''); }} />
      </div>

      {!genderLocked && (
        <fieldset className="auth-choices two spaced">
          <legend className="auth-label">{t('લિંગ', 'Gender')}</legend>
          {([
            ['female', t('સ્ત્રી', 'Female')],
            ['male', t('પુરુષ', 'Male')],
          ] as const).map(([value, label]) => (
            <label key={value} className={`auth-choice${gender === value ? ' on' : ''}`}>
              <input type="radio" name="edit-gender" value={value} checked={gender === value} onChange={() => setGender(value)} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      )}

      <label className="auth-label spaced" htmlFor="edit-father">{t('પિતાનું પૂરું નામ', 'Father’s full name')}</label>
      <div className="auth-input">
        <input id="edit-father" maxLength={160} value={father} onChange={(e) => { setFather(e.target.value); setError(''); }} />
      </div>

      <label className="auth-label spaced" htmlFor="edit-city">{t('શહેર', 'City')}</label>
      <div className="auth-input select">
        <select id="edit-city" value={city} onChange={(e) => setCity(e.target.value)}>
          {cities.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>

      {error && <p role="alert" className="auth-error"><CircleHelp size={18} /><span>{error}</span></p>}

      <div className="bio-identity-edit-actions">
        <button type="button" className="cta" disabled={busy} onClick={() => void save()}>
          {busy
            ? <><span className="cta-spinner" aria-hidden="true" />{t('સાચવી રહ્યા છીએ…', 'Saving…')}</>
            : <>{t('સાચવો', 'Save')}<Check size={18} /></>}
        </button>
        <button type="button" className="bio-later" disabled={busy} onClick={onCancel}>
          {t('રદ કરો', 'Cancel')}
        </button>
      </div>
    </div>
  );
}
