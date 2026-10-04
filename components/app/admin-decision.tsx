'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckCheck, CircleHelp, Pencil, Plus, Send, ShieldCheck, X } from 'lucide-react';

import { decideBiodataAction, decideRegistrationAction, resolveDuplicateAction } from '@/app/actions/admin';
import { fieldsFor } from '@/components/biodata/model';
import type { ActionResult } from '@/lib/data/errors';
import type { Enums } from '@/lib/supabase/database.types';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

type Action = 'approve' | 'request_correction' | 'reject';

/**
 * Ready-made messages for the fixes that come up most, so a family reads what
 * is wrong and what to do about it rather than a two-word note. In Gujarati
 * whatever language the admin is using, because that is what families read.
 * Picking one also ticks the field it is about, where there is only one.
 */
const QUICK_FIXES: { label: [string, string]; text: string; field?: string }[] = [
  {
    label: ['ફોટો સ્પષ્ટ નથી', 'Photo not clear'],
    text: 'ફોટો સ્પષ્ટ દેખાતો નથી. કૃપા કરીને સારા પ્રકાશમાં, આખો દસ્તાવેજ દેખાય એ રીતે નવો ફોટો અપલોડ કરો.',
  },
  {
    label: ['નામ મેળ ખાતું નથી', 'Name doesn’t match'],
    text: 'લખેલું નામ દસ્તાવેજ સાથે મેળ ખાતું નથી. દસ્તાવેજમાં છે એ પ્રમાણે જ પૂરું નામ લખો.',
    field: 'full_name',
  },
  {
    label: ['જન્મ તારીખ મેળ ખાતી નથી', 'Birth date doesn’t match'],
    text: 'જન્મ તારીખ પ્રમાણપત્ર સાથે મેળ ખાતી નથી. પ્રમાણપત્રમાં છે એ જ તારીખ લખો.',
    field: 'date_of_birth',
  },
  {
    label: ['ઝેરોક્સ છે', 'Photocopy, not original'],
    text: 'પ્રમાણપત્રનો ફોટો ઝેરોક્સનો છે. ઓરિજિનલ લિવિંગ સર્ટિફિકેટનો ફોટો પાડીને અપલોડ કરો.',
    field: 'birth_certificate',
  },
  {
    label: ['સરનામું દેખાતું નથી', 'Address not visible'],
    text: 'ઓળખપત્ર પર સરનામું દેખાતું નથી. સરનામું જે બાજુએ છે એનો સ્પષ્ટ ફોટો અપલોડ કરો.',
    field: 'identity_document',
  },
  {
    label: ['ખોટો દસ્તાવેજ', 'Wrong document'],
    text: 'અપલોડ કરેલો દસ્તાવેજ માંગેલો દસ્તાવેજ નથી. સ્કૂલ / કૉલેજનું ઓરિજિનલ લિવિંગ સર્ટિફિકેટ, અને સરનામાવાળું આધાર કાર્ડ અથવા મતદાર ઓળખપત્ર અપલોડ કરો.',
  },
];

/**
 * Spec §10's three review actions, plus the two rules that keep them honest:
 *
 *   * a refusal requires an applicant-facing explanation, and a correction
 *     requires the fields it concerns;
 *   * `expectedStatus` is the status this reviewer was shown, so a second admin
 *     who decided first wins and this one is told rather than overwritten.
 *
 * Internal notes are a separate box from the applicant message on purpose.
 *
 * A rejected application offers one choice only: send it back for a fix, for
 * one the family could have put right themselves.
 *
 * Since the one-approval change the biodata travels with the registration:
 * approving publishes it, and a fix may name its fields as well.
 */
