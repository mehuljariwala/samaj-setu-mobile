import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: {
    // Default is bottom-left, which sits directly on the Home tab when testing
    // on a phone. Dev only — this overlay does not exist in a production build.
    position: 'bottom-right',
  },
};

export default nextConfig;
