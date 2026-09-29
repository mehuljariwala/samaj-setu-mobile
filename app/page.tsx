import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app/shell';
import { Intro } from '@/components/onboarding/intro';
import { loadPublicPage, homeFor } from '@/lib/data/guards';

/**
 * The welcome screen, for a visitor who is not signed in.
 *
 * A signed-in account never sees this: the server already knows its access
 * state, so it is sent to the screen that state owns. The prototype had to do
 * the same thing from localStorage after hydration, which is why it needed a
 * boot script to avoid showing this screen and then yanking it away.
 *
 * The slides themselves are in `Intro`; they need state, this page does not.
 */
export default async function WelcomePage() {
  const { context, lang } = await loadPublicPage();
  if (context.access_state !== 'signed_out') redirect(homeFor(context));

  return (
    <AppShell lang={lang} context={context}>
      <Intro lang={lang} />
    </AppShell>
  );
}
