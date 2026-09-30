'use client';

import { useEffect, useRef, useState } from 'react';
import { Square, Volume2 } from 'lucide-react';

import type { T } from '@/lib/i18n';
import { SAMAJ } from '@/lib/org';

type Speaker = { voice: SpeechSynthesisVoice; lines: readonly string[] };

/**
 * A voice on this phone that can say the slogan: Gujarati if there is one,
 * otherwise Hindi reading the same words written in Devanagari, which sound
 * the same. With neither there is no button — an English voice spelling out
 * Gujarati script is worse than silence.
 */
function findSpeaker(): Speaker | null {
  const voices = speechSynthesis.getVoices();
  const gujarati = voices.find((voice) => voice.lang.toLowerCase().startsWith('gu'));
  if (gujarati) return { voice: gujarati, lines: SAMAJ.slogan };
  const hindi = voices.find((voice) => voice.lang.toLowerCase().startsWith('hi'));
  if (hindi) return { voice: hindi, lines: SAMAJ.sloganDevanagari };
  return null;
}

/**
 * The samaj's slogan at the head of the welcome screen, with a button that
 * reads it aloud and lights each line as it is said.
 *
 * Browsers only let a page speak after a tap, so the slogan cannot greet a
 * visitor by voice on its own; the opening card shows it in writing instead.
 */
export function Slogan({ t }: { t: T }) {
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [speaking, setSpeaking] = useState<number | null>(null);
  // Stopping or replaying cancels the queue, and the cancelled lines still
  // report that they ended; the run number lets those late reports be ignored.
  const run = useRef(0);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    // Chrome loads its voices after the page, and says so with this event.
    const load = () => setSpeaker(findSpeaker());
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', load);
      speechSynthesis.cancel();
    };
  }, []);

  const toggle = () => {
    if (!speaker) return;
    const id = ++run.current;
    speechSynthesis.cancel();
    if (speaking !== null) {
      setSpeaking(null);
      return;
    }

    speaker.lines.forEach((line, i) => {
      const utterance = new SpeechSynthesisUtterance(line);
      utterance.voice = speaker.voice;
      utterance.lang = speaker.voice.lang;
      utterance.rate = 0.85;
      utterance.onstart = () => {
        if (run.current === id) setSpeaking(i);
      };
      if (i === speaker.lines.length - 1) {
        utterance.onend = utterance.onerror = () => {
          if (run.current === id) setSpeaking(null);
        };
      }
      speechSynthesis.speak(utterance);
    });
    setSpeaking(0);
  };

  return (
    <div className={`intro-slogan${speaking !== null ? ' speaking' : ''}`}>
      <p lang="gu">
        {SAMAJ.slogan.map((line, i) => (
          <span key={line} className={speaking === i ? 'on' : undefined}>
            {line}
          </span>
        ))}
      </p>
      {speaker && (
        <button type="button" className="intro-slogan-play" onClick={toggle}>
          {speaking !== null ? <Square size={16} fill="currentColor" /> : <Volume2 size={19} />}
          <span>{speaking !== null ? t('રોકો', 'Stop') : t('સાંભળો', 'Listen')}</span>
        </button>
      )}
    </div>
  );
}
