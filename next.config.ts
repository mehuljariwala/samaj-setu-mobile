import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: {
    // Default is bottom-left, which sits directly on the Home tab when testing
    // on a phone. Dev only — this overlay does not exist in a production build.
    position: 'bottom-right',
  },
  experimental: {
    // On by default since 16.3, and Vercel restores .next/cache between
    // builds. A restored cache shipped the previous globals.css with new
    // markup, leaving the welcome screen unstyled, so builds start cold.
    turbopackFileSystemCacheForBuild: false,
    // Phones drop their connection — a lift, a weak signal, a tab left in the
    // background — and a tap made on a dead connection used to fail outright:
    // a failed Server Action threw to Next's built-in "This page couldn't
    // load" screen. With this, a navigation, prefetch or Server Action whose
    // fetch fails waits for the connection and then runs once, and
    // `useOffline()` tells `OfflineNotice` to say so.
    useOffline: true,
    // A screen opened in the last two minutes is shown again from the phone's
    // memory instead of being rendered and fetched afresh: Discover → a
    // profile → back costs one trip to the database, not two. Anything the
    // member changes still refreshes at once, because every Server Action
    // revalidates and that clears this cache; only other people's changes can
    // take up to two minutes to show. Keeps the free plan's egress down.
    staleTimes: { dynamic: 120 },
  },
};

export default nextConfig;
