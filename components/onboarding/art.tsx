import {
  BadgeCheck, FileText, Heart, IdCard, LockKeyhole, MessageCircle, Pencil, Phone, Search, ShieldCheck, Sparkle, Users,
} from 'lucide-react';

import type { T } from '@/lib/i18n';

/**
 * Illustrations for the intro slides.
 *
 * Drawn people rather than stock photographs: a matrimonial app for one samaj
 * should not open on strangers' faces, and a photograph of a real person here
 * would read as a profile. Every piece is inline SVG in the app's own palette,
 * so it costs no requests and re-skins with the tokens.
 *
 * Motion lives entirely in CSS (`.art-*` in globals.css) and is switched off by
 * `prefers-reduced-motion`. Each element carries its stagger in `--d`.
 */

type Look = {
  skin: string;
  hair: string;
  shirt: string;
  bg: string;
  style: 'short' | 'long' | 'bun' | 'elder' | 'curly' | 'pony';
  bindi?: boolean;
  glasses?: boolean;
  moustache?: boolean;
};

const PEOPLE = {
  papa: { skin: '#c98a5a', hair: '#2b1d16', shirt: '#3d5a80', bg: '#fde2cf', style: 'short', moustache: true },
  mummy: { skin: '#d9a176', hair: '#1f1512', shirt: '#c2185b', bg: '#fdeaf1', style: 'long', bindi: true },
  dada: { skin: '#b97a4f', hair: '#e9e4de', shirt: '#f3efe6', bg: '#e6f5ee', style: 'elder', glasses: true, moustache: true },
  dadi: { skin: '#c68650', hair: '#d8d2cc', shirt: '#b45309', bg: '#fdf3e3', style: 'bun', bindi: true },
  son: { skin: '#d49a6a', hair: '#231812', shirt: '#0f7a55', bg: '#e3f0ff', style: 'curly' },
  daughter: { skin: '#e0ac7e', hair: '#2a1a14', shirt: '#7c3aed', bg: '#f1eafe', style: 'pony', bindi: true },
} satisfies Record<string, Look>;

