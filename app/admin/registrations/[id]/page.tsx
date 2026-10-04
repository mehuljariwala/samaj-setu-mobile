import Link from 'next/link';
import {
  AlarmClock, ArrowLeft, CalendarDays, CheckCheck, Hourglass, ListChecks, MapPin, Phone, RotateCcw, ShieldCheck, UserRound, ChevronRight, KeyRound,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { CertificateViewer } from '@/components/app/certificate-viewer';
import { DuplicateDecision, RegistrationDecision } from '@/components/app/admin-decision';
import { AdminPhotos } from '@/components/app/admin-photos';
import { BiodataView } from '@/components/app/biodata-view';
import { fieldsFor } from '@/components/biodata/model';
import { isAdmin, loadAdminPage } from '@/lib/data/guards';
import { getLatestBiodata, getProfilePhotos, getRegistrationDetail } from '@/lib/data/admin';
import {
  applicationStatusLabel, certificateLabel, correctionFieldLabel, identityStatusLabel, relationshipLabel, reviewActionLabel, reviewSla, slaLabel,
} from '@/lib/admin-labels';
import { ageFrom, formatDate } from '@/lib/age';
import { timeAgo, translator } from '@/lib/i18n';
import type { Enums } from '@/lib/supabase/database.types';

/** The fields a correction may name. Mirrors what the registration form edits. */
const CORRECTABLE = ['full_name', 'date_of_birth', 'father_name', 'city', 'birth_certificate', 'identity_document'];

type DocumentMeta = { id: string; mime_type: string; size_bytes: number; uploaded_at: string };

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
  candidate: { id: string; full_name: string; date_of_birth: string; father_name: string | null; city: string | null; public_code: string; identity_status: string; is_sanatan: boolean };
  operators: { account_id: string; phone: string; display_name: string | null; relationship: string; role: string; phone_verified: boolean }[];
  certificate: (DocumentMeta & { type: 'birth' | 'leaving' }) | null;
  identity: { type: 'aadhaar' | 'voter_id'; front: DocumentMeta | null; back: DocumentMeta | null } | null;
  duplicates: {
    id: string; status: string; similarity: number; reasons: string[];
    candidate: { id: string; public_code: string; full_name: string; date_of_birth: string; city: string | null; identity_status: string };
  }[];
  history: { id: string; action: string; to_status: string | null; reason_applicant: string | null; internal_note: string | null; created_at: string }[];
};

