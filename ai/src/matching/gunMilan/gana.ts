import type { KootaResult } from '../../types/compatibility.js';

// Gana Koota — max 6 points per spec §25, §30
// Deva-Deva=6, Manushya-Manushya=6, Rakshasa-Rakshasa=6
// Deva-Manushya=5, Manushya-Deva=5
// Deva-Rakshasa=0 (strong caution), Rakshasa-Deva=0
// Manushya-Rakshasa=1, Rakshasa-Manushya=0

const GANA_SCORE: Record<string, Record<string, number>> = {
  deva:      { deva: 6, manushya: 5, rakshasa: 0 },
  manushya:  { deva: 5, manushya: 6, rakshasa: 1 },
  rakshasa:  { deva: 0, manushya: 0, rakshasa: 6 },
};

export function calculateGanaKoota(
  boyGana: string,
  girlGana: string,
): KootaResult {
  const score = GANA_SCORE[boyGana]?.[girlGana] ?? 0;

  const status =
    score === 6 ? 'favorable' :
    score >= 4 ? 'neutral' :
    score >= 1 ? 'caution' : 'strong_caution';

  return {
    score,
    maximumScore: 6,
    status,
    personAValue: boyGana,
    personBValue: girlGana,
    explanationCode: 'GANA-001',
    evidence: [
      `Boy Gana: ${boyGana}`,
      `Girl Gana: ${girlGana}`,
      `Gana compatibility score: ${score}/6`,
      boyGana === girlGana
        ? 'Same Gana — maximum compatibility.'
        : score === 0
        ? 'Strong Gana incompatibility — traditional strong caution.'
        : `Partial Gana compatibility.`,
    ],
  };
}
