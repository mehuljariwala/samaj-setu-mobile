import { v4 as uuidv4 } from 'uuid';
import type { CompatibilityResult, OverallScore, FactorExplanation } from '../../types/compatibility.js';
import type { Kundli } from '../../types/kundli.js';
import { getEnv } from '../../config/env.js';
import { WEIGHTS } from './weights.js';
import { calculateGunaMilan } from '../gunMilan/gunMilan.js';
import { calculateRashiCompatibility } from '../rashi.js';
import { calculateNakshatraCompatibility } from '../nakshatra.js';
import { calculateGotraCompatibility } from '../gotra.js';
import { calculateManglik } from '../manglik.js';
import { calculateGanaKoota } from '../gunMilan/gana.js';
import {
  calculateEmotional,
  calculateCommunication,
  calculateFamily,
  calculateLifestyle,
  calculateFinancial,
  calculateCareer,
  calculateLongTerm,
} from '../factors.js';
import { weightedAverage } from '../../utils/numbers.js';
import { getNakshatraByName } from '../../constants/nakshatras.js';

/**
 * Main match engine — runs all deterministic calculations and produces CompatibilityResult.
 * The AI layer NEVER modifies any values returned here (spec §44, §98).
 */
export function runMatchEngine(personA: Kundli, personB: Kundli): CompatibilityResult {
  const env = getEnv();

  // ---- Guna Milan ----
  const gunaMilan = calculateGunaMilan(personA, personB);

  // ---- Rashi ----
  const rashi = calculateRashiCompatibility(personA, personB);

  // ---- Nakshatra ----
  const nakshatra = calculateNakshatraCompatibility(personA, personB);

  // ---- Gana (also as standalone factor) ----
  const nakA = getNakshatraByName(personA.nakshatra.name);
  const nakB = getNakshatraByName(personB.nakshatra.name);
  const ganaKoota = nakA && nakB ? calculateGanaKoota(nakA.gana, nakB.gana) : null;
  const gana = {
    status: (ganaKoota?.status ?? 'unknown') as 'highly_favorable' | 'favorable' | 'neutral' | 'caution' | 'strong_caution' | 'unknown',
    score: ganaKoota ? Math.round((ganaKoota.score / 6) * 100) : null,
    maximumScore: 100 as const,
    evidence: ganaKoota?.evidence ?? ['Gana data unavailable.'],
    confidence: (ganaKoota ? 'high' : 'low') as 'high' | 'medium' | 'low',
    explanationCode: 'GANA-001',
  };

  // ---- Gotra ----
  const gotraResult = calculateGotraCompatibility(personA.gotra, personB.gotra);
  const { gotraData: _gotraData, ...gotra } = gotraResult;

  // ---- Manglik ----
  const manglik = calculateManglik(personA, personB);

  // ---- Advanced factors ----
  const emotional     = calculateEmotional(personA, personB);
  const communication = calculateCommunication(personA, personB);
  const family        = calculateFamily(personA, personB);
  const lifestyle     = calculateLifestyle(personA, personB);
  const financial     = calculateFinancial(personA, personB);
  const career        = calculateCareer(personA, personB);
  const longTerm      = calculateLongTerm(personA, personB);

  // ---- Overall Score (weighted, missing data = null not zero) ----
  const gunaScore = Math.round((gunaMilan.score / 36) * 100);

  const overall = computeOverallScore({
    gunaScore,
    rashiScore: rashi.score,
    nakshatraScore: nakshatra.score,
    ganaScore: gana.score,
    emotionalScore: emotional.score,
    communicationScore: communication.score,
    familyScore: family.score,
    lifestyleScore: lifestyle.score,
    financialScore: financial.score,
    careerScore: career.score,
    longTermScore: longTerm.score,
    algorithmVersion: env.ALGORITHM_VERSION,
  });

  // ---- Evidence collection ----
  const { favorableFactors, cautionFactors } = collectFactors({
    gunaMilan, rashi, nakshatra, gana, manglik, emotional, communication, family, lifestyle, financial, career, longTerm,
  });

  return {
    matchId: uuidv4(),
    algorithmVersion: env.ALGORITHM_VERSION,
    astrology: { provider: 'navamsha', methodology: 'vedic', ayanamsha: 'lahiri' },
    gunaMilan,
    rashi,
    nakshatra,
    gana,
    gotra,
    manglik,
    emotional,
    communication,
    family,
    lifestyle,
    financial,
    career,
    longTerm,
    overall,
    favorableFactors,
    cautionFactors,
    metadata: {
      matchId: uuidv4(),
      algorithmVersion: env.ALGORITHM_VERSION,
      astrologyProvider: 'navamsha',
      ayanamsha: 'lahiri',
      createdAt: new Date().toISOString(),
    },
  };
}

