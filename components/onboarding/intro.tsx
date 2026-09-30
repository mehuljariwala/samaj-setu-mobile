'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, LogIn } from 'lucide-react';

import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';
import { NON_COMMERCIAL } from '@/lib/rules';
import { CommunityArt, ConsentArt, VerifiedArt } from './art';
import { Slogan } from './slogan';

/**
 * The welcome screen: three short slides that turn by themselves — who it is
 * for, why it is safe, who decides what is shared — and one button.
 *
 * The slides explain; they are not a gate. The button goes straight to
 * registration from any slide, and "Log in" sits under it for a returning
 * member.
 *
 * The timer is the current progress bar's own fill animation: when it ends,
 * the next slide comes in. Pausing the fill pauses the carousel — a finger
 * held on the picture, or a mouse over it, gives a slow reader more time.
 * Where motion is switched off (`prefers-reduced-motion`) there is no fill,
 * no end event, and the slides wait to be swiped, tapped or arrowed through.
 */
export function Intro({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<'next' | 'back'>('next');
  const [paused, setPaused] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const slides = [
    {
      tone: 'rose',
      Art: CommunityArt,
      title: t('જીવનસાથીની શોધ, પોતાના સમાજમાં', 'Find your life partner, within your samaj'),
      body: t('પરિવારના વિશ્વાસ સાથે — ખાનગી, અને હંમેશાં નિઃશુલ્ક.', 'With your family’s trust. Private, and always free.'),
    },
    {
      tone: 'gold',
      Art: VerifiedArt,
      title: t('દરેક સભ્ય ચકાસાયેલ છે', 'Every member is verified'),
      body: t('એડમિન દસ્તાવેજથી દરેકની ઓળખ ચકાસે છે.', 'An admin checks everyone’s documents before anyone can join.'),
    },
    {
      tone: 'green',
      Art: ConsentArt,
      title: t('તમારી મંજૂરી, તમારો નિર્ણય', 'Your consent, your choice'),
      body: t('ફોટો અને નંબર ત્યારે જ દેખાય, જ્યારે તમે હા કહો.', 'Photos and numbers are shown only when you say yes.'),
    },
  ];

  const slide = slides[index];
  const count = slides.length;

  // Past either end it wraps, so the carousel loops.
  const go = (to: number, dir: 'next' | 'back' = to > index ? 'next' : 'back') => {
    const next = (to + count) % count;
    if (next === index) return;
    setDirection(dir);
    setIndex(next);
  };

  // Arrow keys turn the page. This screen is nothing but the slides, so the
  // listener can sit on the window rather than wait for focus to land here.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const forward = event.key === 'ArrowRight';
      setDirection(forward ? 'next' : 'back');
      setIndex((index + (forward ? 1 : -1) + count) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count]);

  return (
    <section
      className={`intro tone-${slide.tone}${paused ? ' paused' : ''}`}
      aria-roledescription="carousel"
      aria-label={t('સમાજ સેતુનો પરિચય', 'About Samaj Setu')}
    >
      <Slogan t={t} />

      <ol className="intro-progress">
        {slides.map((item, i) => (
          <li key={item.tone} className={i < index ? 'on' : i === index ? 'now' : undefined}>
            <button
              type="button"
              aria-label={t(`સ્લાઇડ ${i + 1} / ${count}`, `Slide ${i + 1} of ${count}`)}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => go(i)}
            >
              <span>
                <i onAnimationEnd={i === index ? () => go(index + 1, 'next') : undefined} />
              </span>
            </button>
          </li>
        ))}
      </ol>

      {/* Keyed on the slide, so the illustration and text remount and their
          entrance animations replay in the direction of travel. */}
      <div
        key={index}
        className={`intro-slide from-${direction}`}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerCancel={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
        onTouchStart={(event) => {
          touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const dx = event.changedTouches[0].clientX - start.x;
          const dy = event.changedTouches[0].clientY - start.y;
          // A mostly-horizontal flick only, so scrolling a short screen never
          // turns the page by accident.
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            go(index + (dx < 0 ? 1 : -1), dx < 0 ? 'next' : 'back');
          }
        }}
      >
        <div className="intro-stage">
          <slide.Art t={t} />
        </div>

        {/* Announced only when someone is holding the slide to read it; a
            screen reader should not be talked over every five seconds. */}
        <div className="intro-copy" aria-live={paused ? 'polite' : 'off'}>
          <h1>{slide.title}</h1>
          <p>{slide.body}</p>
        </div>
      </div>

      <div className="intro-actions">
        <Link className="cta" href="/register">
          {t('નોંધણી શરૂ કરો', 'Start registration')}
          <ArrowRight size={20} />
        </Link>

        <Link className="intro-login" href="/sign-in">
          <LogIn size={18} />
          <span>
            {t('પહેલેથી સભ્ય છો?', 'Already a member?')} <b>{t('લૉગ ઇન કરો', 'Log in')}</b>
          </span>
        </Link>

        {/* The samaj asked for this to be stated wherever people sign up. */}
        <p className="intro-free">
          {t(
            NON_COMMERCIAL,
            'We are a free social service and take no fee or commission of any kind.',
          )}
        </p>
      </div>
    </section>
  );
}
