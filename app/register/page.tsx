import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app/shell';
import { RegistrationForm } from '@/components/app/registration-form';
import { loadApplicantPage } from '@/lib/data/guards';
import { getOpenApplication } from '@/lib/data/registration';

/**
 * Spec §2: registration is open in two states only — no application at all, or
 * a correction the admin has asked for. Anything else lands on the status
 * screen, which is the screen that state owns.
 */
export default async function RegisterPage() {
  const { context, lang } = await loadApplicantPage();

  const state = context.access_state;
  if (state !== 'no_application' && state !== 'application_draft' && state !== 'correction_requested') {
    redirect('/review');
  }

  const open = await getOpenApplication();

  // `has_certificate` comes from my_context(): members are not granted SELECT
  // on application_documents, so the document row itself is unreadable to them.
  const candidate = open
    ? context.candidates.find((entry) => entry.id === open.candidateId)
    : undefined;

  return (
    <AppShell lang={lang} context={context}>
      <RegistrationForm
        lang={lang}
        existing={
          open
            ? { ...open, hasCertificate: candidate?.application?.has_certificate ?? false }
            : null
        }
      />
    </AppShell>
  );
}