function computeOverallScore(params: {
  gunaScore: number;
  rashiScore: number | null | undefined;
  nakshatraScore: number | null | undefined;
  ganaScore: number | null | undefined;
  emotionalScore: number | null | undefined;
  communicationScore: number | null | undefined;
  familyScore: number | null | undefined;
  lifestyleScore: number | null | undefined;
  financialScore: number | null | undefined;
  careerScore: number | null | undefined;
  longTermScore: number | null | undefined;
  algorithmVersion: string;
}): OverallScore {
  const avg = weightedAverage([
    { score: params.gunaScore,         weight: WEIGHTS.gunaMilan },
    { score: params.rashiScore,         weight: WEIGHTS.rashi },
    { score: params.nakshatraScore,     weight: WEIGHTS.nakshatra },
    { score: params.ganaScore,          weight: WEIGHTS.gana },
    { score: params.emotionalScore,     weight: WEIGHTS.emotional },
    { score: params.communicationScore, weight: WEIGHTS.communication },
    { score: params.familyScore,        weight: WEIGHTS.family },
    { score: params.lifestyleScore,     weight: WEIGHTS.lifestyle },
    { score: params.financialScore,     weight: WEIGHTS.financial },
    { score: params.careerScore,        weight: WEIGHTS.career },
    { score: params.longTermScore,      weight: WEIGHTS.longTerm },
  ]);

  const score = avg ?? 0;

  const category =
    score >= 85 ? 'excellent' :
    score >= 75 ? 'very_good' :
    score >= 60 ? 'good' :
    score >= 45 ? 'moderate' :
    score >= 30 ? 'caution' : 'insufficient_data';

  const confidence =
    [params.rashiScore, params.emotionalScore, params.nakshatraScore].filter(Boolean).length >= 2
      ? 'high' : 'medium';

  return { score, maximumScore: 100, category, confidence, methodologyVersion: params.algorithmVersion };
}

function collectFactors(factors: Record<string, unknown>): { favorableFactors: FactorExplanation[]; cautionFactors: FactorExplanation[] } {
  const favorableFactors: FactorExplanation[] = [];
  const cautionFactors: FactorExplanation[] = [];

  const gm = factors.gunaMilan as { percentage: number; interpretation: string };
  if (gm.percentage >= 60) {
    favorableFactors.push({ factor: 'Guna Milan', explanation: gm.interpretation });
  } else {
    cautionFactors.push({ factor: 'Guna Milan', explanation: gm.interpretation });
  }

  const manglik = factors.manglik as { compatibilityStatus: string; explanation?: string };
  if (manglik.compatibilityStatus === 'caution' || manglik.compatibilityStatus === 'strong_caution') {
    cautionFactors.push({ factor: 'Manglik', explanation: manglik.explanation ?? 'Manglik consideration.' });
  }

  const gotra = factors.gana as { status: string };
  if (gotra?.status === 'strong_caution') {
    cautionFactors.push({ factor: 'Gana', explanation: 'Gana incompatibility — traditional strong caution.' });
  }

  return { favorableFactors, cautionFactors };
}