export function RegistrationDecision({
  lang,
  applicationId,
  expectedStatus,
  canDecide,
  openDuplicates,
  fields,
  biodataFields = [],
  withBiodata = false,
}: {
  lang: Lang;
  applicationId: string;
  expectedStatus: Enums<'application_status'>;
  /** Moderators may request corrections; approving and rejecting need admin. */
  canDecide: boolean;
  openDuplicates: number;
  fields: { value: string; label: string }[];
  /** The biodata's fields, when a biodata was sent with the registration. */
  biodataFields?: { value: string; label: string }[];
  /** Approving also publishes the biodata sent with it. */
  withBiodata?: boolean;
}) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();
  const reopening = expectedStatus === 'rejected';
  const [action, setAction] = useState<Action | null>(reopening ? 'request_correction' : null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const needsReason = action === 'request_correction' || action === 'reject';
  const needsFields = action === 'request_correction';
  const ready = Boolean(action)
    && (!needsReason || reason.trim().length > 0)
    && (!needsFields || selected.length > 0);

  const chip = (field: { value: string; label: string }) => {
    const on = selected.includes(field.value);
    return (
      <button
        key={field.value}
        type="button"
        aria-pressed={on}
        className={on ? 'on' : undefined}
        onClick={() => setSelected((current) =>
          on ? current.filter((value) => value !== field.value) : [...current, field.value])}
      >
        {on ? <Check size={14} strokeWidth={3} /> : <Pencil size={13} />}
        {field.label}
      </button>
    );
  };

  // Each choice says what it does, so the guide card is no longer needed:
  // the explanation sits on the thing you are about to press.
  const allChoices: { key: Action; tone: string; Icon: typeof Check; title: string; body: string; disabled: boolean }[] = [
    {
      key: 'approve', tone: 'ok', Icon: ShieldCheck,
      title: t('મંજૂર કરો', 'Approve'),
      body: withBiodata
        ? t('પ્રોફાઇલ આ બાયોડેટા સાથે તરત પરિવારોને દેખાવા લાગશે.', 'The profile goes live with this biodata straight away.')
        : t('સભ્યપદ ખૂલે છે. પરિવાર પછી બાયોડેટા મોકલશે.', 'Unlocks membership. The family sends the biodata next.'),
      disabled: !canDecide || openDuplicates > 0,
    },
    {
      key: 'request_correction', tone: 'warn', Icon: Pencil,
      title: reopening ? t('સુધારા માટે પાછી મોકલો', 'Send back for a fix') : t('સુધારો માંગો', 'Ask for a fix'),
      body: t('અરજદાર વિગતો સુધારીને ફરી મોકલશે.', 'They update the details and send again.'),
      disabled: reopening && !canDecide,
    },
    {
      key: 'reject', tone: 'bad', Icon: X,
      title: t('નામંજૂર', 'Reject'),
      body: t(
        'મંજૂર નહીં. પરિવાર તમારું કારણ વાંચીને જાતે સુધારીને ફરી મોકલી શકે છે. ઝાંખો ફોટો કે ખોટી વિગત હોય તો સુધારો માંગો — તેમાં શું સુધારવું તે દેખાય છે.',
        'Not approved. The family reads your reason and may fix it and send again on their own. For a blurred photo or a wrong detail, ask for a fix, which shows them exactly what to change.',
      ),
      disabled: !canDecide,
    },
  ];
  const choices = reopening ? allChoices.filter((choice) => choice.key === 'request_correction') : allChoices;

  const addQuickFix = (fix: (typeof QUICK_FIXES)[number]) => {
    setReason((current) => {
      if (current.includes(fix.text)) return current;
      return current.trim() ? `${current.trim()}\n${fix.text}` : fix.text;
    });
    if (fix.field) {
      const field = fix.field;
      setSelected((current) => (current.includes(field) ? current : [...current, field]));
    }
  };

  function submit() {
    if (!action) return;
    setError('');
    start(async () => {
      const result: ActionResult<unknown> = await decideRegistrationAction({
        applicationId,
        action,
        expectedStatus,
        reason: reason.trim() || undefined,
        fields: selected,
        internalNote: note.trim() || undefined,
      });
      if (result.ok) {
        setDone(true);
        router.push('/admin');
      } else if (result.code === 'conflict') {
        // The family took it back to change it, or another admin decided,
        // while it was open here.
        setError(t(
          'તમે ખોલ્યા પછી આ અરજી બદલાઈ ગઈ છે — પરિવાર ફેરફાર કરી રહ્યો હોય અથવા બીજા એડમિને નિર્ણય લીધો હોય. યાદીમાં પાછા જઈને ફરી જુઓ.',
          'This application changed after you opened it. The family may be changing it, or another admin has decided. Go back to the list and check again.',
        ));
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="decide">
      <h2 className="admin-h2">{reopening ? t('નિર્ણય બદલો', 'Change the decision') : t('તમારો નિર્ણય', 'Your decision')}</h2>

      {openDuplicates > 0 && (
        <p className="admin-alert">
          <CircleHelp size={18} />
          {t(
            `${openDuplicates} સંભવિત ડુપ્લિકેટ પહેલાં ઉકેલવા જરૂરી છે. ત્યાં સુધી મંજૂરી આપી શકાશે નહીં.`,
            `${openDuplicates} possible duplicate(s) must be resolved first. Approval is blocked until then.`,
          )}
        </p>
      )}

      <div className="decide-choices" role="radiogroup" aria-label={t('નિર્ણય', 'Decision')}>
        {choices.map(({ key, tone, Icon, title, body, disabled }) => (
          <label key={key} className={`decide-choice ${tone}${action === key ? ' on' : ''}`}>
            <input
              type="radio"
              name="decision"
              value={key}
              checked={action === key}
              disabled={disabled || pending || done}
              onChange={() => { setAction(key); setError(''); }}
            />
            <span className="decide-icon"><Icon size={20} /></span>
            <span>
              <b>{title}</b>
              <small>{body}</small>
            </span>
            <i className="decide-radio" aria-hidden="true"><Check size={13} strokeWidth={3.5} /></i>
          </label>
        ))}
      </div>

      {!canDecide && (
        <p className="auth-hint">
          <CircleHelp size={15} />
          {t('મૉડરેટર સુધારો માંગી શકે છે; મંજૂરી અને નામંજૂરી માટે એડમિન જોઈએ.', 'A moderator can request a correction; approving and rejecting need an admin.')}
        </p>
      )}

      {action && (
        <div className="decide-form" key={action}>
          {needsFields && (
            <fieldset className="decide-fields">
              <legend className="auth-label">{t('કઈ વિગતો સુધારવાની છે?', 'Which details need fixing?')}</legend>
              <div>{fields.map(chip)}</div>
              {biodataFields.length > 0 && (
                <>
                  <p className="decide-fields-group">{t('બાયોડેટા', 'Biodata')}</p>
                  <div>{biodataFields.map(chip)}</div>
                </>
              )}
            </fieldset>
          )}

          {needsReason && (
            <>
              <label className="auth-label spaced" htmlFor="reason">
                {t('અરજદારને દેખાતો સંદેશ', 'Message the applicant will see')}
              </label>
              {action === 'request_correction' && (
                <div className="decide-quick" aria-label={t('તૈયાર સંદેશ', 'Ready-made messages')}>
                  {QUICK_FIXES.map((fix) => (
                    <button
                      key={fix.text}
                      type="button"
                      aria-pressed={reason.includes(fix.text)}
                      className={reason.includes(fix.text) ? 'on' : undefined}
                      onClick={() => addQuickFix(fix)}
                    >
                      {reason.includes(fix.text) ? <Check size={14} strokeWidth={3} /> : <Plus size={14} strokeWidth={2.6} />}
                      {t(...fix.label)}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                id="reason"
                className="decide-text"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={action === 'reject'
                  ? t('નામંજૂરીનું કારણ નમ્રતાથી લખો…', 'Explain the reason kindly…')
                  : t('શું ખોટું છે અને શું કરવાનું છે તે પૂરા વાક્યમાં લખો…', 'Say what is wrong and what to do, in a full sentence…')}
              />
            </>
          )}

          {/* Spec §10: internal notes stay separate from applicant messages, and
              members are not granted SELECT on this column at all. */}
          <label className="auth-label spaced" htmlFor="note">
            {t('આંતરિક નોંધ', 'Internal note')} <small>{t('· અરજદારને દેખાશે નહીં', '· never shown to the applicant')}</small>
          </label>
          <textarea
            id="note"
            className="decide-text"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />

          {error && <p role="alert" className="auth-error"><CircleHelp size={18} /><span>{error}</span></p>}

          <button
            type="button"
            className={`cta decide-submit ${action}${done ? ' done' : ''}`}
            disabled={!ready || pending || done}
            onClick={submit}
          >
            {done ? (
              <Check size={24} strokeWidth={3} className="cta-check" />
            ) : pending ? (
              <><span className="cta-spinner" aria-hidden="true" />{t('સાચવી રહ્યા છીએ…', 'Saving…')}</>
            ) : (
              <>
                {action === 'approve' ? t('મંજૂરી નોંધો', 'Confirm approval')
                  : action === 'reject' ? t('નામંજૂરી નોંધો', 'Confirm rejection')
                    : t('સુધારો મોકલો', 'Send the request')}
                <Send size={18} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
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
  sanatan = false,
}: {
  lang: Lang;
  revisionId: string;
  expectedStatus: Enums<'revision_status'>;
  canDecide: boolean;
  /** A Sanatan daughter's biodata, whose fix chips are her own questions. */
  sanatan?: boolean;
}) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  // Keys from the biodata catalogue, picked rather than typed: the database
  // accepts only fields it knows, and a typed "Native add karo" is not one.
  const [fields, setFields] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const needsReason = action === 'request_correction' || action === 'reject';
  const ready = Boolean(action)
    && (!needsReason || reason.trim().length > 0)
    && (action !== 'request_correction' || fields.length > 0);

  function submit() {
    if (!action) return;
    start(async () => {
      const result = await decideBiodataAction({
        revisionId,
        action,
        expectedStatus,
        reason: reason.trim() || undefined,
        issues: action === 'request_correction'
          ? fields.map((field) => ({ field, gu: reason.trim(), en: reason.trim() }))
          : [],
        internalNote: note.trim() || undefined,
      });
      if (result.ok) router.push('/admin');
      else setError(result.code === 'conflict'
        ? t('તમે ખોલ્યા પછી આ બાયોડેટા બદલાઈ ગયો છે. પેજ રીફ્રેશ કરીને ફરી જુઓ.', 'This biodata changed after you opened it. Refresh the page and check again.')
        : t('નિર્ણય સાચવી શકાયો નહીં. ફરી પ્રયાસ કરો.', 'The decision could not be saved. Please try again.'));
    });
  }

  return (
    <>
      {/* Approval publishes: there is no consent step after it. */}
      <div className="note">
        <CircleHelp size={19} />
        <p>
          {t('મંજૂરી આપતાં જ પ્રોફાઇલ પરિવારોને દેખાવા લાગશે.', 'Approving puts the profile live for families straight away.')}
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
        <fieldset className="decide-fields">
          <legend className="field-label flush">{t('કઈ વિગતો સુધારવાની છે?', 'Which details need fixing?')} <span>*</span></legend>
          <div>
            {fieldsFor(sanatan).map((field) => {
              const on = fields.includes(field.key);
              return (
                <button
                  key={field.key}
                  type="button"
                  aria-pressed={on}
                  className={on ? 'on' : undefined}
                  onClick={() => setFields((current) =>
                    on ? current.filter((key) => key !== field.key) : [...current, field.key])}
                >
                  {on ? <Check size={14} strokeWidth={3} /> : <Pencil size={13} />}
                  {t(field.gu, field.en)}
                </button>
              );
            })}
          </div>
        </fieldset>
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
