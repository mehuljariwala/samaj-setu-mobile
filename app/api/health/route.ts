import { NextResponse } from 'next/server';

import { route } from '@/lib/matchmaking/http';
import { getEnv } from '@/lib/matchmaking/config';

export const GET = route('/api/health', async () => {
  const env = getEnv();
  return NextResponse.json({
    status: 'ok',
    service: env.APP_NAME,
    version: env.APP_VERSION,
  });
});
