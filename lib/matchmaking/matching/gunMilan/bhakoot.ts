import type { KootaResult } from '../../types/compatibility';
import { getBhakootRelation } from '../../constants/astrology';

// Bhakoot Koota — max 7 points per spec §25
// Favorable: 7 points, Unfavorable: 0 points
// Unfavorable: 6/8, 9/5, 12/2 sign relationships
export function calculateBhakoot(
  boyRashiIndex: number,
  girlRashiIndex: number,
  boyRashiName: string,
  girlRashiName: string,
): KootaResult {
  const relation = getBhakootRelation(boyRashiIndex, girlRashiIndex);
  const fwd = ((girlRashiIndex - boyRashiIndex + 12) % 12) + 1;
  const bck = ((boyRashiIndex - girlRashiIndex + 12) % 12) + 1;
  const score = relation === 'favorable' ? 7 : 0;

  return {
    score,
    maximumScore: 7,
    status: score === 7 ? 'favorable' : 'strong_caution',
    personAValue: boyRashiName,
    personBValue: girlRashiName,
    explanationCode: 'BHAKOOT-001',
    evidence: [
      `Boy Moon sign: ${boyRashiName} (index ${boyRashiIndex + 1})`,
      `Girl Moon sign: ${girlRashiName} (index ${girlRashiIndex + 1})`,
      `Bhakoot relation: ${fwd}/${bck}`,
      relation === 'favorable'
        ? 'Favorable Bhakoot — no doshas.'
        : `Bhakoot Dosha: ${fwd}/${bck} relationship — traditional caution.`,
    ],
  };
}