/** One round portrait. `size` is the rendered diameter in px. */
export function Person({ who, size }: { who: keyof typeof PEOPLE; size: number }) {
  const p: Look = PEOPLE[who];
  const id = `clip-${who}-${size}`;

  return (
    <svg className="person" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <clipPath id={id}><circle cx="32" cy="32" r="32" /></clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="64" height="64" fill={p.bg} />

        {/* Hair that falls behind the shoulders goes first. */}
        {p.style === 'long' && <path d="M17 30c0-12 7-19 15-19s15 7 15 19v22H17z" fill={p.hair} />}
        {p.style === 'pony' && <path d="M44 22c7 3 8 14 4 22-2-6-4-11-6-14z" fill={p.hair} />}

        {/* Shoulders, then the neck. */}
        <path d="M8 64c1-11 11-17 24-17s23 6 24 17z" fill={p.shirt} />
        {p.style === 'bun' && <path d="M14 64c4-10 12-15 20-16l-6 16z" fill="#f5c044" opacity=".9" />}
        <rect x="27" y="38" width="10" height="11" rx="4" fill={p.skin} />
        <path d="M27 44c3 2 7 2 10 0v3c-3 2-7 2-10 0z" fill="#000" opacity=".08" />

        {/* Head. */}
        <ellipse cx="32" cy="29" rx="11.5" ry="13" fill={p.skin} />
        <ellipse cx="20.5" cy="30" rx="2" ry="3" fill={p.skin} />
        <ellipse cx="43.5" cy="30" rx="2" ry="3" fill={p.skin} />

        {/* Hair on top. */}
        {p.style === 'short' && <path d="M20.5 27c-1-9 5-13.5 11.5-13.5S44.5 18 43.5 27c-2-5-6-7-11.5-7s-9.5 2-11.5 7z" fill={p.hair} />}
        {p.style === 'curly' && (
          <g fill={p.hair}>
            <path d="M20.5 26c-1-8 5-12.5 11.5-12.5S44.5 18 43.5 26c-3-4-7-5.5-11.5-5.5S23.5 22 20.5 26z" />
            <circle cx="24" cy="17" r="4" /><circle cx="30" cy="14" r="4.2" /><circle cx="36.5" cy="14.5" r="4" /><circle cx="41" cy="19" r="3.6" /><circle cx="21.5" cy="22" r="3" />
          </g>
        )}
        {(p.style === 'long' || p.style === 'pony') && <path d="M20.5 29c-1-10 5-15.5 11.5-15.5S44.5 19 43.5 29c-3-7-8-9-11.5-11-3 3-8 5-11.5 11z" fill={p.hair} />}
        {p.style === 'bun' && (
          <g fill={p.hair}>
            <circle cx="32" cy="13" r="5" />
            <path d="M20.5 28c-1-9 5-13 11.5-13s12.5 4 11.5 13c-2-5-6-7.5-11.5-7.5S22.5 23 20.5 28z" />
          </g>
        )}
        {p.style === 'elder' && (
          <g fill={p.hair}>
            <path d="M20.5 30c-1-4 0-7 2.5-9 0 3 1 5 1.5 8z" />
            <path d="M43.5 30c1-4 0-7-2.5-9 0 3-1 5-1.5 8z" />
          </g>
        )}

        {/* Face. */}
        <circle cx="27.5" cy="30" r="1.3" fill="#2b1d16" />
        <circle cx="36.5" cy="30" r="1.3" fill="#2b1d16" />
        <path d="M28.5 35.5c2 2 5 2 7 0" stroke="#7a3b2e" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <circle cx="25" cy="34" r="1.8" fill="#e85d75" opacity=".22" />
        <circle cx="39" cy="34" r="1.8" fill="#e85d75" opacity=".22" />
        {p.bindi && <circle cx="32" cy="24.5" r="1" fill="#c2185b" />}
        {p.moustache && <path d="M28.5 34c1.5-1 5.5-1 7 0-1.2.4-2.4.6-3.5.2-1.1.4-2.3.2-3.5-.2z" fill={p.style === 'elder' ? p.hair : '#2b1d16'} />}
        {p.glasses && (
          <g stroke="#3a3a3a" strokeWidth="1" fill="none">
            <circle cx="27.5" cy="30" r="3.4" /><circle cx="36.5" cy="30" r="3.4" /><path d="M30.9 30h2.2" />
          </g>
        )}
      </g>
    </svg>
  );
}

/** A four-point sparkle, twinkling on its own clock. */
function Twinkle({ x, y, size, d, tone = 'brand' }: { x: string; y: string; size: number; d: number; tone?: 'brand' | 'gold' | 'ok' }) {
  return (
    <span className={`art-twinkle ${tone}`} style={{ left: x, top: y, '--d': `${d}ms` } as React.CSSProperties}>
      <Sparkle size={size} fill="currentColor" strokeWidth={0} />
    </span>
  );
}

/* ------------------------------------------------------------------ scenes */

/** Slide 1 — the samaj, gathered around one promise. */
export function CommunityArt({ t }: { t: T }) {
  const ring: [keyof typeof PEOPLE, number, string, string, number][] = [
    // who, size, left, top, delay
    ['papa', 74, '14%', '6%', 0],
    ['mummy', 58, '58%', '20%', 90],
    ['daughter', 62, '80%', '4%', 180],
    ['dada', 56, '6%', '64%', 270],
    ['dadi', 50, '36%', '76%', 360],
    ['son', 66, '74%', '62%', 450],
  ];

  return (
    <div className="art art-community" aria-hidden="true">
      <span className="art-orbit" />
      <span className="art-orbit two" />
      {ring.map(([who, size, left, top, d]) => (
        <span key={who} className="art-float" style={{ left, top, '--d': `${d}ms` } as React.CSSProperties}>
          <Person who={who} size={size} />
        </span>
      ))}
      <span className="art-chip" style={{ left: '2%', top: '38%', '--d': '520ms' } as React.CSSProperties}><Users size={16} /></span>
      <span className="art-chip" style={{ left: '86%', top: '40%', '--d': '600ms' } as React.CSSProperties}><Heart size={16} fill="currentColor" /></span>
      <span className="art-pill" style={{ '--d': '240ms' } as React.CSSProperties}>
        <BadgeCheck size={20} />
        {t('સમાજ, સાથે', 'Samaj, together')}
      </span>
      <Twinkle x="46%" y="4%" size={22} d={0} />
      <Twinkle x="10%" y="44%" size={14} d={700} tone="gold" />
      <Twinkle x="66%" y="84%" size={16} d={1300} />
    </div>
  );
}

