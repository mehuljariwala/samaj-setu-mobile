import Link from 'next/link';
import { ArrowLeft, CheckCheck, ShieldCheck } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { CertificateViewer } from '@/components/app/certificate-viewer';
import { DuplicateDecision, RegistrationDecision } from '@/components/app/admin-decision';
import { isAdmin, loadAdminPage } from '@/lib/data/guards';
import { getRegistrationDetail } from '@/lib/data/admin';
import { timeAgo, translator } from '@/lib/i18n';
import type { Enums } from '@/lib/supabase/database.types';

/** The fields a correction may name. Mirrors what the registration form edits. */
const CORRECTABLE = ['full_name', 'date_of_birth', 'father_name', 'city', 'birth_certificate'];

type Detail = {
  application: {
    id: string;
    status: Enums<'application_status'>;
    submitted_at: string | null;
    review_due_at: string | null;
    decision_reason: string | null;
    resubmit_count: number;
    declared: Record<string, string | null>;
  };
  candidate: { id: string; full_name: string; date_of_birth: string; father_name: string | null; city: string | null; public_code: string; identity_status: string };
  operators: { account_id: string; phone: string; display_name: string | null; relationship: string; role: string; phone_verified: boolean }[];
  certificate: { id: string; mime_type: string; size_bytes: number; uploaded_at: string } | null;
  duplicates: {
    id: string; status: string; similarity: number; reasons: string[];
    candidate: { id: string; public_code: string; full_name: string; date_of_birth: string; city: string | null; identity_status: string };
  }[];
  history: { id: string; action: string; to_status: string | null; reason_applicant: string | null; internal_note: string | null; created_at: string }[];
};

/**
 * Spec §10: submitted details, private certificate inspection, duplicate
 * candidates, previous decisions, and the review actions.
 */
export default async function RegistrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { context, lang } = await loadAdminPage();
  const { id } = await params;
  const t = translator(lang);

  const detail = await getRegistrationDetail(id) as unknown as Detail;
  const { application, candidate, operators, duplicates, history } = detail;
  const openDuplicates = duplicates.filter((entry) => entry.status === 'open');
  const decidable = application.status === 'submitted' || application.status === 'under_review';

  return (
    <AppShell lang={lang} context={context} admin>
      <section className="screen-pad">
        <Link className="back-link" href="/admin">
          <ArrowLeft size={17} />
          {t('નોંધણી પર પાછા', 'Back to registrations')}
        </Link>

        <div className="page-title">
          <span className="eyebrow">{candidate.public_code}</span>
          <h1>{candidate.full_name}</h1>
        </div>
        <span className="badge pending">{application.status}</span>

        <div className="detail-list spaced">
          <div><span>{t('જન્મ તારીખ', 'Date of birth')}</span><b>{candidate.date_of_birth}</b></div>
          <div><span>{t('પિતાનું નામ', 'Father’s name')}</span><b>{candidate.father_name}</b></div>
          <div><span>{t('શહેર', 'City')}</span><b>{candidate.city}</b></div>
          <div><span>{t('ઓળખ સ્થિતિ', 'Identity status')}</span><b>{candidate.identity_status}</b></div>
          <div>
            <span>{t('સમીક્ષા મુદત', 'Review due')}</span>
            <b>{application.review_due_at ? timeAgo(application.review_due_at, lang) : '—'}</b>
          </div>
          {application.resubmit_count > 0 && (
            <div><span>{t('ફરી મોકલ્યું', 'Resubmitted')}</span><b>{application.resubmit_count}×</b></div>
          )}
        </div>

        <div className="section-head">
          <h2>{t('જોડાયેલા ખાતાં', 'Linked accounts')}</h2>
        </div>
        <div className="detail-list spaced">
          {operators.map((operator) => (
            <div key={operator.account_id}>
              <span>{operator.role === 'candidate' ? t('ઉમેદવાર', 'Candidate') : t('વાલી', 'Guardian')} · {operator.relationship}</span>
              <b>
                +91 {operator.phone}
                {/* This release sends no OTP, so say plainly that the number is
                    a claim the certificate has to corroborate. */}
                {!operator.phone_verified && ` · ${t('અચકાસાયેલ નંબર', 'unverified number')}`}
              </b>
            </div>
          ))}
        </div>

        <div className="section-head">
          <h2>{t('દસ્તાવેજ', 'Document')}</h2>
        </div>
        <CertificateViewer lang={lang} applicationId={application.id} meta={detail.certificate} />

        <div className="note">
          <ShieldCheck size={19} />
          <p>{t('નામ, જન્મ તારીખ અને પિતાની વિગતો પ્રમાણપત્ર સામે સરખાવો.', 'Compare the name, birth date and father’s details against the certificate.')}</p>
        </div>

        {/* Spec §4: a prompt to compare two records — not a decision about
            either of them, and never an automatic merge. */}
        {duplicates.length > 0 && (
          <>
            <div className="section-head">
              <h2>{t('સંભવિત ડુપ્લિકેટ', 'Possible duplicates')}</h2>
              <span>{openDuplicates.length}</span>
            </div>
            {duplicates.map((entry) => (
              <div className="card row-card" key={entry.id}>
                <span className="avatar">{entry.candidate.full_name.charAt(0)}</span>
                <div>
                  <b>{entry.candidate.full_name}</b>
                  <small>
                    {entry.candidate.public_code} · {entry.candidate.date_of_birth}
                    {entry.candidate.city ? ` · ${entry.candidate.city}` : ''}
                  </small>
                  <small>{entry.reasons.join(', ')} · {Math.round(entry.similarity * 100)}%</small>
                  {entry.status === 'open'
                    ? <DuplicateDecision lang={lang} duplicateId={entry.id} />
                    : <span className="badge approved">{entry.status}</span>}
                </div>
              </div>
            ))}
          </>
        )}

        {decidable ? (
          <RegistrationDecision
            lang={lang}
            applicationId={application.id}
            expectedStatus={application.status}
            canDecide={isAdmin(context)}
            openDuplicates={openDuplicates.length}
            fields={CORRECTABLE}
          />
        ) : (
          <div className="note">
            <CheckCheck size={19} />
            <p>
              {t('આ અરજી પર નિર્ણય લેવાઈ ગયો છે: ', 'A decision has already been recorded: ')}
              <b>{application.status}</b>
              {application.decision_reason ? ` — ${application.decision_reason}` : ''}
            </p>
          </div>
        )}

        {/* Spec §10: actor, timestamp, reason and affected revision, kept. */}
        {history.length > 0 && (
          <>
            <div className="section-head">
              <h2>{t('નિર્ણયનો ઇતિહાસ', 'Decision history')}</h2>
            </div>
            <div className="detail-list spaced">
              {history.map((entry) => (
                <div key={entry.id}>
                  <span>{entry.action} → {entry.to_status} · {timeAgo(entry.created_at, lang)}</span>
                  <b>{entry.reason_applicant ?? entry.internal_note ?? '—'}</b>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
