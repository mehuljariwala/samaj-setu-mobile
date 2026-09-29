import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app/shell';
import { AuthForm } from '@/components/app/auth-form';
import { loadPublicPage, homeFor } from '@/lib/data/guards';

export default async function SignInPage() {
  const { context, lang } = await loadPublicPage();
  if (context.access_state !== 'signed_out') redirect(homeFor(context));

  return (
    <AppShell lang={lang} context={context}>
      <section className="auth-screen">
        <AuthForm lang={lang} />
      </section>
    </AppShell>
  );
}
