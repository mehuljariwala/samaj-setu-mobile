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
    { href: '/family', tone: 'green', icon: <Users size={20} />, title: t('પરિવાર', 'Family'), note: t('ગોપનીયતા અને વિરામ', 'Privacy & pause') },
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
 * The order matters: it walks the lifecycle in sequence, so a member is only
 * ever asked for the one thing that is actually blocking them. An admin's
 * approval publishes the profile; there is no consent step after it.
 */
function nextStep(candidate: CandidateSummary, t: T): Step {
  const biodata = candidate.biodata;

  const fix: Step = {
    title: t('બાયોડેટામાં સુધારો જરૂરી છે', 'Your biodata needs a fix'),
    detail: biodata?.decision_reason
      ?? t('એડમિને કેટલીક વિગતો સુધારવા કહ્યું છે.', 'An admin has asked for some details to be corrected.'),
    cta: t('વિગતો સુધારો', 'Fix the details'),
    href: '/biodata',
    tone: 'warn',
  };
  const paused: Step = {
    title: t('પ્રોફાઇલ થોભાવેલી છે', 'This profile is paused'),
    detail: t('થોભાવેલી પ્રોફાઇલ ડિરેક્ટરીમાં દેખાતી નથી.', 'A paused profile does not appear in the directory.'),
    cta: t('ફરી શરૂ કરો', 'Resume'),
    href: '/family',
    tone: 'warn',
  };
  const live: Step = {
    title: t('તમારી પ્રોફાઇલ પ્રકાશિત છે!', 'Your profile is live!'),
    detail: t('હવે તમે પરિચય મોકલી અને મેળવી શકો છો.', 'You can now send and receive introductions.'),
    cta: t('પ્રોફાઇલ શોધો', 'Explore profiles'),
    href: '/discover',
    tone: 'green',
  };

  if (candidate.identity_status !== 'verified') {
    return {
      title: t('ઓળખ ચકાસણી ચાલુ છે', 'Identity check in progress'),
      detail: t('મંજૂરી પછી બાયોડેટા ખૂલશે.', 'Biodata opens once an admin has approved you.'),
      cta: t('સ્થિતિ જુઓ', 'Check status'),
      href: '/review',
      tone: 'gold',
    };
  }

  // An approved profile stays live while its family changes it, so changes in
  // hand are mentioned rather than put in the way.
  if (candidate.publication_status === 'published') {
    if (candidate.paused) return paused;
    if (biodata?.status === 'correction_requested') return fix;
    if (biodata?.status === 'draft') {
      return {
        ...live,
        detail: t(
          'તમારા ફેરફાર હજી મોકલ્યા નથી. એડમિન મંજૂર કરે ત્યાં સુધી પરિવારોને મંજૂર બાયોડેટા જ દેખાશે.',
          'Your changes are not sent yet. Families see the approved biodata until an admin approves them.',
        ),
        cta: t('ફેરફાર પૂરા કરો', 'Finish your changes'),
        href: '/biodata',
      };
    }
    if (biodata?.status === 'submitted' || biodata?.status === 'under_review') {
      return {
        ...live,
        detail: t(
          'તમારા ફેરફાર એડમિન પાસે છે. ત્યાં સુધી પરિવારોને મંજૂર બાયોડેટા જ દેખાય છે.',
          'Your changes are with an admin. Until then, families see the approved biodata.',
        ),
      };
    }
    return live;
  }

  if (!biodata || biodata.status === 'draft') {
    return {
      title: biodata && biodata.completion === 100
        ? t('ડ્રાફ્ટ તૈયાર છે!', 'Your draft is ready!')
        : t('હવે બાયોડેટા પૂર્ણ કરો', 'Now, complete your biodata'),
      detail: biodata && biodata.completion === 100
        ? t('એક નજર નાખો અને મંજૂરી માટે મોકલો.', 'Take a last look and send it for approval.')
        : t('અભ્યાસ, પરિવાર અને પસંદગીઓ ઉમેરો. ડ્રાફ્ટ આપમેળે સચવાય છે.', 'Add education, family and preferences. Your draft saves as you go.'),
      cta: biodata && biodata.completion === 100 ? t('સમીક્ષા માટે મોકલો', 'Review and send') : t('બાયોડેટા ભરો', 'Fill in biodata'),
      href: '/biodata',
      tone: 'rose',
    };
  }

  if (biodata.status === 'correction_requested') return fix;

  if (biodata.status === 'submitted' || biodata.status === 'under_review') {
    return {
      title: t('બાયોડેટા મંજૂરીની રાહમાં છે', 'Your biodata is waiting for approval'),
      detail: t('એડમિન મંજૂરી આપે એટલે પ્રોફાઇલ તરત દેખાશે.', 'Your profile goes live as soon as an admin approves it.'),
      cta: t('બાયોડેટા જુઓ', 'View biodata'),
      href: '/biodata',
      tone: 'gold',
    };
  }

  if (candidate.paused) return paused;

  return live;
}

type StepState = 'done' | 'now' | 'act' | 'next' | 'open';

/**
 * The same lifecycle as `nextStep`, drawn as the whole road rather than the
 * one thing blocking it — so a family can see how far they have come.
 */
function journey(candidate: CandidateSummary, t: T): { title: string; note: string; state: StepState }[] {
  const biodata = candidate.biodata;
  const verified = candidate.identity_status === 'verified';
  // Changes to an approved profile do not walk it back down the road.
  const published = candidate.publication_status === 'published';
  const written = published || (!!biodata && biodata.status !== 'draft' && biodata.status !== 'correction_requested');
  const approved = published || biodata?.status === 'approved';

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
        : published
          ? t('મંજૂર', 'Approved')
          : biodata?.status === 'correction_requested'
            ? t('સુધારો જરૂરી', 'Needs a fix')
            : written
              ? t('મોકલાયો', 'Sent')
              : t(`${biodata?.completion ?? 0}% ભર્યો`, `${biodata?.completion ?? 0}% filled in`),
      state: !verified ? 'next' : published ? 'done' : biodata?.status === 'correction_requested' ? 'act' : written ? 'done' : 'now',
    },
    {
      title: t('એડમિનની મંજૂરી', 'Admin approval'),
      note: approved ? t('મંજૂર', 'Approved') : written ? t('એડમિન જોઈ રહ્યા છે', 'An admin is looking') : t('મોકલ્યા પછી', 'After you send it'),
      state: approved ? 'done' : written ? 'now' : 'next',
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
