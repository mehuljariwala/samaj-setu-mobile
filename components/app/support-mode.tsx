'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CircleHelp, LogOut, UserCog } from 'lucide-react';

import { openAsFamilyAction, returnToAdminAction } from '@/app/actions/users';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * Support mode (migration 20261024000100): the superadmin opens a family's
 * account from /admin/users/[id] and sees and changes everything the family
 * could. They stay signed in as themselves, so every change is recorded under
 * their own name, and the session closes itself after two hours.
 */
export function OpenAsFamily({ lang, accountId }: { lang: Lang; accountId: string }) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  const open = () => start(async () => {
    const result = await openAsFamilyAction(accountId);
    if (result.ok) router.push('/home');
    else setError(result.message);
  });

  return (
    <>
      <h2 className="admin-h2">{t('આ પરિવાર તરીકે ખોલો', 'Open as this family')}</h2>
      <p className="admin-alert soft">
        <UserCog size={18} />
        {t(
          'પરિવાર જે જુએ છે તે જ જુઓ અને તેમના માટે બાયોડેટા, ફોટા, પરિચય સહિત બધું બદલો. દરેક ફેરફાર તમારા નામે નોંધાશે, અને બાયોડેટા તરત મંજૂર થઈ જશે. 2 કલાક પછી આપોઆપ બંધ થાય છે.',
          'See exactly what the family sees and change anything for them: biodata, photos, introductions. Every change is recorded under your name, and biodata you send is approved at once. Closes itself after 2 hours.',
        )}
      </p>
      <button className="cta support-open" disabled={pending} onClick={open}>
        {t('પરિવાર તરીકે ખોલો', 'Open as family')}
        <ArrowRight size={19} />
      </button>
      {error && (
        <p role="alert" className="error">
          <CircleHelp size={17} />
          {error}
        </p>
      )}
    </>
  );
}

/**
 * Across the top of every screen while a session is open, so a change is never
 * made for a family without knowing whose account it is.
 */
export function SupportBanner({
  lang,
  accountId,
  name,
  until,
}: {
  lang: Lang;
  accountId: string;
  name: string;
  until: string;
}) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();

  const time = new Date(until).toLocaleTimeString(lang === 'en' ? 'en-IN' : 'gu-IN', {
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });

  const leave = () => start(async () => {
    await returnToAdminAction();
    router.push(`/admin/users/${accountId}`);
  });

  return (
    <div className="support-banner">
      <UserCog size={18} />
      <span>
        <b>{t(`${name} તરીકે`, `Acting as ${name}`)}</b>
        <small>{t(`તમારા નામે નોંધાય છે · ${time} સુધી`, `Recorded under your name · until ${time}`)}</small>
      </span>
      <button disabled={pending} onClick={leave}>
        <LogOut size={15} />
        {t('એડમિન પર પાછા', 'Back to admin')}
      </button>
    </div>
  );
}
