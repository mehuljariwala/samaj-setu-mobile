import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PersonInputSchema } from '../../types/birth.js';
import { runMatchmakingPipeline } from '../../pipeline/matchmakingPipeline.js';
import { matchRepository } from '../../database/client.js';
import { AppError, ErrorCodes } from '../../types/api.js';

// POST /api/v1/match request schema — per spec §56
const CreateMatchSchema = z.object({
  personA: PersonInputSchema,
  personB: PersonInputSchema,
  options: z.object({
    generateAIReport: z.boolean().optional().default(true),
    language: z.string().optional().default('en'),
    forceRefresh: z.boolean().optional().default(false),
  }).optional(),
});

export async function createMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreateMatchSchema.parse(req.body);
    const { personA, personB, options } = body;

    if (!personA.birthDetails) {
      throw new AppError(ErrorCodes.INVALID_REQUEST, 400, 'personA.birthDetails is required.');
    }
    if (!personB.birthDetails) {
      throw new AppError(ErrorCodes.INVALID_REQUEST, 400, 'personB.birthDetails is required.');
    }

    const result = await runMatchmakingPipeline(personA, personB, options);

    res.status(201).json({
      success: true,
      data: {
        matchId: result.matchId,
        cached: result.cached,
        scores: {
          overall: result.compatibility.overall,
          gunaMilan: {
            score: result.compatibility.gunaMilan.score,
            maximumScore: result.compatibility.gunaMilan.maximumScore,
            percentage: result.compatibility.gunaMilan.percentage,
          },
          rashi: result.compatibility.rashi,
          nakshatra: result.compatibility.nakshatra,
          gana: result.compatibility.gana,
          gotra: result.compatibility.gotra,
          emotional: result.compatibility.emotional,
          communication: result.compatibility.communication,
          family: result.compatibility.family,
          lifestyle: result.compatibility.lifestyle,
          financial: result.compatibility.financial,
          career: result.compatibility.career,
          longTerm: result.compatibility.longTerm,
        },
        compatibility: result.compatibility,
        manglik: result.compatibility.manglik,
        aiReport: result.aiReport,
        aiReportGenerated: result.aiReportGenerated,
        metadata: result.compatibility.metadata,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params['id'] ?? '');
    if (!id) throw new AppError(ErrorCodes.MATCH_INVALID, 400, 'Match ID required.');

    const match = await matchRepository.findById(id);
    if (!match) throw new AppError(ErrorCodes.MATCH_INVALID, 404, `Match not found: ${id}`);

    res.json({ success: true, data: { matchId: match.matchId, compatibility: match } });
  } catch (err) {
    next(err);
  }
}
