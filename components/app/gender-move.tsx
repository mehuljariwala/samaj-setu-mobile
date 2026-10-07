'use client';

import { useState, useTransition } from 'react';
import { ArrowRightLeft, Users } from 'lucide-react';

import { setCandidateGenderAction } from '@/app/actions/admin';
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
  lang, candidateId, name, gender, sanatan, canMove,
}: {
  lang: Lang;
  candidateId: string;
  name: string;
  gender: Enums<'gender'>;
  /** A Sanatan daughter stays among the girls. */
  sanatan: boolean;
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
        {canMove && !(sanatan && to === 'male') && (
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
