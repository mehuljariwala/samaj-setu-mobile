export type CompatibilityStatus =
  | 'highly_favorable'
  | 'favorable'
  | 'neutral'
  | 'caution'
  | 'strong_caution'
  | 'unknown';

export type ScoreStatus = 'excellent' | 'good' | 'moderate' | 'caution' | 'insufficient_data';
export type Confidence = 'high' | 'medium' | 'low';
export type OverallCategory =
  | 'excellent'
  | 'very_good'
  | 'good'
  | 'moderate'
  | 'caution'
  | 'insufficient_data';

export interface CompatibilityFactor {
  status: CompatibilityStatus;
  score?: number | null;
  maximumScore?: number;
  percentage?: number | null;
  explanationCode?: string;
  evidence: string[];
  confidence: Confidence;
}

export interface KootaResult {
  score: number;
  maximumScore: number;
  status: 'favorable' | 'neutral' | 'caution' | 'strong_caution';
  personAValue: string;
  personBValue: string;
  explanationCode?: string;
  evidence: string[];
}

export interface GunaMilanResult {
  score: number;
  maximumScore: 36;
  percentage: number;
  varna: KootaResult;
  vashya: KootaResult;
  tara: KootaResult;
  yoni: KootaResult;
  grahaMaitri: KootaResult;
  gana: KootaResult;
  bhakoot: KootaResult;
  nadi: KootaResult;
  interpretation: string;
  providerCrossCheck?: import('./astrology.js').ProviderCrossCheck;
}

export interface ManglikResult {
  personA: {
    isManglik: boolean;
    source: 'navamsha' | 'internal';
    details?: string[];
  };
  personB: {
    isManglik: boolean;
    source: 'navamsha' | 'internal';
    details?: string[];
  };
  compatibilityStatus: 'compatible' | 'caution' | 'strong_caution' | 'unknown';
  cancellationFactors?: string[];
  explanation?: string;
}

export interface GotraData {
  personGotra?: string;
  partnerGotra?: string;
  status: 'same' | 'different' | 'unknown';
}

export interface CompatibilityScore {
  score: number | null;
  maximumScore: 100;
  status: ScoreStatus;
  factors: string[];
  evidence: string[];
  confidence: Confidence;
}

export interface OverallScore {
  score: number;
  maximumScore: 100;
  category: OverallCategory;
  confidence: Confidence;
  methodologyVersion: string;
}

export interface FactorExplanation {
  factor: string;
  explanation: string;
}

export interface MatchMetadata {
  matchId: string;
  algorithmVersion: string;
  promptVersion?: string;
  astrologyProvider: string;
  ayanamsha: string;
  createdAt: string;
}

export interface MatchOptions {
  generateAIReport?: boolean;
  language?: string;
  forceRefresh?: boolean;
}

export interface CompatibilityResult {
  matchId: string;
  algorithmVersion: string;
  astrology: {
    provider: string;
    methodology: string;
    ayanamsha: string;
  };
  gunaMilan: GunaMilanResult;
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
  overall: OverallScore;
  favorableFactors: FactorExplanation[];
  cautionFactors: FactorExplanation[];
  metadata: MatchMetadata;
}
