import type { KootaResult } from '../../types/compatibility';
import { VASHYA_GROUPS } from '../../constants/rashis';

// Vashya Koota — max 2 points per spec §25
// vashya map: controlled-by relationships
const VASHYA_SCORE: Record<string, Record<string, number>> = {
  chatushpada: { chatushpada: 2, manava: 1, jalchar: 0, vanchar: 0, keeta: 0 },
  manava:      { manava: 2, chatushpada: 1, jalchar: 1, vanchar: 0, keeta: 0 },
  jalchar:     { jalchar: 2, chatushpada: 1, manava: 1, vanchar: 0, keeta: 0 },
  vanchar:     { vanchar: 2, chatushpada: 1, manava: 0, jalchar: 0, keeta: 0 },
  keeta:       { keeta: 2, jalchar: 1, manava: 0, chatushpada: 0, vanchar: 0 },
};

export function calculateVashya(
  boyRashiName: string,
  girlRashiName: string,
): KootaResult {
  const boyGroup = VASHYA_GROUPS[boyRashiName] ?? 'manava';
  const girlGroup = VASHYA_GROUPS[girlRashiName] ?? 'manava';

  const score = VASHYA_SCORE[boyGroup]?.[girlGroup] ?? 0;

  return {
    score,
    maximumScore: 2,
    status: score === 2 ? 'favorable' : score === 1 ? 'neutral' : 'caution',
    personAValue: `${boyRashiName} (${boyGroup})`,
    personBValue: `${girlRashiName} (${girlGroup})`,
    explanationCode: 'VASHYA-001',
    evidence: [
      `Boy Vashya group: ${boyGroup}`,
      `Girl Vashya group: ${girlGroup}`,
      `Score: ${score}/2`,
    ],
  };
}