/** Slide 2 — verification, shown as the cards an admin actually works through. */
export function VerifiedArt({ t }: { t: T }) {
  return (
    <div className="art art-verified" aria-hidden="true">
      <span className="art-shield"><ShieldCheck size={120} strokeWidth={1.2} /></span>

      <div className="art-card" style={{ '--d': '80ms' } as React.CSSProperties}>
        <span className="art-card-icon"><FileText size={20} /></span>
        <span className="art-card-text">
          <b>{t('લિવિંગ સર્ટિફિકેટ', 'Leaving certificate')}</b>
          <small>{t('ફક્ત એડમિન જુએ છે', 'Only an admin sees it')}</small>
        </span>
        <span className="art-tag ok">{t('ચકાસ્યું', 'Verified')}</span>
      </div>

      <div className="art-card tilt" style={{ '--d': '220ms' } as React.CSSProperties}>
        <Person who="dada" size={38} />
        <span className="art-card-text">
          <b>{t('એડમિન સમીક્ષા', 'Admin review')}</b>
          <small>{t('સમાજના જ સ્વયંસેવક', 'A samaj volunteer')}</small>
        </span>
        <span className="art-tag gold">{t('24 કલાક', '24 hrs')}</span>
      </div>

      <div className="art-card small" style={{ '--d': '360ms' } as React.CSSProperties}>
        <span className="art-check">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
        <b>{t('ઓળખ પાકી થઈ', 'Identity confirmed')}</b>
      </div>

      <Twinkle x="8%" y="10%" size={18} d={200} tone="gold" />
      <Twinkle x="88%" y="72%" size={22} d={900} tone="ok" />
      <Twinkle x="84%" y="6%" size={12} d={1500} />
    </div>
  );
}

/** Slide 3 — consent: two families, and the number revealed only after yes. */
export function ConsentArt({ t }: { t: T }) {
  return (
    <div className="art art-consent" aria-hidden="true">
      <div className="art-pair">
        <span className="art-float" style={{ '--d': '0ms' } as React.CSSProperties}><Person who="son" size={84} /></span>
        <span className="art-link">
          <svg viewBox="0 0 120 20" preserveAspectRatio="none"><path d="M2 10 Q60 -6 118 10" /></svg>
          <span className="art-heart"><Heart size={22} fill="currentColor" /></span>
        </span>
        <span className="art-float" style={{ '--d': '160ms' } as React.CSSProperties}><Person who="daughter" size={84} /></span>
      </div>

      <div className="art-toggles">
        <div className="art-row" style={{ '--d': '300ms' } as React.CSSProperties}>
          <span className="art-row-icon"><LockKeyhole size={16} /></span>
          <span>{t('ફોટો · તમારી મંજૂરીથી', 'Photos · with your consent')}</span>
          <span className="art-switch"><i /></span>
        </div>
        <div className="art-row" style={{ '--d': '440ms' } as React.CSSProperties}>
          <span className="art-row-icon"><Phone size={16} /></span>
          <span>{t('નંબર · સ્વીકાર પછી જ', 'Number · only after yes')}</span>
          <span className="art-switch late"><i /></span>
        </div>
      </div>

      <Twinkle x="6%" y="8%" size={20} d={100} />
      <Twinkle x="90%" y="12%" size={14} d={800} tone="gold" />
      <Twinkle x="50%" y="0%" size={12} d={1400} tone="ok" />
    </div>
  );
}

