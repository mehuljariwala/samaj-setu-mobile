import { NextResponse } from 'next/server';
import { z } from 'zod';

import { route, AppError, ErrorCodes } from '@/lib/matchmaking/http';
import { BirthDetailsSchema } from '@/lib/matchmaking/types/birth';
import { runKundliPipeline } from '@/lib/matchmaking/pipeline/kundliPipeline';
import { isValidDate, isValidTime, isValidTimezone } from '@/lib/matchmaking/utils/dates';

const CreateKundliSchema = z.object({
  externalUserId: z.string().optional(),
  name: z.string().optional(),
  birthDetails: BirthDetailsSchema,
  gotra: z.string().optional(),
  options: z.object({ forceRefresh: z.boolean().optional() }).optional(),
});

export const POST = route('/api/v1/kundli', async (request) => {
  const body = CreateKundliSchema.parse(await request.json());
  const { birthDetails, gotra, options } = body;

  if (!isValidDate(birthDetails.dateOfBirth)) {
    throw new AppError(ErrorCodes.INVALID_BIRTH_DATA, 400, 'Invalid dateOfBirth.');
  }
  if (!isValidTime(birthDetails.timeOfBirth)) {
    throw new AppError(ErrorCodes.INVALID_BIRTH_DATA, 400, 'Invalid timeOfBirth (HH:mm or HH:mm:ss).');
  }
  if (!isValidTimezone(birthDetails.timezone)) {
    throw new AppError(ErrorCodes.INVALID_TIMEZONE, 400, `Invalid timezone: ${birthDetails.timezone}`);
  }

  const kundli = await runKundliPipeline(
    { ...birthDetails, gotra },
    { forceRefresh: options?.forceRefresh },
  );

  // The provider's raw payload never leaves the server.
  const { rawProviderData: _raw, ...safeKundli } = kundli;

  return NextResponse.json({ success: true, data: safeKundli }, { status: 201 });
}, { limit: true });
