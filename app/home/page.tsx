import Link from 'next/link';
import { ArrowRight, Heart, Search, ShieldCheck } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { Progress } from '@/components/ui/progress';
import { loadMemberPage } from '@/lib/data/guards';
import { translator } from '@/lib/i18n';
import type { CandidateSummary } from '@/lib/data/session';
import type { T } from '@/lib/i18n';

/**
 * Spec §6: home shows the next useful action, profile completion, pending
 * requests and review status. `nextStep` is that decision in one place, derived
 * from state the server owns rather than from what the last screen happened to
 * set.
 */
export default async function HomePage() {
  const { context, lang, acting } = await loadMemberPage();
  const t = translator(lang);

  const name = context.account?.display_name?.trim() || t('સભ્ય', 'Member');
  const step = acting ? nextStep(acting, t) : null;
  const completion = acting?.biodata?.completion ?? 0;

  const pending = context.candidates.reduce(
    (total, candidate) => total + candidate.pending_interests,
    0,
  );

  return (
    <AppShell lang={lang} context={context} acting={acting} member>
      <section className="screen-pad">
        <div className="greet">
          <span>{t('જય શ્રી કૃષ્ણ,', 'Jai Shri Krishna,')}</span>
          <h1>{name}</h1>
        </div>

        {step && acting && (
          <div className="progress-card">
            <span className="tagline">
              <ShieldCheck size={12} />
              {acting.identity_status === 'verified'
                ? t('ઓળખ ચકાસાઈ', 'Identity verified')
                : t('ઓળખ સમીક્ષા હેઠળ', 'Identity under review')}
            </span>
            <h2>{step.title}</h2>
            <p>{step.detail}</p>

            <div className="progress-meter">
              <span>{t('બાયોડેટા પૂર્ણતા', 'Biodata completion')}</span>
              <b>{completion}%</b>
            </div>
            <Progress value={completion} aria-label={t('બાયોડેટા પૂર્ણતા', 'Biodata completion')} />

            <Link href={step.href}>
              {step.cta}
              <ArrowRight size={17} />
            </Link>
          </div>
        )}

        <div className="section-head">
          <h2>{t('તમારા માટે', 'Your next steps')}</h2>
          <span>{t('સરળ શરૂઆત', 'A simple start')}</span>
        </div>
        <div className="tiles">
          <Link href="/discover">
            <span className="ic"><Search size={19} /></span>
            <b>{t('પ્રોફાઇલ શોધો', 'Explore profiles')}</b>
            <small>{t('વિગતો, શહેર અને અભ્યાસ જુઓ', 'View details, city & education')}</small>
          </Link>
          <Link href="/interests">
            <span className="ic gold"><Heart size={19} /></span>
            <b>
              {t('રસની વિનંતીઓ', 'Your interests')}
              {pending > 0 ? ` · ${pending}` : ''}
            </b>
            <small>{t('મોકલેલી અને મળેલી વિનંતીઓ', 'Track sent & received requests')}</small>
          </Link>
        </div>

        <div className="trust-card">
          <ShieldCheck size={26} strokeWidth={1.5} />
          <div>
            <h3>{t('ગોપનીયતા તમારા હાથમાં.', 'Your privacy. Your choice.')}</h3>
            <p>{t('ફોટા માટે તમારી મંજૂરી. સંપર્ક માટે બંને પરિવારોની સંમતિ.', 'You approve photo access. Both families agree before sharing contacts.')}</p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

type Step = { title: string; detail: string; cta: string; href: string };

/**
 * The order matters: it walks the lifecycle in the sequence the spec defines,
 * so a member is only ever asked for the one thing that is actually blocking
 * them. Publication needs both admin approval and the candidate's own consent,
 * and those are separate steps because either can be outstanding alone.
 */
function nextStep(candidate: CandidateSummary, t: T): Step {
  const biodata = candidate.biodata;

  if (candidate.identity_status !== 'verified') {
    return {
      title: t('ઓળખ ચકાસણી ચાલુ છે', 'Identity verification in progress'),
      detail: t('મંજૂરી પછી બાયોડેટા ખૂલશે.', 'Biodata opens once an admin has approved you.'),
      cta: t('સ્થિતિ જુઓ', 'Check status'),
      href: '/review',
    };
  }

  if (!biodata || biodata.status === 'draft') {
    return {
      title: biodata && biodata.completion === 100
        ? t('ડ્રાફ્ટ તૈયાર છે. હવે સમીક્ષા માટે મોકલો.', 'Draft ready. Send it for review.')
        : t('આગળ: બાયોડેટા પૂર્ણ કરો', 'Next: complete your biodata'),
      detail: t(
        'અભ્યાસ, પરિવાર અને પસંદગીઓ ઉમેરો. પછી ઉમેદવારની સંમતિ અને એડમિન સમીક્ષા થશે.',
        'Add education, family and preferences. Candidate consent and admin review come next.',
      ),
      cta: t('બાયોડેટા ખોલો', 'Open biodata'),
      href: '/biodata',
    };
  }

  if (biodata.status === 'correction_requested') {
    return {
      title: t('બાયોડેટામાં સુધારો જરૂરી છે', 'Your biodata needs a correction'),
      detail: biodata.decision_reason
        ?? t('એડમિને કેટલીક વિગતો સુધારવા કહ્યું છે.', 'An admin has asked for some details to be corrected.'),
      cta: t('વિગતો સુધારો', 'Fix the details'),
      href: '/biodata',
    };
  }

  if (biodata.status === 'submitted' || biodata.status === 'under_review') {
    return {
      title: t('બાયોડેટા સમીક્ષા હેઠળ છે', 'Your biodata is under review'),
      detail: t('એડમિન મંજૂરી પછી ઉમેદવારની સંમતિ જરૂરી છે.', 'Once an admin approves it, the candidate’s consent is the last step.'),
      cta: t('બાયોડેટા જુઓ', 'View biodata'),
      href: '/biodata',
    };
  }

  // Approved, but not yet visible. Spec §4: only the candidate may consent.
  if (!candidate.consent_active) {
    return {
      title: t('છેલ્લું પગલું: ઉમેદવારની સંમતિ', 'Last step: the candidate’s consent'),
      detail: candidate.is_self
        ? t('તમારી સંમતિ પછી જ પ્રોફાઇલ દેખાશે.', 'Your profile becomes visible only once you consent.')
        : t(
          'ઉમેદવાર પોતાના ખાતામાંથી સંમતિ આપે પછી પ્રોફાઇલ દેખાશે. વાલી તેમના વતી સંમતિ આપી શકતા નથી.',
          'The candidate gives consent from their own account. A guardian cannot give it on their behalf.',
        ),
      cta: t('પરિવાર ખોલો', 'Open Family'),
      href: '/family',
    };
  }

  if (candidate.paused) {
    return {
      title: t('પ્રોફાઇલ થોભાવેલી છે', 'This profile is paused'),
      detail: t('થોભાવેલી પ્રોફાઇલ ડિરેક્ટરીમાં દેખાતી નથી.', 'A paused profile does not appear in the directory.'),
      cta: t('ફરી શરૂ કરો', 'Resume'),
      href: '/family',
    };
  }

  return {
    title: t('તમારી પ્રોફાઇલ પ્રકાશિત છે', 'Your profile is published'),
    detail: t('હવે તમે પરિચય મોકલી અને મેળવી શકો છો.', 'You can now send and receive introductions.'),
    cta: t('પ્રોફાઇલ શોધો', 'Explore profiles'),
    href: '/discover',
  };
}
