'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckCheck, CircleHelp, Pencil, Send } from 'lucide-react';

import { decideBiodataAction, decideRegistrationAction, resolveDuplicateAction } from '@/app/actions/admin';
import type { ActionResult } from '@/lib/data/errors';
import type { Enums } from '@/lib/supabase/database.types';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

type Action = 'approve' | 'request_correction' | 'reject';

/**
 * Spec §10's three review actions, plus the two rules that keep them honest:
 *
 *   * a refusal requires an applicant-facing explanation, and a correction
 *     requires the fields it concerns;
 *   * `expectedStatus` is the status this reviewer was shown, so a second admin
 *     who decided first wins and this one is told rather than overwritten.
 *
 * Internal notes are a separate box from the applicant message on purpose.
 */
export function RegistrationDecision({
  lang,
  applicationId,
  expectedStatus,
  canDecide,
  openDuplicates,
  fields,
}: {
  lang: Lang;
  applicationId: string;
  expectedStatus: Enums<'application_status'>;
  /** Moderators may request corrections; approving and rejecting need admin. */
  canDecide: boolean;
  openDuplicates: number;
  fields: string[];
}) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');

  const needsReason = action === 'request_correction' || action === 'reject';
  const needsFields = action === 'request_correction';
  const ready = Boolean(action)
    && (!needsReason || reason.trim().length > 0)
    && (!needsFields || selected.length > 0);

  function submit() {
    if (!action) return;
    start(async () => {
      const result: ActionResult<unknown> = await decideRegistrationAction({
        applicationId,
        action,
        expectedStatus,
        reason: reason.trim() || undefined,
        fields: selected,
        internalNote: note.trim() || undefined,
      });
      if (result.ok) router.push('/admin');
      else setError(result.message);
    });
  }

  return (
    <>
      <div className="decision-guide card">
        <h3>{t('નિર્ણય પછી શું થશે?', 'What each decision does')}</h3>
        <p><b>{t('મંજૂર:', 'Approve:')}</b> {t('સભ્યને ઍક્સેસ મળશે. બાયોડેટાની અલગ સમીક્ષા થશે.', 'Unlocks member access. Biodata is reviewed separately.')}</p>
        <p><b>{t('સુધારો:', 'Correction:')}</b> {t('અરજદાર વિગતો સુધારી ફરી મોકલશે.', 'The applicant updates details and resubmits.')}</p>
        <p><b>{t('નામંજૂર:', 'Reject:')}</b> {t('ઍક્સેસ બંધ રહેશે અને કારણ દેખાશે.', 'Access stays locked and the reason is shown.')}</p>
      </div>

      {openDuplicates > 0 && (
        <div className="note">
          <CircleHelp size={19} />
          <p>
            {t(
              `${openDuplicates} સંભવિત ડુપ્લિકેટ પહેલાં ઉકેલવા જરૂરી છે. ત્યાં સુધી મંજૂરી આપી શકાશે નહીં.`,
              `${openDuplicates} possible duplicate(s) must be resolved first. Approval is blocked until then.`,
            )}
          </p>
        </div>
      )}

      <div className="admin-actions">
        <button
          className="primary"
          disabled={!canDecide || openDuplicates > 0 || pending}
          onClick={() => setAction('approve')}
        >
          <Check size={19} />
          {t('મંજૂર કરો', 'Approve application')}
        </button>
        <button className="secondary" disabled={pending} onClick={() => setAction('request_correction')}>
          <Pencil size={16} />
          {t('સુધારો માંગો', 'Request correction')}
        </button>
        <button className="reject-button" disabled={!canDecide || pending} onClick={() => setAction('reject')}>
          {t('અરજી નામંજૂર કરો', 'Reject application')}
        </button>
      </div>

      {!canDecide && (
        <p className="field-hint">
          {t('મૉડરેટર સુધારો માંગી શકે છે; મંજૂરી અને નામંજૂરી માટે એડમિન જોઈએ.', 'A moderator can request a correction; approving and rejecting need an admin.')}
        </p>
      )}

      {action && (
        <>
          {needsFields && (
            <>
              <label className="field-label flush">{t('કઈ વિગતો સુધારવાની છે?', 'Which details need correcting?')} <span>*</span></label>
              <div className="chips">
                {fields.map((field) => (
                  <button
                    key={field}
                    className={`chip ${selected.includes(field) ? 'on' : ''}`}
                    onClick={() => setSelected((current) =>
                      current.includes(field)
                        ? current.filter((value) => value !== field)
                        : [...current, field])}
                  >
                    {field}
                  </button>
                ))}
              </div>
            </>
          )}

          {needsReason && (
            <>
              <label className="field-label" htmlFor="reason">
                {t('અરજદારને દેખાતો સંદેશ', 'Message the applicant will see')} <span>*</span>
              </label>
              <textarea
                id="reason"
                className="field textarea"
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('શું સુધારવાનું છે તે સ્પષ્ટ લખો…', 'Explain clearly what needs to change…')}
              />
            </>
          )}

          {/* Spec §10: internal notes stay separate from applicant messages, and
              members are not granted SELECT on this column at all. */}
          <label className="field-label" htmlFor="note">{t('આંતરિક નોંધ (અરજદારને દેખાશે નહીં)', 'Internal note (never shown to the applicant)')}</label>
          <textarea
            id="note"
            className="field textarea"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />

          <button className="primary" disabled={!ready || pending} onClick={submit}>
            {pending ? t('સાચવી રહ્યા છીએ…', 'Saving…') : t('નિર્ણય નોંધો', 'Record the decision')}
            <Send size={17} />
          </button>
        </>
      )}

      {error && <p role="alert" className="error"><CircleHelp size={17} />{error}</p>}
    </>
  );
}

