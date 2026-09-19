import type { PersonInput } from '../types/birth';
import type { CompatibilityResult } from '../types/compatibility';
import type { AIReport } from '../types/aiReport';
import { runKundliPipeline } from './kundliPipeline';
import { runMatchEngine } from '../matching/scoring/scoreCalculator';
import { OpenRouterProvider, buildFallbackReport } from '../ai/OpenRouterProvider';
import { buildAIInput } from '../types/aiReport';
import { matchRepository, reportRepository } from '@/lib/matchmaking/store';
import { logger } from '../utils/logger';
import { getEnv } from '@/lib/matchmaking/config';

const aiProvider = new OpenRouterProvider();

export interface MatchPipelineResult {
  matchId: string;
  compatibility: CompatibilityResult;
  aiReport?: AIReport;
  aiReportGenerated: boolean;
  cached: boolean;
}

/**
 * Matchmaking Pipeline — per spec §53, §107
 * 1. Resolve both Kundlis
 * 2. Check match cache
 * 3. Run deterministic match engine
 * 4. Generate AI report (non-blocking, fails gracefully)
 * 5. Persist and return
 */
export async function runMatchmakingPipeline(
  personA: PersonInput,
  personB: PersonInput,
  options: { generateAIReport?: boolean; language?: string; forceRefresh?: boolean } = {},
): Promise<MatchPipelineResult> {
  const env = getEnv();
  const language = options.language ?? 'en';

  // 1. Resolve both Kundlis
  const [kundliA, kundliB] = await Promise.all([
    runKundliPipeline(personA.birthDetails, { forceRefresh: options.forceRefresh }),
    runKundliPipeline(personB.birthDetails, { forceRefresh: options.forceRefresh }),
  ]);

  // 2. Check match cache in DB
  if (env.ENABLE_DATABASE && !options.forceRefresh) {
    const cachedMatch = await matchRepository.findByPair(kundliA.id, kundliB.id, env.ALGORITHM_VERSION);
    if (cachedMatch) {
      logger.debug('Match from cache', { matchId: cachedMatch.matchId });

      // Try AI report cache
      const cachedReport = await reportRepository.find(
        cachedMatch.matchId, language, env.PROMPT_VERSION, env.OPENROUTER_MODEL,
      );

      return {
        matchId: cachedMatch.matchId,
        compatibility: cachedMatch,
        aiReport: cachedReport ?? undefined,
        aiReportGenerated: !!cachedReport,
        cached: true,
      };
    }
  }

  // 3. Run deterministic match engine
  logger.info('Running match engine', { kundliA: kundliA.id, kundliB: kundliB.id });
  const compatibility = runMatchEngine(kundliA, kundliB);

  // 4. Persist match
  if (env.ENABLE_DATABASE) {
    await matchRepository.save(compatibility);
    await matchRepository.savePairKey(kundliA.id, kundliB.id, compatibility);
  }

  // 5. AI report — per spec §50: AI failure NEVER breaks matchmaking
  let aiReport: AIReport | undefined;
  let aiReportGenerated = false;

  const shouldGenerateAI = options.generateAIReport !== false && env.ENABLE_AI_REPORT;

  if (shouldGenerateAI) {
    try {
      // Check AI report cache
      if (env.ENABLE_DATABASE) {
        const cached = await reportRepository.find(
          compatibility.matchId, language, env.PROMPT_VERSION, env.OPENROUTER_MODEL,
        );
        if (cached) {
          aiReport = cached;
          aiReportGenerated = true;
        }
      }

      if (!aiReport) {
        const aiInput = buildAIInput(compatibility, language);
        aiReport = await aiProvider.generateCompatibilityReport(aiInput);
        aiReportGenerated = true;

        if (env.ENABLE_DATABASE) {
          await reportRepository.save(
            compatibility.matchId, aiReport, language, env.PROMPT_VERSION, env.OPENROUTER_MODEL,
          );
        }
      }
    } catch (err) {
      logger.warn('AI report generation failed, using fallback', {
        error: err instanceof Error ? err.message : String(err),
      });
      aiReport = buildFallbackReport();
      aiReportGenerated = false;
    }
  }

  return {
    matchId: compatibility.matchId,
    compatibility,
    aiReport,
    aiReportGenerated,
    cached: false,
  };
}
