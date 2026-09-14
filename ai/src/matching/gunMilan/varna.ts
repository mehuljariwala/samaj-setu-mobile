import type { KootaResult } from '../../types/compatibility.js';
import { VARNA_HIERARCHY } from '../../constants/astrology.js';
import type { Nakshatra } from '../../constants/nakshatras.js';

// Varna Koota — max 1 point per spec §25
// Boy's varna must be >= girl's varna
export function calculateVarna(boyNakshatra: Nakshatra, girlNakshatra: Nakshatra): KootaResult {
  const boyVarna = VARNA_HIERARCHY[boyNakshatra.varna] ?? 1;
  const girlVarna = VARNA_HIERARCHY[girlNakshatra.varna] ?? 1;

  const score = boyVarna >= girlVarna ? 1 : 0;

  return {
    score,
    maximumScore: 1,
    status: score === 1 ? 'favorable' : 'caution',
    personAValue: boyNakshatra.varna,
    personBValue: girlNakshatra.varna,
    explanationCode: 'VARNA-001',
    evidence: [
      `Boy Varna: ${boyNakshatra.varna} (${boyVarna})`,
      `Girl Varna: ${girlNakshatra.varna} (${girlVarna})`,
      score === 1
        ? 'Boy varna is equal or higher — traditional match.'
        : 'Boy varna is lower — traditional caution.',
    ],
  };
}
