import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight, Bell, Check, CircleHelp, Clock3, LockKeyhole, MessageSquareText, Pencil, ShieldCheck, X,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { ReviewArt, type ReviewState } from '@/components/onboarding/art';
import { AutoRefresh } from '@/components/onboarding/auto-refresh';
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

  const tone: ReviewState =
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

  // The admin's own words go in a card of their own below the headline, not
  // in this line: a short note like "Pic clear nathi" read as a subtitle is
  // easy to miss, and it is the one thing the family most needs to read.
  const reason = application?.decision_reason?.trim() || null;

  const body = {
    approved: t('તમારી ઓળખ ચકાસાઈ ગઈ છે. હવે બાયોડેટા પૂર્ણ કરો.', 'Your identity is verified. You can now complete your biodata.'),
    correction: t(
      'એડમિને તમારી અરજી તપાસી છે. નીચે લખેલી વિગતો સુધારીને ફરી મોકલો.',
      'An admin has checked your application. Fix what is noted below and send it again.',
    ),
    rejected: reason
      ? t('એડમિને તમારી અરજી તપાસી છે. કારણ નીચે લખેલું છે.', 'An admin has checked your application. Their reason is below.')
      : t('કારણ જાણવા માટે સ્વયંસેવકને ફોન કરો.', 'Please call a volunteer to find out why.'),
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

  // Spec §10: a correction names the fields, so the applicant knows what to
  // change rather than re-reading the whole form.
  const fieldName: Record<string, string> = {
    full_name: t('પૂરું નામ', 'Full name'),
    date_of_birth: t('જન્મ તારીખ', 'Date of birth'),
    father_name: t('પિતાનું નામ', 'Father’s name'),
    city: t('શહેર', 'City'),
    birth_certificate: t('જન્મ પ્રમાણપત્ર', 'Birth certificate'),
    identity_document: t('આધાર / મતદાર કાર્ડ', 'Aadhaar / Voter ID'),
  };
  const corrections = tone === 'correction' ? application?.correction_fields ?? [] : [];

  // Three steps, so a family can see there is exactly one wait between them
  // and the biodata — not an open-ended queue.
  const reviewStep = {
    approved: { state: 'done', note: t('ઓળખ ચકાસાઈ ગઈ', 'Identity verified') },
    correction: { state: 'act', note: t('તમારા સુધારાની રાહ છે', 'Waiting for your update') },
    rejected: { state: 'stop', note: t('મંજૂર થઈ શકી નથી', 'Not approved') },
    pending: {
      state: 'now',
      note: overdue
        ? t('ધાર્યા કરતાં વધુ સમય — એડમિનને જાણ કરી છે', 'Taking longer — an admin has been alerted')
        : t('સામાન્ય રીતે 24 કલાકમાં', 'Usually within 24 hours'),
    },
  }[tone];

  const steps = [
    {
      state: 'done',
      title: t('વિગતો અને દસ્તાવેજ મળ્યાં', 'Details & documents received'),
      note: t('જન્મ પ્રમાણપત્ર અને ફોટો ઓળખપત્ર — ફક્ત એડમિન જુએ છે', 'Birth certificate and photo ID — only an admin sees them'),
    },
    { state: reviewStep.state, title: t('એડમિન સમીક્ષા', 'Admin review'), note: reviewStep.note },
    ...(tone === 'rejected' ? [] : [{
      state: tone === 'approved' ? 'open' : 'next',
      title: t('બાયોડેટા અને મેળ', 'Biodata & matches'),
      note: tone === 'approved'
        ? t('હવે ખુલ્લું છે', 'Open now')
        : t('મંજૂરી મળતાં જ ખુલશે', 'Opens the moment you’re approved'),
    }]),
  ];

  const stepIcon = (state: string) =>
    state === 'done' ? <Check size={16} strokeWidth={3} />
      : state === 'now' ? <Clock3 size={16} strokeWidth={2.4} />
        : state === 'open' ? <ArrowRight size={16} strokeWidth={2.8} />
          : state === 'act' ? <Pencil size={14} strokeWidth={2.6} />
            : state === 'stop' ? <X size={16} strokeWidth={3} />
              : <LockKeyhole size={14} strokeWidth={2.4} />;

  const toneClass = { approved: 'green', correction: 'warn', rejected: 'bad', pending: 'gold' }[tone];

  return (
    <AppShell lang={lang} context={context}>
      {/* Waiting is the only state that changes without the member doing
          anything, so only then does the screen keep checking. */}
      {tone === 'pending' && <AutoRefresh />}

      <section className={`review-screen tone-${toneClass}`}>
        <div className="review-stage">
          <ReviewArt state={tone} />
        </div>

        <div className="review-copy">
          <span className={`review-badge ${tone}`}>
            <i />
            {badge}
          </span>
          <h1>{headline}</h1>
          <p>{body}</p>
        </div>

        {(tone === 'rejected' || tone === 'correction') && (reason || corrections.length > 0) && (
          <div className="review-reason">
            {reason && (
              <>
                <p className="review-reason-label">
                  <MessageSquareText size={17} />
                  {tone === 'rejected' ? t('એડમિનનું કારણ', 'Reason from the admin') : t('એડમિનનો સંદેશ', 'Message from the admin')}
                </p>
                <p className="review-reason-text">{reason}</p>
              </>
            )}
            {corrections.length > 0 && (
              <>
                <p className="review-reason-label">
                  <Pencil size={15} />
                  {t('આ વિગતો સુધારવાની છે', 'These need changing')}
                </p>
                <ul>
                  {corrections.map((field) => <li key={field}>{fieldName[field] ?? field}</li>)}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="review-card">
          <span className="avatar">{candidate.full_name.charAt(0)}</span>
          <div>
            <b>{candidate.full_name}</b>
            <small>
              {candidate.public_code}
              {application?.submitted_at ? ` · ${t('મોકલી', 'Sent')} ${timeAgo(application.submitted_at, lang)}` : ''}
            </small>
          </div>
          {tone !== 'rejected' && <ShieldCheck size={22} />}
        </div>

        <ol className="review-steps">
          {steps.map((step, i) => (
            <li key={step.title} className={step.state} style={{ '--i': i } as React.CSSProperties}>
              <span>{stepIcon(step.state)}</span>
              <div>
                <b>{step.title}</b>
                <small>{step.note}</small>
              </div>
            </li>
          ))}
        </ol>

        {/* A parent's other children each carry their own state (spec §2). */}
        {context.candidates.length > 1 && (
          <div className="review-others">
            <p>{t('તમારા અન્ય ઉમેદવારો', 'Your other candidates')}</p>
            {context.candidates
              .filter((entry) => entry.id !== candidate.id)
              .map((entry) => (
                <div className="review-card small" key={entry.id}>
                  <span className="avatar">{entry.full_name.charAt(0)}</span>
                  <div>
                    <b>{entry.full_name}</b>
                    <small>{entry.public_code} · {entry.identity_status}</small>
                  </div>
                </div>
              ))}
          </div>
        )}

        <div className="review-actions">
          {tone === 'approved' ? (
            <Link className="cta" href="/home">
              {t('હોમ પર જાઓ', 'Go to member home')}
              <ArrowRight size={20} />
            </Link>
          ) : tone === 'correction' ? (
            <Link className="cta" href="/register">
              {t('વિગતો સુધારો', 'Update details')}
              <ArrowRight size={20} />
            </Link>
          ) : tone === 'rejected' ? (
            <p className="review-note">
              <Pencil size={18} />
              {t(
                'ભૂલ લાગે છે? સ્વયંસેવકને ફોન કરો — તેઓ અરજી સુધારવા માટે ફરી ખોલી શકે છે.',
                'Think this is a mistake? Call a volunteer. They can reopen the application so you can fix it.',
              )}
            </p>
          ) : tone === 'pending' ? (
            <p className="review-note">
              <Bell size={18} />
              {t(
                'સ્થિતિ અહીં આપોઆપ અપડેટ થશે. ફરી નોંધણી કરવાની જરૂર નથી.',
                'This screen updates by itself. There’s no need to register again.',
              )}
            </p>
          ) : null}

          <Link className="intro-login" href="/support">
            <CircleHelp size={18} />
            <span>
              {t('કોઈ પ્રશ્ન છે?', 'Any questions?')} <b>{t('સ્વયંસેવકને ફોન કરો', 'Call a volunteer')}</b>
            </span>
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
