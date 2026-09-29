import Link from 'next/link';
import {
  ArrowRight, Check, ChevronRight, FileText, Heart, Hourglass, LockKeyhole, Pencil, Search,
  ShieldCheck, Sparkles, UserPlus, Users,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { loadMemberPage } from '@/lib/data/guards';
import { translator } from '@/lib/i18n';
import type { CandidateSummary } from '@/lib/data/session';
import type { T } from '@/lib/i18n';

type Tone = 'rose' | 'gold' | 'green' | 'warn';

/**
 * Spec §6: home shows the next useful action, profile completion, pending
 * requests and review status. `nextStep` is that decision in one place, derived
 * from state the server owns rather than from what the last screen happened to
 * set.
 *
 * Drawn like the onboarding: one pastel panel in the colour of where things
 * stand, one button that always means "go on", and the road so far as steps.
 */
export default async function HomePage() {
  const { context, lang, acting } = await loadMemberPage();
  const t = translator(lang);

  const name = (context.account?.display_name?.trim() || acting?.full_name || '').split(' ')[0];
  const step = acting ? nextStep(acting, t) : null;
  const completion = acting?.biodata?.completion ?? 0;

  const pending = context.candidates.reduce(
    (total, candidate) => total + candidate.pending_interests + candidate.pending_photo_requests,
    0,
  );

  const tiles = [
    { href: '/discover', tone: 'rose', icon: <Search size={20} />, title: t('પ્રોફાઇલ શોધો', 'Discover'), note: t('ચકાસાયેલા સભ્યો', 'Verified members') },
    { href: '/interests', tone: 'gold', icon: <Heart size={20} />, title: t('રસ', 'Interests'), note: pending > 0 ? t(`${pending} જવાબ બાકી`, `${pending} waiting on you`) : t('મોકલેલા અને મળેલા', 'Sent & received'), count: pending },
    { href: '/biodata', tone: 'warn', icon: <FileText size={20} />, title: t('બાયોડેટા', 'Biodata'), note: acting?.biodata ? t(`${completion}% પૂર્ણ`, `${completion}% complete`) : t('શરૂ કરો', 'Get started') },
    { href: '/family', tone: 'green', icon: <Users size={20} />, title: t('પરિવાર', 'Family'), note: t('સંમતિ અને ગોપનીયતા', 'Consent & privacy') },
  ];

  return (
    <AppShell lang={lang} context={context} acting={acting} member>
      <section className={`member-screen tone-${step?.tone ?? 'rose'}`}>
        <div className="member-hero">
          <div className="admin-hero-copy">
            <span className="admin-hello">
              <Sparkles size={15} />
              {name ? t(`જય શ્રી કૃષ્ણ, ${name}`, `Jai Shri Krishna, ${name}`) : t('જય શ્રી કૃષ્ણ', 'Jai Shri Krishna')}
            </span>
            <h1>{step ? step.title : t('ઉમેદવાર ઉમેરો', 'Add a candidate')}</h1>
            <p>
              {step
                ? step.detail
                : t('શરૂ કરવા માટે તમારી અથવા તમારા સંતાનની નોંધણી કરો.', 'Register yourself or your child to begin.')}
            </p>
          </div>
          {acting && (
            <span className="member-dial" style={{ '--p': completion } as React.CSSProperties} aria-hidden="true">
              <b>{completion}<small>%</small></b>
              <small>{t('બાયોડેટા', 'biodata')}</small>
            </span>
          )}
        </div>

        <Link className="cta member-cta" href={step?.href ?? '/register'}>
          {step ? step.cta : t('નોંધણી કરો', 'Register')}
          <ArrowRight size={20} />
        </Link>

        {acting && (
          <>
            <h2 className="admin-h2">{t('તમારી સફર', 'Your journey')}</h2>
            <ol className="review-steps member-steps">
              {journey(acting, t).map((item, i) => (
                <li key={item.title} className={item.state} style={{ '--i': i } as React.CSSProperties}>
                  <span>{stepIcon(item.state)}</span>
                  <div>
                    <b>{item.title}</b>
                    <small>{item.note}</small>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}

        <h2 className="admin-h2">{t('ઝડપી રસ્તા', 'Shortcuts')}</h2>
        <div className="member-tiles">
          {tiles.map((tile, i) => (
            <Link key={tile.href} href={tile.href} className={`member-tile ${tile.tone}`} style={{ '--i': i } as React.CSSProperties}>
              <span>
                {tile.icon}
                {tile.count ? <i>{tile.count}</i> : null}
              </span>
              <b>{tile.title}</b>
              <small>{tile.note}</small>
              <ChevronRight size={17} className="member-tile-go" />
            </Link>
          ))}
        </div>

        {context.candidates.length === 0 && (
          <Link className="intro-login" href="/family/link">
            <UserPlus size={17} />
            <b>{t('હાજર પ્રોફાઇલ સાથે જોડાઓ', 'Link to an existing profile')}</b>
          </Link>
        )}

        <p className="admin-privacy">
          <ShieldCheck size={15} />{' '}
          {t(
            'ફોટા માટે તમારી મંજૂરી. સંપર્ક માટે બંને પરિવારોની સંમતિ.',
            'You approve photo access. Both families agree before contacts are shared.',
          )}
        </p>
      </section>
    </AppShell>
  );
}

type Step = { title: string; detail: string; cta: string; href: string; tone: Tone };

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
      title: t('ઓળખ ચકાસણી ચાલુ છે', 'Identity check in progress'),
      detail: t('મંજૂરી પછી બાયોડેટા ખૂલશે.', 'Biodata opens once an admin has approved you.'),
      cta: t('સ્થિતિ જુઓ', 'Check status'),
      href: '/review',
      tone: 'gold',
    };
  }

  if (!biodata || biodata.status === 'draft') {
    return {
      title: biodata && biodata.completion === 100
        ? t('ડ્રાફ્ટ તૈયાર છે!', 'Your draft is ready!')
        : t('હવે બાયોડેટા પૂર્ણ કરો', 'Now, complete your biodata'),
      detail: biodata && biodata.completion === 100
        ? t('એક નજર નાખો અને સમીક્ષા માટે મોકલો.', 'Take a last look and send it for review.')
        : t('અભ્યાસ, પરિવાર અને પસંદગીઓ ઉમેરો. ડ્રાફ્ટ આપમેળે સચવાય છે.', 'Add education, family and preferences. Your draft saves as you go.'),
      cta: biodata && biodata.completion === 100 ? t('સમીક્ષા માટે મોકલો', 'Review and send') : t('બાયોડેટા ભરો', 'Fill in biodata'),
      href: '/biodata',
      tone: 'rose',
    };
  }

  if (biodata.status === 'correction_requested') {
    return {
      title: t('બાયોડેટામાં સુધારો જરૂરી છે', 'Your biodata needs a fix'),
      detail: biodata.decision_reason
        ?? t('એડમિને કેટલીક વિગતો સુધારવા કહ્યું છે.', 'An admin has asked for some details to be corrected.'),
      cta: t('વિગતો સુધારો', 'Fix the details'),
      href: '/biodata',
      tone: 'warn',
    };
  }

  if (biodata.status === 'submitted' || biodata.status === 'under_review') {
    return {
      title: t('બાયોડેટા સમીક્ષા હેઠળ છે', 'Your biodata is being reviewed'),
      detail: t('એડમિન મંજૂરી પછી ઉમેદવારની સંમતિ છેલ્લું પગલું છે.', 'Once an admin approves it, the candidate’s consent is the last step.'),
      cta: t('બાયોડેટા જુઓ', 'View biodata'),
      href: '/biodata',
      tone: 'gold',
    };
  }

  // Approved, but not yet visible. Spec §4: only the candidate may consent.
  if (!candidate.consent_active) {
    return {
      title: t('છેલ્લું પગલું: સંમતિ', 'Last step: consent'),
      detail: candidate.is_self
        ? t('તમારી સંમતિ પછી જ પ્રોફાઇલ દેખાશે.', 'Your profile becomes visible only once you consent.')
        : t(
          'ઉમેદવાર પોતાના ખાતામાંથી સંમતિ આપે પછી પ્રોફાઇલ દેખાશે. વાલી તેમના વતી સંમતિ આપી શકતા નથી.',
          'The candidate gives consent from their own account. A guardian cannot give it on their behalf.',
        ),
      cta: t('સંમતિ આપો', 'Give consent'),
      href: '/family',
      tone: 'rose',
    };
  }

  if (candidate.paused) {
    return {
      title: t('પ્રોફાઇલ થોભાવેલી છે', 'This profile is paused'),
      detail: t('થોભાવેલી પ્રોફાઇલ ડિરેક્ટરીમાં દેખાતી નથી.', 'A paused profile does not appear in the directory.'),
      cta: t('ફરી શરૂ કરો', 'Resume'),
      href: '/family',
      tone: 'warn',
    };
  }

  return {
    title: t('તમારી પ્રોફાઇલ પ્રકાશિત છે!', 'Your profile is live!'),
    detail: t('હવે તમે પરિચય મોકલી અને મેળવી શકો છો.', 'You can now send and receive introductions.'),
    cta: t('પ્રોફાઇલ શોધો', 'Explore profiles'),
    href: '/discover',
    tone: 'green',
  };
}

type StepState = 'done' | 'now' | 'act' | 'next' | 'open';

/**
 * The same lifecycle as `nextStep`, drawn as the whole road rather than the
 * one thing blocking it — so a family can see how far they have come.
 */
function journey(candidate: CandidateSummary, t: T): { title: string; note: string; state: StepState }[] {
  const biodata = candidate.biodata;
  const verified = candidate.identity_status === 'verified';
  const written = !!biodata && biodata.status !== 'draft' && biodata.status !== 'correction_requested';
  const approved = biodata?.status === 'approved';

  return [
    {
      title: t('ઓળખ ચકાસણી', 'Identity check'),
      note: verified ? t('ચકાસાઈ ગઈ', 'Verified') : t('એડમિન જોઈ રહ્યા છે', 'An admin is looking'),
      state: verified ? 'done' : 'now',
    },
    {
      title: t('બાયોડેટા', 'Biodata'),
      note: !verified
        ? t('ચકાસણી પછી ખૂલશે', 'Opens after the check')
        : biodata?.status === 'correction_requested'
          ? t('સુધારો જરૂરી', 'Needs a fix')
          : written
            ? t('મોકલાયો', 'Sent')
            : t(`${biodata?.completion ?? 0}% ભર્યો`, `${biodata?.completion ?? 0}% filled in`),
      state: !verified ? 'next' : biodata?.status === 'correction_requested' ? 'act' : written ? 'done' : 'now',
    },
    {
      title: t('બાયોડેટા સમીક્ષા', 'Biodata review'),
      note: approved ? t('મંજૂર', 'Approved') : written ? t('એડમિન જોઈ રહ્યા છે', 'An admin is looking') : t('મોકલ્યા પછી', 'After you send it'),
      state: approved ? 'done' : written ? 'now' : 'next',
    },
    {
      title: t('ઉમેદવારની સંમતિ', 'Candidate’s consent'),
      note: candidate.consent_active ? t('આપી', 'Given') : approved ? t('તમારો વારો', 'Your turn') : t('મંજૂરી પછી', 'After approval'),
      state: candidate.consent_active ? 'done' : approved ? 'now' : 'next',
    },
    {
      title: t('પ્રકાશિત', 'Live in the directory'),
      note: candidate.paused
        ? t('થોભાવેલી', 'Paused')
        : candidate.discoverable
          ? t('ચકાસાયેલા સભ્યો જોઈ શકે છે', 'Verified members can see you')
          : t('છેલ્લું પગલું', 'The last step'),
      state: candidate.paused ? 'act' : candidate.discoverable ? 'open' : 'next',
    },
  ];
}

function stepIcon(state: StepState) {
  switch (state) {
    case 'done': return <Check size={17} strokeWidth={3} />;
    case 'now': return <Hourglass size={16} />;
    case 'act': return <Pencil size={15} />;
    case 'open': return <Sparkles size={16} />;
    default: return <LockKeyhole size={14} />;
  }
}
