import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight, Bell, Check, CircleHelp, Clock3, FileText, Pencil, ShieldCheck,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { loadApplicantPage } from '@/lib/data/guards';
import { timeAgo, translator } from '@/lib/i18n';
import type { CandidateSummary } from '@/lib/data/session';

/**
 * Application status. Spec §3: show "under review, allow up to 24 hours", and
 * after the target is exceeded show an honest delayed state rather than a
 * countdown that has already run out.
 *
 * `overdue` is computed by the database against `review_due_at`, so the message
 * cannot disagree with what the admin dashboard is flagging.
 */
export default async function ReviewPage() {
  const { context, lang } = await loadApplicantPage();
  const t = translator(lang);

  if (context.access_state === 'no_application') redirect('/register');

  // A parent with several children sees the one that needs them most.
  const candidate = pickMostUrgent(context.candidates);
  if (!candidate) redirect('/register');

  const application = candidate.application;
  const status = application?.status ?? 'draft';
  const overdue = application?.overdue ?? false;

  const tone =
    candidate.identity_status === 'verified' ? 'approved'
      : status === 'correction_requested' ? 'correction'
        : status === 'rejected' ? 'rejected'
          : 'pending';

  const badge = {
    approved: t('મંજૂર', 'Approved'),
    correction: t('સુધારો જરૂરી', 'Correction needed'),
    rejected: t('નામંજૂર', 'Rejected'),
    pending: t('સમીક્ષા બાકી', 'Pending review'),
  }[tone];

  const headline = {
    approved: t('સમાજમાં તમારું સ્વાગત છે!', 'Welcome to your community!'),
    correction: t('થોડો સુધારો જરૂરી છે.', 'A little update is needed.'),
    rejected: t('અરજી મંજૂર થઈ શકી નથી.', 'We couldn’t approve this application.'),
    pending: t('તમારી અરજી સમીક્ષા હેઠળ છે.', 'You’re in good hands.'),
  }[tone];

  const body = {
    approved: t('તમારી ઓળખ ચકાસાઈ ગઈ છે. હવે બાયોડેટા પૂર્ણ કરો.', 'Your identity is verified. You can now complete your biodata.'),
    correction: application?.decision_reason
      ?? t('એડમિને થોડો સુધારો માંગ્યો છે.', 'An admin has asked for a correction.'),
    rejected: application?.decision_reason
      ?? t('કૃપા કરીને સહાય માટે એડમિનનો સંપર્ક કરો.', 'Please contact an admin for help.'),
    pending: overdue
      ? t(
        'સમીક્ષા અપેક્ષા કરતાં વધુ સમય લઈ રહી છે. તમારી અરજી એડમિન માટે ફ્લેગ કરી છે — તમારે કંઈ કરવાનું નથી.',
        'This review is taking longer than our 24-hour target. Your application has been flagged for an admin — there is nothing you need to do.',
      )
      : t(
        'અમારા એડમિન તમારી વિગતો ચકાસી રહ્યા છે. મંજૂરી માટે 24 કલાક સુધી રાહ જુઓ.',
        'Our community admins are checking your details. Please allow up to 24 hours.',
      ),
  }[tone];

  return (
    <AppShell lang={lang} context={context}>
      <section>
        <div className="status-hero">
          <div className={`status-ring ${tone}`}>
            {tone === 'approved' ? <ShieldCheck size={40} strokeWidth={1.4} />
              : tone === 'pending' ? <Clock3 size={40} strokeWidth={1.4} />
                : tone === 'correction' ? <Pencil size={34} />
                  : <FileText size={34} />}
          </div>
          <span className={`badge ${tone}`}>{badge}</span>
          <h1>{headline}</h1>
          <p>{body}</p>
        </div>

        <div className="screen-pad">
          <div className="card row-card">
            <span className="avatar">{candidate.full_name.charAt(0)}</span>
            <div>
              <b>{candidate.full_name}</b>
              <small>
                {t('અરજી નંબર', 'Application')} {candidate.public_code}
                {application?.submitted_at ? ` · ${timeAgo(application.submitted_at, lang)}` : ''}
              </small>
            </div>
            <ShieldCheck size={21} className="ok-icon" />
          </div>

          <div className="timeline">
            <div className="done">
              <span><Check size={15} /></span>
              <div>
                <b>{t('વિગતો અને પ્રમાણપત્ર મળ્યાં', 'Details & certificate received')}</b>
                <small>{t('ચકાસણી માટે સુરક્ષિત રીતે રજૂ કર્યું', 'Submitted for private verification')}</small>
              </div>
            </div>
            <div className={tone === 'approved' ? 'done' : 'now'}>
              <span>{tone === 'approved' ? <Check size={15} /> : <Clock3 size={15} />}</span>
              <div>
                <b>{t('એડમિન સમીક્ષા', 'Admin review')}</b>
                <small>{badge}</small>
              </div>
            </div>
          </div>

          {/* Spec §10: a correction names the fields, so the applicant knows
              what to change rather than re-reading the whole form. */}
          {tone === 'correction' && (application?.correction_fields.length ?? 0) > 0 && (
            <div className="note">
              <Pencil size={18} />
              <p>
                {t('આ વિગતો સુધારવાની છે: ', 'These details need changing: ')}
                <b>{application!.correction_fields.join(', ')}</b>
              </p>
            </div>
          )}

          {tone === 'approved' ? (
            <Link className="primary" href="/home">
              {t('હોમ પર જાઓ', 'Go to member home')}
              <ArrowRight size={19} />
            </Link>
          ) : tone === 'correction' ? (
            <Link className="primary" href="/register">
              {t('વિગતો સુધારો', 'Update details')}
              <Pencil size={17} />
            </Link>
          ) : (
            <div className="note">
              <Bell size={18} />
              <p>{t('સ્થિતિ અહીં અપડેટ થશે. ફરી નોંધણી કરવાની જરૂર નથી.', 'Your status will update here. There’s no need to register again.')}</p>
            </div>
          )}

          {/* A parent's other children each carry their own state (spec §2). */}
          {context.candidates.length > 1 && (
            <>
              <div className="section-head">
                <h2>{t('તમારા અન્ય ઉમેદવારો', 'Your other candidates')}</h2>
              </div>
              {context.candidates
                .filter((entry) => entry.id !== candidate.id)
                .map((entry) => (
                  <div className="card row-card" key={entry.id}>
                    <span className="avatar">{entry.full_name.charAt(0)}</span>
                    <div>
                      <b>{entry.full_name}</b>
                      <small>{entry.public_code} · {entry.identity_status}</small>
                    </div>
                  </div>
                ))}
            </>
          )}

          <Link className="text-button muted center" href="/support">
            <CircleHelp size={16} />
            {t('મદદ જોઈએ છે?', 'Need a hand?')}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

/** Correction first — it is the only state where the applicant must act. */
function pickMostUrgent(candidates: CandidateSummary[]): CandidateSummary | undefined {
  const order = ['correction_requested', 'pending', 'rejected', 'unverified', 'verified'];
  return [...candidates].sort(
    (a, b) => order.indexOf(a.identity_status) - order.indexOf(b.identity_status),
  )[0];
}
