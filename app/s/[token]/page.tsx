import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { loadPublicPage } from '@/lib/data/guards';
import { resolveShareLink } from '@/lib/data/discovery';
import { getActingCandidate } from '@/lib/data/session';
import { AppError } from '@/lib/data/errors';
import { translator } from '@/lib/i18n';
import { redirect } from 'next/navigation';

/**
 * A protected share link (spec §9).
 *
 * The page itself grants nothing: `resolve_share_link` requires an
 * authenticated, approved, eligible member and records every refusal with its
 * reason, because a link being tried by unapproved accounts is the signal that
 * it has been forwarded. On success it returns the same payload as any other
 * profile view, so the link is a shortcut to a screen rather than a way past it.
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { context, lang } = await loadPublicPage();
  const { token } = await params;
  const t = translator(lang);

  if (context.access_state === 'signed_out') {
    redirect(`/sign-in?next=${encodeURIComponent(`/s/${token}`)}`);
  }

  const acting = await getActingCandidate();

  let refusal: string | null = null;
  if (!acting) {
    refusal = t('તમારા ખાતામાં કોઈ ઉમેદવાર નથી.', 'There is no candidate on your account yet.');
  } else {
    try {
      const profile = await resolveShareLink(token, acting.id);
      if (profile.id) redirect(`/discover/${profile.id}`);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      refusal = error.code === 'not_found'
        ? t('આ લિંક માન્ય નથી અથવા સમાપ્ત થઈ ગઈ છે.', 'This link is not valid, or it has expired.')
        : t(
          'આ પ્રોફાઇલ જોવા માટે તમારું ખાતું મંજૂર હોવું જરૂરી છે.',
          'Your account must be approved before you can open this profile.',
        );
    }
  }

  return (
    <AppShell lang={lang} context={context} acting={acting}>
      <section className="screen-pad">
        <div className="empty">
          <LockKeyhole size={34} />
          <h3>{t('આ લિંક ખોલી શકાઈ નથી', 'This link could not be opened')}</h3>
          <p>{refusal}</p>
          <Link className="secondary" href="/home">{t('હોમ પર જાઓ', 'Go to home')}</Link>
        </div>
      </section>
    </AppShell>
  );
}
