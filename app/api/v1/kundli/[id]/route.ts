import { NextResponse } from 'next/server';

import { route, AppError, ErrorCodes } from '@/lib/matchmaking/http';
import { kundliRepository } from '@/lib/matchmaking/store';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Route params are async in Next 16, so the id is resolved before the
  // wrapper runs rather than being read off a request object.
  const { id } = await context.params;

  return route(`/api/v1/kundli/${id}`, async () => {
    if (!id) throw new AppError(ErrorCodes.KUNDLI_NOT_FOUND, 400, 'Kundli ID required.');

    const kundli = await kundliRepository.findById(id);
    if (!kundli) throw new AppError(ErrorCodes.KUNDLI_NOT_FOUND, 404, `Kundli not found: ${id}`);

    const { rawProviderData: _raw, ...safeKundli } = kundli;
    return NextResponse.json({ success: true, data: safeKundli });
  })(request);
}
