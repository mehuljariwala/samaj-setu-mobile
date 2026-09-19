import type { CompatibilityResult, GunaMilanResult, CompatibilityFactor, CompatibilityScore, ManglikResult, OverallScore, FactorExplanation } from './compatibility';

export interface AICompatibilityInput {
  methodology: {
    astrologySystem: string;
    ayanamsha: string;
    algorithmVersion: string;
  };
  gunaMilan: GunaMilanResult;
  factors: {
    rashi: CompatibilityFactor;
    nakshatra: CompatibilityFactor;
    gana: CompatibilityFactor;
    gotra: CompatibilityFactor;
    manglik: ManglikResult;
    emotional: CompatibilityScore;
    communication: CompatibilityScore;
    family: CompatibilityScore;
    lifestyle: CompatibilityScore;
    financial: CompatibilityScore;
    career: CompatibilityScore;
    longTerm: CompatibilityScore;
  };
  overall: OverallScore;
  favorableFactors: FactorExplanation[];
  cautionFactors: FactorExplanation[];
  language: string;
}

// AI report schema — text only, no numerical scores per spec §49
export interface AIReport {
  reportVersion: string;
  summary: string;
  overallInterpretation: string;
  gunaMilan: {
    summary: string;
    interpretation: string;
  };
  rashiAnalysis: string;
  nakshatraAnalysis: string;
  ganaAnalysis: string;
  gotraAnalysis: string;
  manglikAnalysis: string;
  emotionalAnalysis: string;
  communicationAnalysis: string;
  familyAnalysis: string;
  lifestyleAnalysis: string;
  financialAnalysis: string;
  careerAnalysis: string;
  longTermAnalysis: string;
  favorableFactors: string[];
  cautionFactors: string[];
  practicalConsiderations: string[];
  finalAssessment: string;
}

export interface AIProvider {
  generateCompatibilityReport(input: AICompatibilityInput): Promise<AIReport>;
}

export function buildAIInput(
  compatibility: CompatibilityResult,
  language = 'en',
): AICompatibilityInput {
  return {
    methodology: {
      astrologySystem: compatibility.astrology.methodology,
      ayanamsha: compatibility.astrology.ayanamsha,
      algorithmVersion: compatibility.algorithmVersion,
    },
    gunaMilan: compatibility.gunaMilan,
    factors: {
      rashi: compatibility.rashi,
      nakshatra: compatibility.nakshatra,
      gana: compatibility.gana,
      gotra: compatibility.gotra,
      manglik: compatibility.manglik,
      emotional: compatibility.emotional,
      communication: compatibility.communication,
      family: compatibility.family,
      lifestyle: compatibility.lifestyle,
      financial: compatibility.financial,
      career: compatibility.career,
      longTerm: compatibility.longTerm,
    },
    overall: compatibility.overall,
    favorableFactors: compatibility.favorableFactors,
    cautionFactors: compatibility.cautionFactors,
    language,
  };
}
