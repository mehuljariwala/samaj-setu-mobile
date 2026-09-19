import { NextResponse } from 'next/server';

import { route, AppError, ErrorCodes } from '@/lib/matchmaking/http';
import { matchRepository } from '@/lib/matchmaking/store';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  return route(`/api/v1/match/${id}`, async () => {
    if (!id) throw new AppError(ErrorCodes.MATCH_INVALID, 400, 'Match ID required.');

    const match = await matchRepository.findById(id);
    if (!match) throw new AppError(ErrorCodes.MATCH_INVALID, 404, `Match not found: ${id}`);

    return NextResponse.json({ success: true, data: { matchId: match.matchId, compatibility: match } });
  })(request);
}
