import { NextResponse } from 'next/server';
import { z } from 'zod';

import { route, AppError, ErrorCodes } from '@/lib/matchmaking/http';
import { PersonInputSchema } from '@/lib/matchmaking/types/birth';
import { runMatchmakingPipeline } from '@/lib/matchmaking/pipeline/matchmakingPipeline';

const CreateMatchSchema = z.object({
  personA: PersonInputSchema,
  personB: PersonInputSchema,
  options: z.object({
    generateAIReport: z.boolean().optional().default(true),
    language: z.string().optional().default('en'),
    forceRefresh: z.boolean().optional().default(false),
  }).optional(),
});

export const POST = route('/api/v1/match', async (request) => {
  const { personA, personB, options } = CreateMatchSchema.parse(await request.json());

  if (!personA.birthDetails) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, 400, 'personA.birthDetails is required.');
  }
  if (!personB.birthDetails) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, 400, 'personB.birthDetails is required.');
  }

  const result = await runMatchmakingPipeline(personA, personB, options);
  const { compatibility } = result;

  return NextResponse.json({
    success: true,
    data: {
      matchId: result.matchId,
      cached: result.cached,
      scores: {
        overall: compatibility.overall,
        gunaMilan: {
          score: compatibility.gunaMilan.score,
          maximumScore: compatibility.gunaMilan.maximumScore,
          percentage: compatibility.gunaMilan.percentage,
        },
        rashi: compatibility.rashi,
        nakshatra: compatibility.nakshatra,
        gana: compatibility.gana,
        gotra: compatibility.gotra,
        emotional: compatibility.emotional,
        communication: compatibility.communication,
        family: compatibility.family,
        lifestyle: compatibility.lifestyle,
        financial: compatibility.financial,
        career: compatibility.career,
        longTerm: compatibility.longTerm,
      },
      compatibility,
      manglik: compatibility.manglik,
      aiReport: result.aiReport,
      aiReportGenerated: result.aiReportGenerated,
      metadata: compatibility.metadata,
    },
  }, { status: 201 });
}, { limit: true });