/**
 * Spec §10: submitted details, private certificate inspection, duplicate
 * candidates, previous decisions, and the review actions.
 *
 * Since the one-approval change it is also where the biodata is read: it is
 * sent with the registration, and approving here publishes both.
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
  const [biodata, photos] = await Promise.all([getLatestBiodata(candidate.id), getProfilePhotos(candidate.id)]);
  // Sent with this registration, so this decision covers it. An application
  // sent before the change has no biodata yet, and its biodata follows later.
  const travelling = biodata !== null && biodata.status !== 'approved' && biodata.status !== 'superseded';
  const openDuplicates = duplicates.filter((entry) => entry.status === 'open');
  const decidable = application.status === 'submitted' || application.status === 'under_review';
  const idName = detail.identity?.type === 'voter_id'
    ? t('મતદાર ઓળખપત્ર', 'Voter ID')
    : detail.identity?.type === 'aadhaar'
      ? t('આધાર કાર્ડ', 'Aadhaar card')
      : t('ઓળખપત્ર', 'Photo ID');
  const documentCount = [detail.certificate, detail.identity?.front, detail.identity?.back].filter(Boolean).length;

  const sla = decidable ? reviewSla(application.submitted_at, application.review_due_at, null) : null;
  const tone = application.status === 'approved' ? 'green'
    : application.status === 'rejected' ? 'bad'
      : application.status === 'correction_requested' ? 'warn'
        : sla?.state === 'overdue' ? 'bad'
          : sla?.state === 'soon' ? 'gold'
            : 'rose';
  const age = ageFrom(candidate.date_of_birth);

  return (
    <AppShell lang={lang} context={context} admin>
      <section className={`admin-screen tone-${tone}`}>
        <div className="admin-detail-top">
          <Link className="round-button" href="/admin" aria-label={t('નોંધણી પર પાછા', 'Back to registrations')}>
            <ArrowLeft size={20} />
          </Link>
          <span>{t('નોંધણી સમીક્ષા', 'Registration review')}</span>
        </div>

        {/* Who, where they stand, and how long they have been waiting. */}
        <div className="admin-person">
          <span className="avatar lg">{candidate.full_name.charAt(0)}</span>
          <div>
            <small>{candidate.public_code}</small>
            <h1>{candidate.full_name}</h1>
            <span className="admin-status">{applicationStatusLabel(t, application.status)}</span>
            {candidate.is_sanatan && <span className="sanatan-tag">{t('સનાતન દીકરી', 'Sanatan daughter')}</span>}
          </div>
          {sla && sla.state !== 'none' && (
            <div className={`admin-person-sla sla-${sla.state}`}>
              <p>
                {sla.state === 'overdue' ? <AlarmClock size={15} /> : <Hourglass size={15} />}
                <b>{slaLabel(t, sla)}</b>
                <span>{t('24 કલાકના લક્ષ્યમાંથી', 'of the 24-hour target')}</span>
              </p>
              <span className="admin-bar" aria-hidden="true"><i style={{ '--used': sla.used } as React.CSSProperties} /></span>
            </div>
          )}
        </div>

        <h2 className="admin-h2">{t('જાહેર કરેલી વિગતો', 'What they told us')}</h2>
        <dl className="admin-facts-card">
          <div><dt><CalendarDays size={16} />{t('જન્મ તારીખ', 'Date of birth')}</dt><dd>{formatDate(candidate.date_of_birth, lang)}{age !== null && <small>{t(`${age} વર્ષ`, `${age} yrs`)}</small>}</dd></div>
          <div><dt><UserRound size={16} />{t('પિતાનું નામ', 'Father’s name')}</dt><dd>{candidate.father_name ?? '—'}</dd></div>
          <div><dt><MapPin size={16} />{t('શહેર', 'City')}</dt><dd>{candidate.city ?? '—'}</dd></div>
          <div><dt><ShieldCheck size={16} />{t('ઓળખ', 'Identity')}</dt><dd>{identityStatusLabel(t, candidate.identity_status)}</dd></div>
          {application.resubmit_count > 0 && (
            <div><dt><RotateCcw size={16} />{t('ફરી મોકલ્યું', 'Resubmitted')}</dt><dd>{application.resubmit_count}×</dd></div>
          )}
        </dl>

        <h2 className="admin-h2">{t('જોડાયેલા ખાતાં', 'Linked accounts')}</h2>
        <div className="admin-accounts">
          {/* The account opens where an admin resets a password or switches it
              off; the phone beside it calls the family. */}
          {operators.map((operator) => (
            <div key={operator.account_id} className="admin-account split">
              <Link className="admin-account-main" href={`/admin/users/${operator.account_id}`}>
                <span className="admin-account-icon"><KeyRound size={17} /></span>
                <span>
                  <b>+91 {operator.phone}</b>
                  <small>
                    {operator.role === 'candidate' ? t('ઉમેદવાર', 'Candidate') : t('વાલી', 'Guardian')} · {relationshipLabel(t, operator.relationship)}
                    {/* This release sends no OTP, so say plainly that the number
                        is a claim the documents have to corroborate. */}
                    {!operator.phone_verified && <> · <i className="admin-account-unverified">{t('નંબર અચકાસાયેલ', 'Number unverified')}</i></>}
                  </small>
                  <small className="admin-account-manage">{t('એકાઉન્ટ સંભાળો · પાસવર્ડ રીસેટ', 'Manage · reset password')}</small>
                </span>
                <ChevronRight size={18} />
              </Link>
              <a className="admin-account-call" href={`tel:+91${operator.phone}`} aria-label={t('ફોન કરો', 'Call')}>
                <Phone size={18} />
              </a>
            </div>
          ))}
        </div>

        {/* All three together, so the reviewer compares them side by side:
            the certificate for the birth details, the ID for the person. */}
        <div className="admin-h2 with-count">
          <h2>{t('દસ્તાવેજ', 'Documents')}</h2>
          <span className={documentCount === 3 ? 'ok' : 'bad'}>{documentCount} / 3</span>
        </div>
        <div className="admin-docs">
          <CertificateViewer
            lang={lang}
            applicationId={application.id}
            meta={detail.certificate}
            title={certificateLabel(t, detail.certificate?.type)}
            hint={false}
          />
          <CertificateViewer
            lang={lang}
            applicationId={application.id}
            kind="identity_front"
            meta={detail.identity?.front ?? null}
            title={`${idName} · ${t('આગળની બાજુ', 'front')}`}
            hint={false}
          />
          <CertificateViewer
            lang={lang}
            applicationId={application.id}
            kind="identity_back"
            meta={detail.identity?.back ?? null}
            title={`${idName} · ${t('પાછળની બાજુ', 'back')}`}
          />
        </div>

        <div className="admin-check">
          <p><ListChecks size={17} />{t('મંજૂરી પહેલાં તપાસો', 'Before you approve, check')}</p>
          <ul>
            <li>{t('નામ, જન્મ તારીખ અને પિતાનું નામ પ્રમાણપત્ર સાથે મેળ ખાય છે', 'Name, birth date and father match the certificate')}</li>
            <li>{t('પ્રમાણપત્ર ઓરિજિનલનો ફોટો છે, ઝેરોક્સનો નહીં', 'The certificate is a photo of the original, not a photocopy')}</li>
            <li>{t('ઓળખપત્ર પરનું નામ અને ફોટો એ જ વ્યક્તિના છે', 'The name and photo on the ID are the same person')}</li>
            <li>{t('ઓળખપત્ર પર સરનામું વાંચી શકાય છે', 'The address on the ID can be read')}</li>
            <li>{t('આગળ અને પાછળની બાજુ એક જ કાર્ડની છે', 'Front and back are of the same card')}</li>
            {travelling && (
              <li>{t('બાયોડેટા સાચો લાગે છે અને પરિવારોને બતાવી શકાય એવો છે', 'The biodata looks right and is fit to show families')}</li>
            )}
          </ul>
        </div>

        {/* The face, to compare with the photo ID; approved with the profile. */}
        <AdminPhotos lang={lang} photos={photos} />

        {/* The biodata sent with the registration: approving publishes it. */}
        <h2 className="admin-h2">{t('બાયોડેટા', 'Biodata')}</h2>
        {biodata ? (
          <BiodataView lang={lang} data={biodata.data} flagged={biodata.correction_fields} age={age} />
        ) : (
          <p className="admin-alert soft">
            <ListChecks size={18} />
            <span>
              {t(
                'આ અરજી બાયોડેટા વગર આવી હતી. મંજૂરી પછી પરિવાર બાયોડેટા મોકલશે અને તે અલગથી મંજૂર થશે.',
                'This application came without a biodata. After approval the family sends it, and it is approved separately.',
              )}
            </span>
          </p>
        )}

        {/* Spec §4: a prompt to compare two records — not a decision about
            either of them, and never an automatic merge. */}
        {duplicates.length > 0 && (
          <>
            <div className="admin-h2 with-count">
              <h2>{t('સંભવિત ડુપ્લિકેટ', 'Possible duplicates')}</h2>
              <span className={openDuplicates.length ? 'bad' : 'ok'}>{openDuplicates.length}</span>
            </div>
            {duplicates.map((entry) => (
              <div className="admin-duplicate" key={entry.id}>
                <div className="admin-row-top">
                  <span className="avatar">{entry.candidate.full_name.charAt(0)}</span>
                  <span className="admin-row-name">
                    <b>{entry.candidate.full_name}</b>
                    <small>
                      {entry.candidate.public_code} · {entry.candidate.date_of_birth}
                      {entry.candidate.city ? ` · ${entry.candidate.city}` : ''}
                    </small>
                  </span>
                  <span className="admin-match">{Math.round(entry.similarity * 100)}%</span>
                </div>
                <small className="admin-duplicate-why">{entry.reasons.join(' · ')}</small>
                {entry.status === 'open'
                  ? <DuplicateDecision lang={lang} duplicateId={entry.id} />
                  : <span className="admin-status">{entry.status === 'confirmed' ? t('એક જ વ્યક્તિ', 'Same person') : t('અલગ વ્યક્તિ', 'Different people')}</span>}
              </div>
            ))}
          </>
        )}

        {!decidable && (
          <p className="admin-alert soft">
            <CheckCheck size={18} />
            <span>
              {t('આ અરજી પર નિર્ણય લેવાઈ ગયો છે: ', 'A decision has already been recorded: ')}
              <b>{applicationStatusLabel(t, application.status)}</b>
              {application.decision_reason ? ` — ${application.decision_reason}` : ''}
            </span>
          </p>
        )}

        {/* An admin can also send a rejection back for a fix, when it was
            something the family could have put right. */}
        {(decidable || (application.status === 'rejected' && isAdmin(context))) && (
          <RegistrationDecision
            lang={lang}
            applicationId={application.id}
            expectedStatus={application.status}
            canDecide={isAdmin(context)}
            openDuplicates={openDuplicates.length}
            fields={CORRECTABLE.map((field) => ({ value: field, label: correctionFieldLabel(t, field) }))}
            biodataFields={travelling ? fieldsFor(candidate.is_sanatan).map((field) => ({ value: field.key, label: t(field.gu, field.en) })) : []}
            withBiodata={travelling}
          />
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
                    {(entry.reason_applicant || entry.internal_note) && (
                      <p>{entry.reason_applicant ?? entry.internal_note}</p>
                    )}
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