/* ------------------------------------------------------------------ review */

export type ReviewState = 'pending' | 'approved' | 'correction' | 'rejected';

/**
 * The status screen's picture: the three documents that went in, each ticked
 * as received, around a dial that says where the application stands — a clock
 * that keeps ticking while an admin looks, a shield once they have said yes.
 */
export function ReviewArt({ state }: { state: ReviewState }) {
  const docs: [React.ReactNode, string, string, number][] = [
    // icon, left, top, delay
    [<FileText key="c" size={18} />, '9%', '16%', 120],
    [<IdCard key="f" size={18} />, '78%', '12%', 220],
    [<IdCard key="b" size={18} />, '82%', '64%', 320],
  ];

  return (
    <div className={`art art-review ${state}`} aria-hidden="true">
      <span className="art-orbit" />
      <span className="art-orbit two" />
      {state === 'pending' && <span className="art-ripple" />}

      <span className="art-dial">
        {state === 'pending' ? (
          <svg viewBox="0 0 64 64" width="72" height="72" className="art-clock">
            <circle cx="32" cy="32" r="26" />
            {[0, 90, 180, 270].map((deg) => (
              <path key={deg} d="M32 9v4" style={{ rotate: `${deg}deg` }} />
            ))}
            <path className="art-clock-hour" d="M32 32l9 5" />
            <path className="art-clock-minute" d="M32 32V15" />
            <circle cx="32" cy="32" r="2.6" className="art-clock-pin" />
          </svg>
        ) : state === 'approved' ? (
          <span className="art-dial-shield">
            <ShieldCheck size={64} strokeWidth={1.3} />
          </span>
        ) : state === 'correction' ? (
          <Pencil size={44} strokeWidth={1.6} className="art-dial-pencil" />
        ) : (
          <FileText size={46} strokeWidth={1.5} />
        )}
      </span>

      {docs.map(([icon, left, top, d], i) => (
        <span key={i} className="art-doc" style={{ left, top, '--d': `${d}ms` } as React.CSSProperties}>
          {icon}
          <span className="art-check">
            <svg viewBox="0 0 24 24" width="11" height="11"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
        </span>
      ))}

      {/* The person on the other side: a samaj volunteer, looking. */}
      <span className="art-float art-reviewer" style={{ left: '6%', top: '60%', '--d': '420ms' } as React.CSSProperties}>
        <Person who="dada" size={54} />
        {state === 'pending' && <span className="art-lens"><Search size={13} strokeWidth={3} /></span>}
      </span>

      {state === 'approved' && (
        <>
          <Twinkle x="30%" y="6%" size={16} d={300} tone="ok" />
          <Twinkle x="62%" y="80%" size={14} d={1100} tone="gold" />
        </>
      )}
      <Twinkle x="48%" y="2%" size={18} d={0} tone={state === 'approved' ? 'ok' : 'gold'} />
      <Twinkle x="90%" y="42%" size={13} d={900} />
      <Twinkle x="26%" y="86%" size={12} d={1600} tone="gold" />
    </div>
  );
}

/* ----------------------------------------------------------------- support */

/**
 * The support screen's picture: a ringing phone at the centre, with the samaj's
 * own volunteers gathered round it — help here is a person you already know,
 * not a ticket queue.
 */
