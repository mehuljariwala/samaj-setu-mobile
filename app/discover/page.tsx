import Link from 'next/link';
import { ArrowRight, LockKeyhole } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { DiscoverResults } from '@/components/app/discover-results';
import { loadActingPage } from '@/lib/data/guards';
import { discoverAll, discoverPhotos } from '@/lib/data/discovery';
import { translator } from '@/lib/i18n';

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, lang, acting } = await loadActingPage();
  const { q } = await searchParams;
  const t = translator(lang);

  // Everyone this candidate may see. The filter panel narrows this in the
  // browser, so only a search brings the screen back here.
  const all = await discoverAll(acting.id, { query: typeof q === 'string' ? q : undefined });
  const photos = await discoverPhotos(all.filter((profile) => profile.canViewPhotos).map((profile) => profile.id));

  return (
    <AppShell lang={lang} context={context} acting={acting} member>
      <section className="member-screen tone-rose">
        <DiscoverResults
          lang={lang}
          profiles={all.map((profile) => ({ ...profile, photo: photos.get(profile.id) ?? null }))}
          notice={!acting.discoverable && (
            // Spec §6: an unpublished candidate may browse but cannot introduce
            // themselves. Saying so here beats a disabled button on every card.
            <Link className="member-alert" href="/home">
              <LockKeyhole size={18} />
              <span>
                {t(
                  'તમે પ્રોફાઇલ જોઈ શકો છો. પરિચય મોકલવા તમારો બાયોડેટા મંજૂર થયેલો હોવો જરૂરી છે.',
                  'You can browse. To send an introduction, your biodata needs to be approved.',
                )}
              </span>
              <ArrowRight size={17} />
            </Link>
          )}
        />
      </section>
    </AppShell>
  );
}
