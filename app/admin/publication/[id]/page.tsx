import Link from 'next/link';
import {
  ArrowLeft, Check, CheckCheck, ChevronRight, CircleHelp, Clock3, Eye, FileCheck2, Hourglass, Pencil, X, type LucideIcon,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { BiodataDecision } from '@/components/app/admin-decision';
import { AdminPhotos } from '@/components/app/admin-photos';
import { BiodataView } from '@/components/app/biodata-view';
import { isAdmin, loadAdminPage } from '@/lib/data/guards';
import { getApplicationIdFor, getBiodataDetail, getProfilePhotos } from '@/lib/data/admin';
import { reviewActionLabel } from '@/lib/admin-labels';
import { ageFrom } from '@/lib/age';
import { whatChanged } from '@/lib/biodata-changes';
import { timeAgo, translator, type T } from '@/lib/i18n';
import type { Enums } from '@/lib/supabase/database.types';

type Detail = {
  revision: {
    id: string;
    version: number;
    status: Enums<'revision_status'>;
    completion: number;
    unconfirmed_fields: string[];
    correction_fields: string[];
    data: Record<string, string>;
    /** Registration details the family asked to change with this version. */
    detail_changes: Record<string, string>;
    decision_reason: string | null;
    submitted_at: string | null;
  };
  candidate: {
    id: string; full_name: string; public_code: string; city: string | null;
    date_of_birth: string; discoverable: boolean; is_sanatan: boolean;
    gender: string; father_name: string | null;
  };
  /** The version families see now, when this one is a change to it. */
  published: { id: string; version: number; data: Record<string, string> } | null;
  community: { confirmed_at: string | null } | null;
  history: { id: string; action: string; to_status: string | null; reason_applicant: string | null; created_at: string }[];
};

/**
 * One biodata, readable in a screen or two: who it is and where they stand,
 * a link to their documents, the biodata as six short cards in the order the
 * family filled it in, then the decision.
 */
export default async function BiodataReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { context, lang } = await loadAdminPage();
  const { id } = await params;
  const t = translator(lang);

  const detail = await getBiodataDetail(id) as unknown as Detail;
  const { revision, candidate, community, history, published } = detail;
  const [applicationId, photos] = await Promise.all([getApplicationIdFor(candidate.id), getProfilePhotos(candidate.id)]);
  const decidable = revision.status === 'submitted' || revision.status === 'under_review';
  const status = revisionStatus(t, revision.status, candidate.discoverable);
  const age = ageFrom(candidate.date_of_birth);
  // A change to an approved profile, still to be decided or being fixed.
  const change = published && (decidable || revision.status === 'correction_requested');
  const changes = change ? whatChanged(t, lang, detail) : [];

  const facts = [
    candidate.city,
    age !== null ? t(`${age} વર્ષ`, `${age} yrs`) : null,
    revision.submitted_at ? `${t('મોકલ્યો', 'Sent')} ${timeAgo(revision.submitted_at, lang)}` : null,
    t(`${revision.completion}% પૂર્ણ`, `${revision.completion}% complete`),
  ].filter(Boolean).join(' · ');

  return (
    <AppShell lang={lang} context={context} admin>
      <section className={`admin-screen tone-${status.screen}`}>
        <div className="admin-detail-top">
          <Link className="round-button" href="/admin" aria-label={t('યાદી પર પાછા', 'Back to the list')}>
            <ArrowLeft size={20} />
          </Link>
          <span>{t('બાયોડેટા સમીક્ષા', 'Biodata review')}</span>
        </div>

        <div className="admin-person">
          <span className="avatar lg">{candidate.full_name.charAt(0)}</span>
          <div>
            <small>{candidate.public_code}</small>
            <h1>{candidate.full_name}</h1>
            <span className={`queue-tag ${status.tone}`}><status.Icon size={14} strokeWidth={2.4} />{status.label}</span>
            {candidate.is_sanatan && <span className="sanatan-tag">{t('સનાતન દીકરી', 'Sanatan daughter')}</span>}
          </div>
          <p className="admin-person-facts">{facts}</p>
        </div>

        {applicationId && (
          <Link className="admin-link-row" href={`/admin/registrations/${applicationId}`}>
            <span className="admin-account-icon"><FileCheck2 size={18} /></span>
            <span>
              <b>{t('દસ્તાવેજ અને ઓળખ', 'Documents and identity')}</b>
              <small>{t('પ્રમાણપત્ર, ઓળખપત્ર અને નોંધણીની વિગતો', 'Certificate, photo ID and registration details')}</small>
            </span>
            <ChevronRight size={19} />
          </Link>
        )}

        {change && (
          <>
            <h2 className="admin-h2">{t('શું બદલાયું', 'What changed')}</h2>
            <p className="admin-alert soft">
              <Eye size={18} />
              <span>
                {t(
                  'આ પ્રોફાઇલ મંજૂર થયેલી છે. તમે આ ફેરફાર મંજૂર કરો ત્યાં સુધી પરિવારોને હાલની આવૃત્તિ જ દેખાશે.',
                  'This profile is already approved. Families see the current version until you approve these changes.',
                )}
                {Object.keys(revision.detail_changes).length > 0 && t(
                  ' નોંધણીની વિગતો બદલાઈ છે — દસ્તાવેજ સાથે મેળવો.',
                  ' Registration details have changed — check them against the documents.',
                )}
              </span>
            </p>
            {changes.length === 0 ? (
              <p className="admin-alert soft"><Check size={18} /><span>{t('કોઈ વિગત બદલાઈ નથી.', 'Nothing was changed.')}</span></p>
            ) : (
              <dl className="admin-facts-card admin-changes">
                {changes.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>
                      {item.after || '—'}
                      <small>{t('પહેલાં', 'Before')}: {item.before || '—'}</small>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}

        {/* Spec §5: imported values must be reviewed and uncertain ones flagged.
            Submission is blocked while this list is non-empty, so seeing one
            here means something went in another way. */}
        {revision.unconfirmed_fields.length > 0 && (
          <p className="admin-alert">
            <CircleHelp size={18} />
            <span>{t('પુષ્ટિ વગરની વિગતો: ', 'Unconfirmed details: ')}<b>{revision.unconfirmed_fields.join(', ')}</b></span>
          </p>
        )}

        {revision.status === 'correction_requested' && revision.decision_reason && (
          <p className="admin-alert soft">
            <Pencil size={18} />
            <span><b>{t('પરિવારને કહ્યું: ', 'Asked of the family: ')}</b>{revision.decision_reason}</span>
          </p>
        )}

        <AdminPhotos lang={lang} photos={photos} />

        <h2 className="admin-h2">{t('બાયોડેટા', 'Biodata')}</h2>
        <BiodataView
          lang={lang}
          data={revision.data}
          flagged={revision.correction_fields}
          communityConfirmed={Boolean(community?.confirmed_at)}
          age={age}
        />

        {decidable ? (
          <BiodataDecision
            lang={lang}
            revisionId={revision.id}
            expectedStatus={revision.status}
            canDecide={isAdmin(context)}
            sanatan={candidate.is_sanatan}
          />
        ) : (
          <p className="admin-alert soft">
            <CheckCheck size={18} />
            <span>
              {t('આ બાયોડેટા પર નિર્ણય લેવાઈ ગયો છે: ', 'This biodata has been decided: ')}
              <b>{status.label}</b>
              {revision.decision_reason && revision.status !== 'correction_requested' ? ` — ${revision.decision_reason}` : ''}
            </span>
          </p>
        )}

        {/* Spec §10: actor, timestamp, reason and affected revision, kept. */}
        {history.length > 0 && (
          <>
            <h2 className="admin-h2">{t('ઇતિહાસ', 'History')}</h2>
            <ol className="admin-history">
              {history.map((entry) => (
                <li key={entry.id} className={entry.action}>
                  <span />
                  <div>
                    <b>{reviewActionLabel(t, entry.action, entry.to_status)}</b>
                    <small>{timeAgo(entry.created_at, lang)}</small>
                    {entry.reason_applicant && <p>{entry.reason_applicant}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </AppShell>
  );
}

/** Where this biodata stands, in words and in the colour of the screen. */
function revisionStatus(t: T, status: Enums<'revision_status'>, live: boolean): {
  label: string; tone: string; screen: string; Icon: LucideIcon;
} {
  switch (status) {
    case 'submitted':
    case 'under_review':
      return { label: t('મંજૂરીની રાહ', 'Waiting for approval'), tone: 'gold', screen: 'gold', Icon: Hourglass };
    case 'approved':
      return live
        ? { label: t('પ્રકાશિત', 'Live'), tone: 'ok', screen: 'green', Icon: Check }
        : { label: t('મંજૂર', 'Approved'), tone: 'ok', screen: 'green', Icon: Check };
    case 'correction_requested':
      return { label: t('પરિવાર સુધારે છે', 'Family is fixing it'), tone: 'warn', screen: 'warn', Icon: Pencil };
    case 'rejected':
      return { label: t('નામંજૂર', 'Rejected'), tone: 'bad', screen: 'bad', Icon: X };
    case 'superseded':
      return { label: t('જૂની આવૃત્તિ', 'Older version'), tone: 'muted', screen: 'rose', Icon: Clock3 };
    default:
      return { label: t('હજી મોકલ્યો નથી', 'Not sent yet'), tone: 'muted', screen: 'rose', Icon: Clock3 };
  }
}
