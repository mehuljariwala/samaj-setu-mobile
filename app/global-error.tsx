'use client';

import { useEffect } from 'react';
import { RotateCw, Sprout } from 'lucide-react';

/**
 * The last-resort screen, shown when something fails above every page — a
 * broken connection mid-tap was the one families actually met. Without this
 * file Next shows its own: black, English-only and reading like a crash.
 *
 * It replaces the root layout, so it gets no cookie (no language — both are
 * shown, Gujarati first) and no guarantee that globals.css is on the page (the
 * styles are inline, in the same colours).
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // A dropped connection is the usual cause, so the moment it returns the
    // screen tries again by itself rather than waiting for a tap.
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [error, retry]);

  return (
    <html lang="gu">
      <body style={styles.body}>
        <title>સમાજ સેતુ</title>
        <main style={styles.card}>
          <span style={styles.mark}>
            <Sprout size={30} strokeWidth={1.8} />
          </span>
          <h1 style={styles.title}>આ પાનું ખૂલી શક્યું નહીં</h1>
          <p style={styles.body1}>
            મોટે ભાગે ઇન્ટરનેટ જોડાણ થોડી વાર માટે તૂટ્યું હોય છે. જોડાણ તપાસીને ફરી પ્રયાસ કરો.
          </p>
          <p lang="en" style={styles.body2}>
            This page couldn’t load, usually because the internet connection dropped for a
            moment. Check your connection and try again.
          </p>
          <button type="button" style={styles.primary} onClick={() => retry()}>
            <RotateCw size={18} />
            ફરી પ્રયાસ કરો · Try again
          </button>
          {/* A plain link, not <Link>: the router may be what failed. */}
          {/* oxlint-disable-next-line nextjs/no-html-link-for-pages */}
          <a href="/" style={styles.secondary}>મુખ્ય પાનું · Home</a>
          {error.digest && <small style={styles.digest}>{error.digest}</small>}
        </main>
      </body>
    </html>
  );
}

const styles = {
  body: {
    margin: 0,
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    boxSizing: 'border-box',
    background: 'radial-gradient(circle at 50% 30%, #fdeaf1, #f5f6f9 70%)',
    color: '#16192a',
    fontFamily: "'Noto Sans Gujarati', 'DM Sans', system-ui, sans-serif",
  },
  card: {
    width: '100%',
    maxWidth: 400,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '32px 24px',
    boxSizing: 'border-box',
    borderRadius: 20,
    background: '#ffffff',
    boxShadow: '0 1px 2px rgb(22 25 42 / 6%), 0 8px 24px rgb(22 25 42 / 8%)',
    textAlign: 'center',
  },
  mark: {
    width: 60,
    height: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    background: '#c2185b',
    color: '#ffffff',
    marginBottom: 4,
  },
  title: { margin: 0, fontSize: 21, fontWeight: 700, lineHeight: 1.4 },
  body1: { margin: 0, fontSize: 15, lineHeight: 1.7, color: '#545c72' },
  body2: { margin: 0, fontSize: 13, lineHeight: 1.6, color: '#8b93a7' },
  primary: {
    width: '100%',
    minHeight: 48,
    marginTop: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    border: 0,
    borderRadius: 14,
    background: '#c2185b',
    color: '#ffffff',
    font: 'inherit',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondary: {
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    color: '#c2185b',
    fontSize: 15,
    fontWeight: 600,
    textDecoration: 'none',
  },
  digest: { fontSize: 11, color: '#8b93a7', letterSpacing: 0.3 },
} satisfies Record<string, React.CSSProperties>;
