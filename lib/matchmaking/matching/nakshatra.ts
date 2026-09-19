import type { CompatibilityFactor } from '../types/compatibility';
import type { Kundli } from '../types/kundli';
import { getNakshatraByName } from '../constants/nakshatras';
import { calculateTara, TARA_NAMES } from '../constants/nakshatras';

// Nakshatra compatibility — spec §29
export function calculateNakshatraCompatibility(personA: Kundli, personB: Kundli): CompatibilityFactor {
  const nakA = getNakshatraByName(personA.nakshatra.name);
  const nakB = getNakshatraByName(personB.nakshatra.name);

  if (!nakA || !nakB) {
    return {
      status: 'unknown',
      score: null,
      evidence: ['Nakshatra data unavailable.'],
      confidence: 'low',
    };
  }

  const taraAtoB = calculateTara(nakA.index, nakB.index);
  const taraBtoA = calculateTara(nakB.index, nakA.index);

  const favorableTaras = new Set([2, 4, 6, 8, 9]);
  const aBtoB = favorableTaras.has(taraAtoB);
  const aBtoA = favorableTaras.has(taraBtoA);

  let score = 50; // base
  if (aBtoB) score += 20;
  if (aBtoA) score += 20;

  // Same Nakshatra bonus (some traditions)
  if (nakA.index === nakB.index) score += 5;

  // Gana harmony boost
  if (nakA.gana === nakB.gana) score += 10;

  score = Math.min(100, score);

  const status =
    score >= 80 ? 'highly_favorable' :
    score >= 65 ? 'favorable' :
    score >= 50 ? 'neutral' :
    score >= 35 ? 'caution' : 'strong_caution';

  return {
    status,
    score,
    maximumScore: 100,
    percentage: score,
    evidence: [
      `Person A Nakshatra: ${nakA.name} (${nakA.gana} gana)`,
      `Person B Nakshatra: ${nakB.name} (${nakB.gana} gana)`,
      `Tara A→B: ${TARA_NAMES[taraAtoB - 1]} — ${aBtoB ? 'favorable' : 'unfavorable'}`,
      `Tara B→A: ${TARA_NAMES[taraBtoA - 1]} — ${aBtoA ? 'favorable' : 'unfavorable'}`,
    ],
    confidence: 'high',
    explanationCode: 'NAKSHATRA-001',
  };
}
