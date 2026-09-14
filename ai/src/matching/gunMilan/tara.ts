import type { KootaResult } from '../../types/compatibility.js';
import { TARA_NAMES, calculateTara } from '../../constants/nakshatras.js';

// Tara Koota — max 3 points per spec §25
// Favorable Taras: 2,4,6,8,9 → 1 point each (max 3 combined for boy+girl)
const FAVORABLE_TARAS = new Set([2, 4, 6, 8, 9]);

export function calculateTaraKoota(
  boyNakshatraIndex: number,
  girlNakshatraIndex: number,
): KootaResult {
  const boyTara = calculateTara(boyNakshatraIndex, girlNakshatraIndex);
  const girlTara = calculateTara(girlNakshatraIndex, boyNakshatraIndex);

  const boyFavorable = FAVORABLE_TARAS.has(boyTara);
  const girlFavorable = FAVORABLE_TARAS.has(girlTara);

  let score = 0;
  if (boyFavorable) score += 1.5;
  if (girlFavorable) score += 1.5;
  score = Math.round(score);

  return {
    score,
    maximumScore: 3,
    status: score >= 3 ? 'favorable' : score >= 1 ? 'neutral' : 'caution',
    personAValue: `${TARA_NAMES[boyTara - 1]} (${boyTara})`,
    personBValue: `${TARA_NAMES[girlTara - 1]} (${girlTara})`,
    explanationCode: 'TARA-001',
    evidence: [
      `Boy Tara from Girl: ${TARA_NAMES[boyTara - 1]} — ${boyFavorable ? 'favorable' : 'unfavorable'}`,
      `Girl Tara from Boy: ${TARA_NAMES[girlTara - 1]} — ${girlFavorable ? 'favorable' : 'unfavorable'}`,
      `Score: ${score}/3`,
    ],
  };
}
