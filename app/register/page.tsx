import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app/shell';
import { JoinFlow } from '@/components/onboarding/join-flow';
import { homeFor, loadPublicPage } from '@/lib/data/guards';
import { getAttachedDocuments, getOpenApplication } from '@/lib/data/registration';

/**
 * Joining, as one page of three steps: the account, who the profile is for,
 * and the documents.
 *
 * Open to a visitor who is signed out (they start at step 1) and, per spec §2,
 * to an account with no application, a draft, or a correction the admin has
 * asked for (they start at step 2). Anything else lands on the screen its
 * state owns.
 */
export default async function RegisterPage() {
  const { context, lang } = await loadPublicPage();

  const state = context.access_state;
  const signedIn = state !== 'signed_out';
  if (signedIn && state !== 'no_application' && state !== 'application_draft' && state !== 'correction_requested') {
    redirect(homeFor(context));
  }

  const open = signedIn ? await getOpenApplication() : null;
  // Which files are already in. Members cannot read application_documents,
  // so this comes from an RPC that answers yes or no per document.
  const documents = open ? await getAttachedDocuments(open.applicationId) : null;

  return (
    <AppShell lang={lang} context={context}>
      <section className="auth-screen">
        <JoinFlow
          lang={lang}
          signedIn={signedIn}
          existing={open && documents ? { ...open, documents } : null}
        />
      </section>
    </AppShell>
  );
}
