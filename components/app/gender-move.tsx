'use client';

import { useState, useTransition } from 'react';
import { ArrowRightLeft, Tag, Users } from 'lucide-react';

import { setCandidateGenderAction, setCandidateSanatanAction } from '@/app/actions/admin';
import { sanatanLabel } from '@/components/biodata/model';
import type { Enums } from '@/lib/supabase/database.types';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * The gender, as one row of an admin facts card, with a button that moves the
 * profile to the other group when the wrong one was picked at registration.
 * Switching the account off used to be the only way out, which hid the
 * profile from families but left it under the wrong group and locked the
 * family out.
 */
export function GenderRow({
  lang, candidateId, name, gender, canMove,
}: {
  lang: Lang;
  candidateId: string;
  name: string;
  gender: Enums<'gender'>;
  /** Admins move profiles; other staff see the gender only. */
  canMove: boolean;
}) {
  const t = translator(lang);
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const to: Enums<'gender'> = gender === 'male' ? 'female' : 'male';

  function move() {
    const ask = to === 'male'
      ? t(
        `${name} ને છોકરાઓના જૂથમાં ખસેડવા છે? બાયોડેટામાં પણ લિંગ બદલાશે, અને બે છોકરા વચ્ચેના બાકી રસ પાછા ખેંચાશે.`,
        `Move ${name} to the boys? The biodata’s gender changes too, and any waiting interest between two boys is withdrawn.`,
      )
      : t(
        `${name} ને છોકરીઓના જૂથમાં ખસેડવા છે? બાયોડેટામાં પણ લિંગ બદલાશે, અને બે છોકરી વચ્ચેના બાકી રસ પાછા ખેંચાશે.`,
        `Move ${name} to the girls? The biodata’s gender changes too, and any waiting interest between two girls is withdrawn.`,
      );
    if (!confirm(ask)) return;

    startTransition(async () => {
      const result = await setCandidateGenderAction(candidateId, to);
      if (!result.ok) return setNote(result.message);
      const withdrawn = result.data.withdrawn_interests;
      setNote(withdrawn > 0
        ? t(`ખસેડી દીધું. ${withdrawn} રસ પાછા ખેંચાયા.`, `Moved. ${withdrawn} interest${withdrawn === 1 ? '' : 's'} withdrawn.`)
        : t('ખસેડી દીધું.', 'Moved.'));
    });
  }

  return (
    <div>
      <dt><Users size={16} />{t('લિંગ', 'Gender')}</dt>
      <dd>
        {gender === 'male' ? t('છોકરો', 'Boy') : t('છોકરી', 'Girl')}
        {canMove && (
          <button type="button" className="admin-move" disabled={pending} onClick={move}>
            <ArrowRightLeft size={13} />
            {pending
              ? t('ખસેડી રહ્યા છીએ…', 'Moving…')
              : to === 'male' ? t('છોકરાઓમાં ખસેડો', 'Move to boys') : t('છોકરીઓમાં ખસેડો', 'Move to girls')}
          </button>
        )}
        {note && <output><small>{note}</small></output>}
      </dd>
    </div>
  );
}

/**
 * Khatri samaj or Sanatan, the same way: a family can change it only until the
 * registration is sent, so a box ticked by mistake left a Khatri son under
 * Sanatan for good (migration 20261024000300).
 */
export function ProfileTypeRow({
  lang, candidateId, name, gender, sanatan, canMove,
}: {
  lang: Lang;
  candidateId: string;
  name: string;
  gender: Enums<'gender'>;
  sanatan: boolean;
  canMove: boolean;
}) {
  const t = translator(lang);
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const label = sanatanLabel(gender);

  function move() {
    const ask = sanatan
      ? t(
        `${name} ને ખત્રી સમાજમાં ખસેડવા છે? પછી બાયોડેટામાં પેટા સમાજ, અટક અને મોસાળ પૂછાશે; તે ભરાય ત્યાં સુધી પરિચય મોકલી કે મેળવી શકાશે નહીં.`,
        `Move ${name} to the Khatri samaj? Their biodata will then ask for sub-community, paternal surname and mosal, and introductions wait until those are filled in.`,
      )
      : t(
        `${name} ને ${label[0]} તરીકે ખસેડવા છે? પછી બાયોડેટામાં જ્ઞાતિ, પિતાનો વ્યવસાય, ગામ, રાજ્ય અને પિતાનો મોબાઇલ પૂછાશે, અને મોસાળનો નિયમ લાગુ નહીં પડે.`,
        `Move ${name} to Sanatan? Their biodata will then ask for caste, father’s occupation, village, state and father’s mobile, and the mosal rule no longer applies.`,
      );
    if (!confirm(ask)) return;

    startTransition(async () => {
      const result = await setCandidateSanatanAction(candidateId, !sanatan);
      if (!result.ok) return setNote(result.message);
      setNote(sanatan
        ? t('ખસેડી દીધું. હવે પેટા સમાજ, અટક અને મોસાળ ઉમેરો.', 'Moved. Now add their sub-community, surname and mosal.')
        : t('ખસેડી દીધું.', 'Moved.'));
    });
  }

  return (
    <div>
      <dt><Tag size={16} />{t('પ્રોફાઇલ પ્રકાર', 'Profile type')}</dt>
      <dd>
        {sanatan ? t(...label) : t('ખત્રી સમાજ', 'Khatri samaj')}
        {canMove && (
          <button type="button" className="admin-move" disabled={pending} onClick={move}>
            <ArrowRightLeft size={13} />
            {pending
              ? t('ખસેડી રહ્યા છીએ…', 'Moving…')
              : sanatan ? t('ખત્રી સમાજમાં ખસેડો', 'Move to Khatri samaj') : t('સનાતનમાં ખસેડો', 'Move to Sanatan')}
          </button>
        )}
        {note && <output><small>{note}</small></output>}
      </dd>
    </div>
  );
}
