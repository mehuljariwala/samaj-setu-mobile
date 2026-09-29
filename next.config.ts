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
  },
};

export default nextConfig;
