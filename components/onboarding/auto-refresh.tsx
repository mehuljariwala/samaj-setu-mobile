'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Re-reads the page from the server now and then, so that "your status will
 * update here" is true without a pull-to-refresh: a family leaving the screen
 * open sees the approval arrive.
 *
 * Only while the tab is visible, and once straight away when it comes back,
 * because that is when someone is actually looking.
 */
export function AutoRefresh({ every = 60_000 }: { every?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, every);
    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, every]);

  return null;
}
