import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { LinkExistingForm } from '@/components/app/link-existing-form';
import { loadApplicantPage } from '@/lib/data/guards';
import { listMyAccessRequests } from '@/lib/data/registration';
import { accessRequestStatusLabel, relationshipLabel } from '@/lib/admin-labels';
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
      <section className="member-screen tone-green">
        <div className="admin-detail-top">
          <Link className="round-button" href="/family" aria-label={t('પરિવાર પર પાછા', 'Back to Family')}>
            <ArrowLeft size={20} />
          </Link>
          <span>{t('એક ઉમેદવાર, એક પ્રોફાઇલ', 'One candidate, one profile')}</span>
        </div>

        <div className="member-title">
          <h1>{t('હાજર પ્રોફાઇલ સાથે જોડાઓ', 'Link to an existing profile')}</h1>
          <p>
            {t(
              'જો ઉમેદવારની પ્રોફાઇલ પહેલેથી હોય, તો બીજી બનાવવાને બદલે તેની ઍક્સેસ માંગો.',
              'If the candidate already has a profile, ask for access to it instead of creating a second one.',
            )}
          </p>
        </div>

        <div className="member-group member-form">
          <LinkExistingForm lang={lang} />
        </div>

        {requests.length > 0 && (
          <>
            <h2 className="admin-h2">{t('તમારી વિનંતીઓ', 'Your requests')}</h2>
            <div className="admin-accounts">
              {requests.map((request) => (
                <div className="admin-account" key={request.id}>
                  <span className="admin-account-icon"><Users size={18} /></span>
                  <span>
                    <b>{relationshipLabel(t, request.claimed_relationship)}</b>
                    <small>
                      {timeAgo(request.created_at, lang)}
                      {request.decision_reason ? ` · ${request.decision_reason}` : ''}
                    </small>
                  </span>
                  <span className={`member-status ${request.status === 'approved' ? 'ok' : request.status === 'rejected' ? 'bad' : 'gold'}`}>
                    {accessRequestStatusLabel(t, request.status)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
