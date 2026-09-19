import { NextResponse } from 'next/server';

import { route } from '@/lib/matchmaking/http';
import { getEnv } from '@/lib/matchmaking/config';

export const GET = route('/api/health/providers', async () => {
  const env = getEnv();
  return NextResponse.json({
    navamsha: env.NAVAMSHA_API_KEY ? 'configured' : 'not_configured',
    openrouter: env.OPENROUTER_API_KEY ? 'configured' : 'not_configured',
    // Always in-memory — see lib/matchmaking/store.ts.
    database: 'in_memory',
  });
});