/** Spec §4: a judgement about two records — never a merge, never a rejection. */
export function DuplicateDecision({
  lang,
  duplicateId,
}: {
  lang: Lang;
  duplicateId: string;
}) {
  const t = translator(lang);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  const resolve = (status: 'confirmed' | 'not_duplicate') =>
    start(async () => {
      const result = await resolveDuplicateAction(duplicateId, status);
      if (!result.ok) setError(result.message);
    });

  return (
    <>
      <div className="admin-actions">
        <button className="secondary" disabled={pending} onClick={() => resolve('not_duplicate')}>
          <CheckCheck size={16} />
          {t('અલગ વ્યક્તિ છે', 'Different people')}
        </button>
        <button className="reject-button" disabled={pending} onClick={() => resolve('confirmed')}>
          {t('એક જ વ્યક્તિ છે', 'Same person')}
        </button>
      </div>
      {error && <p role="alert" className="error"><CircleHelp size={17} />{error}</p>}
    </>
  );
}

export function BiodataDecision({
  lang,
  revisionId,
  expectedStatus,
  canDecide,
  consentActive,
}: {
  lang: Lang;
  revisionId: string;
  expectedStatus: Enums<'revision_status'>;
  canDecide: boolean;
  consentActive: boolean;
}) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [field, setField] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const needsReason = action === 'request_correction' || action === 'reject';
  const ready = Boolean(action)
    && (!needsReason || reason.trim().length > 0)
    && (action !== 'request_correction' || field.trim().length > 0);

  function submit() {
    if (!action) return;
    start(async () => {
      const result = await decideBiodataAction({
        revisionId,
        action,
        expectedStatus,
        reason: reason.trim() || undefined,
        issues: action === 'request_correction'
          ? [{ field: field.trim(), gu: reason.trim(), en: reason.trim() }]
          : [],
        internalNote: note.trim() || undefined,
      });
      if (result.ok) router.push('/admin/publication');
      else setError(result.message);
    });
  }

  return (
    <>
      {/* Spec §5: approval does not publish on its own — consent is the other
          half, and it can arrive before or after this decision. */}
      <div className="note">
        <CircleHelp size={19} />
        <p>
          {consentActive
            ? t('ઉમેદવારની સંમતિ સક્રિય છે — મંજૂરી પછી પ્રોફાઇલ તરત પ્રકાશિત થશે.', 'The candidate’s consent is active — approving will publish the profile immediately.')
            : t('ઉમેદવારની સંમતિ હજી નથી. મંજૂરી પછી પણ સંમતિ મળે ત્યાં સુધી પ્રોફાઇલ છુપી રહેશે.', 'The candidate has not consented yet. Even after approval the profile stays hidden until they do.')}
        </p>
      </div>

      <div className="admin-actions">
        <button className="primary" disabled={!canDecide || pending} onClick={() => setAction('approve')}>
          <Check size={19} />
          {t('બાયોડેટા મંજૂર કરો', 'Approve biodata')}
        </button>
        <button className="secondary" disabled={pending} onClick={() => setAction('request_correction')}>
          <Pencil size={16} />
          {t('સુધારો માંગો', 'Request correction')}
        </button>
        <button className="reject-button" disabled={!canDecide || pending} onClick={() => setAction('reject')}>
          {t('નામંજૂર કરો', 'Reject')}
        </button>
      </div>

      {action === 'request_correction' && (
        <>
          <label className="field-label flush" htmlFor="field">{t('કયું ફીલ્ડ?', 'Which field?')} <span>*</span></label>
          <input
            className="field"
            id="field"
            value={field}
            onChange={(event) => setField(event.target.value)}
            placeholder="mosal"
          />
        </>
      )}

      {action && (
        <>
          {needsReason && (
            <>
              <label className="field-label" htmlFor="bio-reason">
                {t('અરજદારને દેખાતો સંદેશ', 'Message the applicant will see')} <span>*</span>
              </label>
              <textarea
                id="bio-reason"
                className="field textarea"
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </>
          )}

          <label className="field-label" htmlFor="bio-note">{t('આંતરિક નોંધ', 'Internal note')}</label>
          <textarea
            id="bio-note"
            className="field textarea"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />

          <button className="primary" disabled={!ready || pending} onClick={submit}>
            {pending ? t('સાચવી રહ્યા છીએ…', 'Saving…') : t('નિર્ણય નોંધો', 'Record the decision')}
            <Send size={17} />
          </button>
        </>
      )}

      {error && <p role="alert" className="error"><CircleHelp size={17} />{error}</p>}
    </>
  );
}
