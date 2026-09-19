import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';

import { LANG_COOKIE, isLang } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: 'સમાજ સેતુ · Samaj Setu',
  description: 'A private Gujarati-first matrimonial directory for the Khatri Kshatriya community.',
  icons: { icon: '/favicon.svg' },
  appleWebApp: { capable: true, title: 'Samaj Setu', statusBarStyle: 'default' },
  // Spec §9: a shared link must not leak anything about a candidate, so no
  // page in this app is ever indexed or previewed with real content.
  robots: { index: false, follow: false },
};

/**
 * `viewport-fit=cover` is what lets env(safe-area-inset-*) resolve, so the
 * top bar and tab bar clear the notch and home indicator on a real phone.
 * Zoom is deliberately left enabled.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The language lives in a cookie, so the server knows it before rendering.
  // That removed the prototype's boot script, its `data-booting` flag and the
  // hydration mismatch that came with them — there is no longer a moment where
  // the client knows something about the visitor that the server did not.
  const cookie = (await cookies()).get(LANG_COOKIE)?.value;
  const lang = isLang(cookie) ? cookie : 'gu';

  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
