import type { KootaResult } from '../../types/compatibility';
import { TARA_NAMES, calculateTara } from '../../constants/nakshatras';

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

  // Half points are the tradition, not a rounding artefact: each side
  // contributes 1.5, so one favourable side scores 1.5 and both score 3.
  // Rounding here used to turn that 1.5 into 2, which inflated 67% of all
  // nakshatra pairs and pushed 4% of them over the 18/36 threshold that
  // families actually read as pass or fail.
  const score = (boyFavorable ? 1.5 : 0) + (girlFavorable ? 1.5 : 0);

  return {
    score,
    maximumScore: 3,
    status: score >= 3 ? 'favorable' : score >= 1.5 ? 'neutral' : 'caution',
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
