'use client';

import { useActionState } from 'react';
import { ArrowRight, CircleCheck, CircleHelp, LockKeyhole } from 'lucide-react';

import { requestCandidateAccessAction } from '@/app/actions/registration';
import type { ActionResult } from '@/lib/data/errors';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

type Result = ActionResult<{ requestId: string }> | null;

export function LinkExistingForm({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const [state, submit, pending] = useActionState<Result, FormData>(
    (previous, formData) => requestCandidateAccessAction(previous, formData),
    null,
  );

  if (state?.ok) {
    return (
      <div className="empty">
        <CircleCheck size={38} />
        <h3>{t('વિનંતી નોંધાઈ', 'Your request has been recorded')}</h3>
        <p>
          {t(
            'એડમિન તમારો સંબંધ ચકાસશે. ત્યાં સુધી પ્રોફાઇલની કોઈ વિગત દેખાશે નહીં.',
            'An admin will verify your relationship. Until then, no detail of the profile is shown.',
          )}
        </p>
      </div>
    );
  }

  return (
    <form action={submit}>
      <label className="field-label" htmlFor="publicCode">
        {t('પ્રોફાઇલ કોડ', 'Profile code')} <span>*</span>
      </label>
      <input
        className="field"
        id="publicCode"
        name="publicCode"
        placeholder="SS-1024"
        autoCapitalize="characters"
        required
      />
      <p className="field-hint">
        {t('પરિવાર પાસેથી કોડ મેળવો. ખોટો કોડ કંઈ જાહેર કરતો નથી.', 'Ask the family for the code. A wrong code reveals nothing.')}
      </p>

      <label className="field-label" htmlFor="relationship">
        {t('તમારો સંબંધ', 'Your relationship')} <span>*</span>
      </label>
      <select className="field" id="relationship" name="relationship" defaultValue="other" required>
        <option value="self">{t('હું પોતે ઉમેદવાર છું', 'I am the candidate')}</option>
        <option value="son">{t('પુત્ર', 'Son')}</option>
        <option value="daughter">{t('પુત્રી', 'Daughter')}</option>
        <option value="brother">{t('ભાઈ', 'Brother')}</option>
        <option value="sister">{t('બહેન', 'Sister')}</option>
        <option value="ward">{t('વાલી', 'Guardian')}</option>
        <option value="other">{t('અન્ય', 'Other')}</option>
      </select>

      <label className="field-label" htmlFor="note">{t('એડમિન માટે નોંધ', 'A note for the admin')}</label>
      <textarea className="field textarea" id="note" name="note" rows={3} maxLength={500} />

      {state && !state.ok && (
        <p role="alert" className="error"><CircleHelp size={17} />{state.message}</p>
      )}

      <button className="primary" type="submit" disabled={pending}>
        {t('ઍક્સેસ માટે વિનંતી કરો', 'Request access')}
        <ArrowRight size={18} />
      </button>
      <p className="field-hint inline-icon">
        <LockKeyhole size={12} />
        {t(
          'આ વિનંતીથી પ્રોફાઇલની કોઈ માહિતી કે હાલના ખાતાધારકનો સંપર્ક જાહેર થતો નથી.',
          'This request reveals nothing about the profile or the existing account holder.',
        )}
      </p>
    </form>
  );
}
