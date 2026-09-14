import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BirthDetailsSchema } from '../../types/birth.js';
import { runKundliPipeline } from '../../pipeline/kundliPipeline.js';
import { kundliRepository } from '../../database/client.js';
import { AppError, ErrorCodes } from '../../types/api.js';
import { isValidDate, isValidTime, isValidTimezone } from '../../utils/dates.js';

// POST /api/v1/kundli request schema
const CreateKundliSchema = z.object({
  externalUserId: z.string().optional(),
  name: z.string().optional(),
  birthDetails: BirthDetailsSchema,
  gotra: z.string().optional(),
  options: z.object({
    forceRefresh: z.boolean().optional(),
  }).optional(),
});

export async function createKundli(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreateKundliSchema.parse(req.body);
    const { birthDetails, gotra, options } = body;

    // Extra validation
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

    // Strip raw provider data from response per spec §82
    const { rawProviderData: _raw, ...safeKundli } = kundli;

    res.status(201).json({
      success: true,
      data: safeKundli,
    });
  } catch (err) {
    next(err);
  }
}

export async function getKundli(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params['id'] ?? '');
    if (!id) throw new AppError(ErrorCodes.KUNDLI_NOT_FOUND, 400, 'Kundli ID required.');

    const kundli = await kundliRepository.findById(id);
    if (!kundli) throw new AppError(ErrorCodes.KUNDLI_NOT_FOUND, 404, `Kundli not found: ${id}`);

    const { rawProviderData: _raw, ...safeKundli } = kundli;
    res.json({ success: true, data: safeKundli });
  } catch (err) {
    next(err);
  }
}
