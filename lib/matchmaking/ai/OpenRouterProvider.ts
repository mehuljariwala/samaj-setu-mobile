import type { AIProvider, AICompatibilityInput, AIReport } from '../types/aiReport';
import { getEnv } from '@/lib/matchmaking/config';
import { logger } from '../utils/logger';
import { AppError, ErrorCodes } from '../types/api';
import { validateAIReport } from './schemas';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
  choices: Array<{
    message: { content: string };
    finish_reason?: string;
  }>;
}

// Fallback report when AI is unavailable — deterministic report per spec §50, §86
export function buildFallbackReport(): AIReport {
  return {
    reportVersion: '1.0.0',
    summary: 'AI interpretation is temporarily unavailable. The deterministic compatibility analysis above remains valid.',
    overallInterpretation: 'Please refer to the numerical compatibility scores and Guna Milan analysis provided.',
    gunaMilan: {
      summary: 'See Gun Milan scores above.',
      interpretation: 'Traditional Ashtakoot analysis has been completed. Please consult the numerical scores.',
    },
    rashiAnalysis: 'AI interpretation temporarily unavailable.',
    nakshatraAnalysis: 'AI interpretation temporarily unavailable.',
    ganaAnalysis: 'AI interpretation temporarily unavailable.',
    gotraAnalysis: 'AI interpretation temporarily unavailable.',
    manglikAnalysis: 'AI interpretation temporarily unavailable.',
    emotionalAnalysis: 'AI interpretation temporarily unavailable.',
    communicationAnalysis: 'AI interpretation temporarily unavailable.',
    familyAnalysis: 'AI interpretation temporarily unavailable.',
    lifestyleAnalysis: 'AI interpretation temporarily unavailable.',
    financialAnalysis: 'AI interpretation temporarily unavailable.',
    careerAnalysis: 'AI interpretation temporarily unavailable.',
    longTermAnalysis: 'AI interpretation temporarily unavailable.',
    favorableFactors: [],
    cautionFactors: [],
    practicalConsiderations: ['Please consult an experienced Vedic astrologer for personalized guidance.'],
    finalAssessment: 'AI-powered report temporarily unavailable. Deterministic analysis is complete.',
  };
}

export class OpenRouterProvider implements AIProvider {
  async generateCompatibilityReport(input: AICompatibilityInput): Promise<AIReport> {
    const env = getEnv();

    if (!env.OPENROUTER_API_KEY) {
      logger.warn('OpenRouter API key not configured — returning fallback report');
      return buildFallbackReport();
    }

    const maxRetries = env.AI_MAX_RETRIES;
    let lastError: unknown;

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(input) },
    ];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), env.OPENROUTER_TIMEOUT_MS);

      try {
        const response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/harshpasiya/samaj-setu-ai',
            'X-Title': 'Samaj Setu AI Matchmaking',
          },
          body: JSON.stringify({
            model: env.OPENROUTER_MODEL,
            messages,
            // Note: response_format is NOT used — Gemma doesn't support it.
            // We instruct the model via the system prompt to return JSON.
            temperature: 0.3,
            max_tokens: 4096,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          throw new AppError(ErrorCodes.AI_RATE_LIMIT, 429, 'OpenRouter rate limit reached.');
        }

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new AppError(ErrorCodes.AI_PROVIDER_ERROR, 502,
            `OpenRouter error: ${response.status}`, { body: body.slice(0, 500) });
        }

        const data = await response.json() as OpenRouterResponse;
        const content = data?.choices?.[0]?.message?.content;

        if (!content) {
          throw new AppError(ErrorCodes.AI_INVALID_OUTPUT, 502, 'Empty response from AI provider.');
        }

        // Extract JSON from the response — Gemma may wrap it in markdown
        let jsonContent = content.trim();
        // Remove leading/trailing markdown code fences
        jsonContent = jsonContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
        // Find the JSON object if there's surrounding text
        const jsonStart = jsonContent.indexOf('{');
        const jsonEnd = jsonContent.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          jsonContent = jsonContent.slice(jsonStart, jsonEnd + 1);
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonContent);
        } catch {
          throw new AppError(ErrorCodes.AI_INVALID_OUTPUT, 502, 'AI response is not valid JSON.');
        }

        // Validate against schema — AI cannot sneak in extra numerical scores
        const validated = validateAIReport(parsed);
        logger.info('AI report generated', { model: env.OPENROUTER_MODEL });
        return validated;

      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof AppError && err.code !== ErrorCodes.AI_PROVIDER_ERROR) throw err;

        if ((err as Error).name === 'AbortError') {
          lastError = new AppError(ErrorCodes.AI_PROVIDER_TIMEOUT, 504, 'OpenRouter timed out.');
        } else {
          lastError = err;
        }

        if (attempt < maxRetries) {
          const delay = Math.min(2000 * 2 ** attempt, 10000);
          logger.warn('AI request failed, retrying', { attempt, delay });
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    // AI failure NEVER breaks matchmaking — return fallback per spec §50, §86
    logger.warn('AI report generation failed after retries — returning fallback', {
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
    return buildFallbackReport();
  }
}