export function SupportArt({ t }: { t: T }) {
  const ring: [keyof typeof PEOPLE, number, string, string, number][] = [
    // who, size, left, top, delay
    ['papa', 56, '8%', '10%', 120],
    ['mummy', 50, '78%', '8%', 220],
    ['dada', 48, '6%', '62%', 320],
    ['son', 52, '80%', '60%', 420],
  ];

  return (
    <div className="art art-review art-support" aria-hidden="true">
      <span className="art-orbit" />
      <span className="art-orbit two" />
      <span className="art-ripple" />
      <span className="art-dial">
        <Phone size={46} strokeWidth={1.6} className="art-dial-phone" />
      </span>
      {ring.map(([who, size, left, top, d]) => (
        <span key={who} className="art-float" style={{ left, top, '--d': `${d}ms` } as React.CSSProperties}>
          <Person who={who} size={size} />
        </span>
      ))}
      <span className="art-chip wa" style={{ left: '28%', top: '8%', '--d': '520ms' } as React.CSSProperties}><MessageCircle size={16} /></span>
      <span className="art-chip" style={{ left: '84%', top: '36%', '--d': '600ms' } as React.CSSProperties}><Heart size={16} fill="currentColor" /></span>
      <span className="art-pill" style={{ '--d': '280ms' } as React.CSSProperties}>
        <Users size={18} />
        {t('સમાજના સ્વયંસેવકો', 'Samaj volunteers')}
      </span>
      <Twinkle x="50%" y="2%" size={16} d={0} tone="gold" />
      <Twinkle x="90%" y="86%" size={12} d={900} />
      <Twinkle x="24%" y="84%" size={13} d={1500} tone="gold" />
    </div>
  );
}

/** The admin's empty queue: every file ticked, nothing left on the desk. */
export function AdminCaughtUpArt() {
  return (
    <div className="art art-review approved" aria-hidden="true">
      <span className="art-orbit" />
      <span className="art-dial small">
        <svg viewBox="0 0 24 24" width="40" height="40" className="art-done"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
      {([['14%', '22%', 160], ['74%', '16%', 260], ['70%', '60%', 360]] as const).map(([left, top, d]) => (
        <span key={left} className="art-doc" style={{ left, top, '--d': `${d}ms` } as React.CSSProperties}>
          <FileText size={16} />
          <span className="art-check">
            <svg viewBox="0 0 24 24" width="11" height="11"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
        </span>
      ))}
      <Twinkle x="30%" y="10%" size={16} d={0} tone="ok" />
      <Twinkle x="20%" y="70%" size={12} d={700} tone="gold" />
      <Twinkle x="88%" y="40%" size={14} d={1300} />
    </div>
  );
}

/**
 * Discover with nothing to show yet: a magnifier over the samaj, with a few
 * families drifting in orbit — people are coming, just not here yet.
 */
export function DiscoverEmptyArt() {
  return (
    <div className="art art-review" aria-hidden="true">
      <span className="art-orbit" />
      <span className="art-orbit two" />
      <span className="art-dial small">
        <Search size={38} strokeWidth={2} className="art-dial-search" />
      </span>
      <span className="art-float" style={{ left: '10%', top: '18%', '--d': '120ms' } as React.CSSProperties}><Person who="son" size={44} /></span>
      <span className="art-float" style={{ left: '76%', top: '12%', '--d': '260ms' } as React.CSSProperties}><Person who="daughter" size={40} /></span>
      <span className="art-float" style={{ left: '80%', top: '60%', '--d': '400ms' } as React.CSSProperties}><Person who="mummy" size={36} /></span>
      <Twinkle x="30%" y="8%" size={14} d={0} tone="gold" />
      <Twinkle x="18%" y="74%" size={12} d={800} />
      <Twinkle x="62%" y="82%" size={13} d={1400} tone="gold" />
    </div>
  );
}

/**
 * Interests with nothing in the box: two families, a heart waiting between
 * them. An introduction is the line that joins them.
 */
export function InterestsEmptyArt() {
  return (
    <div className="art art-review" aria-hidden="true">
      <span className="art-orbit" />
      <span className="art-dial small">
        <Heart size={36} strokeWidth={2} className="art-dial-heart" />
      </span>
      <span className="art-float" style={{ left: '12%', top: '30%', '--d': '140ms' } as React.CSSProperties}><Person who="son" size={50} /></span>
      <span className="art-float" style={{ left: '72%', top: '30%', '--d': '280ms' } as React.CSSProperties}><Person who="daughter" size={50} /></span>
      <Twinkle x="46%" y="6%" size={15} d={0} />
      <Twinkle x="30%" y="78%" size={12} d={900} tone="gold" />
      <Twinkle x="68%" y="80%" size={13} d={1500} />
    </div>
  );
}
