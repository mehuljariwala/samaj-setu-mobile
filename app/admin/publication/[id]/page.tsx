import Link from 'next/link';
import { ArrowLeft, CheckCheck, CircleHelp } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { BiodataDecision } from '@/components/app/admin-decision';
import { isAdmin, loadAdminPage } from '@/lib/data/guards';
import { getBiodataDetail } from '@/lib/data/admin';
import { timeAgo, translator } from '@/lib/i18n';
import type { Enums } from '@/lib/supabase/database.types';

type Detail = {
  revision: {
    id: string;
    version: number;
    status: Enums<'revision_status'>;
    completion: number;
    source: string;
    unconfirmed_fields: string[];
    data: Record<string, string>;
    decision_reason: string | null;
  };
  candidate: { id: string; full_name: string; public_code: string; identity_status: string };
  community: { sub_community: string | null; sect: string | null; paternal_surname: string | null; mosal_family: string | null; confirmed_at: string | null } | null;
  consent: { active: boolean; granted_at: string; text_version: string; by_candidate_themselves: boolean } | null;
  history: { id: string; action: string; to_status: string | null; reason_applicant: string | null; created_at: string }[];
};

export default async function BiodataReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { context, lang } = await loadAdminPage();
  const { id } = await params;
  const t = translator(lang);

  const detail = await getBiodataDetail(id) as unknown as Detail;
  const { revision, candidate, community, consent, history } = detail;
  const decidable = revision.status === 'submitted' || revision.status === 'under_review';

  return (
    <AppShell lang={lang} context={context} admin>
      <section className="screen-pad">
        <Link className="back-link" href="/admin/publication">
          <ArrowLeft size={17} />
          {t('કતાર પર પાછા', 'Back to the queue')}
        </Link>

        <div className="page-title">
          <span className="eyebrow">{candidate.public_code} · v{revision.version}</span>
          <h1>{candidate.full_name}</h1>
          <p>{revision.completion}% {t('પૂર્ણ', 'complete')} · {revision.source}</p>
        </div>

        {/* Spec §5: imported values must be reviewed and uncertain ones flagged.
            Submission is blocked while this list is non-empty, so seeing one
            here means something went in another way. */}
        {revision.unconfirmed_fields.length > 0 && (
          <div className="note">
            <CircleHelp size={19} />
            <p>
              {t('પુષ્ટિ વગરની વિગતો: ', 'Unconfirmed details: ')}
              <b>{revision.unconfirmed_fields.join(', ')}</b>
            </p>
          </div>
        )}

        {/* Spec §10: active consent evidence, including who gave it. */}
        <div className="section-head">
          <h2>{t('પ્રકાશન સંમતિ', 'Publication consent')}</h2>
        </div>
        <div className="detail-list spaced">
          <div>
            <span>{t('સ્થિતિ', 'Status')}</span>
            <b>{consent?.active ? t('સક્રિય', 'Active') : t('નથી', 'Not given')}</b>
          </div>
          {consent && (
            <>
              <div><span>{t('ક્યારે', 'When')}</span><b>{timeAgo(consent.granted_at, lang)}</b></div>
              <div><span>{t('લખાણ આવૃત્તિ', 'Consent text version')}</span><b>{consent.text_version}</b></div>
              <div>
                <span>{t('કોણે આપી', 'Given by')}</span>
                <b>
                  {consent.by_candidate_themselves
                    ? t('ઉમેદવારે પોતે', 'The candidate themselves')
                    : t('ઉમેદવાર નહીં — તપાસો', 'Not the candidate — investigate')}
                </b>
              </div>
            </>
          )}
        </div>

        <div className="section-head">
          <h2>{t('સમાજની વિગતો', 'Community details')}</h2>
        </div>
        <div className="detail-list spaced">
          <div><span>{t('પેટા સમાજ', 'Sub-community')}</span><b>{community?.sub_community ?? '—'}</b></div>
          <div><span>{t('સંપ્રદાય', 'Sect')}</span><b>{community?.sect ?? '—'}</b></div>
          <div><span>{t('અટક', 'Surname')}</span><b>{community?.paternal_surname ?? '—'}</b></div>
          <div><span>{t('મોસાળ', 'Mosal')}</span><b>{community?.mosal_family ?? '—'}</b></div>
          <div>
            <span>{t('પુષ્ટિ', 'Confirmed')}</span>
            <b>{community?.confirmed_at ? t('હા', 'Yes') : t('ના — નિયમો ચકાસી શકાશે નહીં', 'No — rules cannot be evaluated')}</b>
          </div>
        </div>

        <div className="section-head">
          <h2>{t('બાયોડેટા', 'Biodata')}</h2>
        </div>
        <div className="detail-list spaced">
          {Object.entries(revision.data)
            // Contact fields are part of the submission but never part of the
            // directory record; they are shown here because a reviewer checks
            // them, and stripped from everything a member reads.
            .map(([key, value]) => (
              <div key={key}><span>{key}</span><b>{value}</b></div>
            ))}
        </div>

        {decidable ? (
          <BiodataDecision
            lang={lang}
            revisionId={revision.id}
            expectedStatus={revision.status}
            canDecide={isAdmin(context)}
            consentActive={Boolean(consent?.active)}
          />
        ) : (
          <div className="note">
            <CheckCheck size={19} />
            <p>
              {t('આ આવૃત્તિ પર નિર્ણય લેવાઈ ગયો છે: ', 'A decision has already been recorded: ')}
              <b>{revision.status}</b>
              {revision.decision_reason ? ` — ${revision.decision_reason}` : ''}
            </p>
          </div>
        )}

        {history.length > 0 && (
          <>
            <div className="section-head">
              <h2>{t('નિર્ણયનો ઇતિહાસ', 'Decision history')}</h2>
            </div>
            <div className="detail-list spaced">
              {history.map((entry) => (
                <div key={entry.id}>
                  <span>{entry.action} → {entry.to_status} · {timeAgo(entry.created_at, lang)}</span>
                  <b>{entry.reason_applicant ?? '—'}</b>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
