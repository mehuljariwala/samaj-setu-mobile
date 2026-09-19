import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { LinkExistingForm } from '@/components/app/link-existing-form';
import { loadApplicantPage } from '@/lib/data/guards';
import { listMyAccessRequests } from '@/lib/data/registration';
import { timeAgo, translator } from '@/lib/i18n';

/**
 * Spec §4: a confirmed existing profile leads to an access request, not a
 * second profile. Nothing about the candidate is revealed here — not their
 * name, not their status, not whether the code even matched someone the
 * requester had in mind. An admin verifies the relationship before linking.
 */
export default async function LinkExistingPage() {
  const { context, lang, acting } = await loadApplicantPage();
  const t = translator(lang);
  const requests = await listMyAccessRequests();

  return (
    <AppShell lang={lang} context={context} acting={acting} member={context.access_state === 'approved'}>
      <section className="screen-pad">
        <Link className="back-link" href="/family">
          <ArrowLeft size={17} />
          {t('પરિવાર પર પાછા', 'Back to Family')}
        </Link>

        <div className="page-title">
          <span className="eyebrow">{t('એક ઉમેદવાર, એક પ્રોફાઇલ', 'One candidate, one profile')}</span>
          <h1>{t('હાજર પ્રોફાઇલ સાથે જોડાઓ', 'Link to an existing profile')}</h1>
          <p>
            {t(
              'જો ઉમેદવારની પ્રોફાઇલ પહેલેથી હોય, તો બીજી બનાવવાને બદલે તેની ઍક્સેસ માંગો.',
              'If the candidate already has a profile, ask for access to it instead of creating a second one.',
            )}
          </p>
        </div>

        <LinkExistingForm lang={lang} />

        {requests.length > 0 && (
          <>
            <div className="section-head">
              <h2>{t('તમારી વિનંતીઓ', 'Your requests')}</h2>
            </div>
            {requests.map((request) => (
              <div className="card row-card" key={request.id}>
                <span className="avatar"><Users size={18} /></span>
                <div>
                  <b>{request.claimed_relationship}</b>
                  <small>
                    {request.status} · {timeAgo(request.created_at, lang)}
                  </small>
                  {request.decision_reason && <small>{request.decision_reason}</small>}
                </div>
              </div>
            ))}
          </>
        )}
      </section>
    </AppShell>
  );
}
