import type { CompatibilityFactor } from '../types/compatibility.js';
import type { Kundli } from '../types/kundli.js';
import { getRashiByIndex } from '../constants/rashis.js';
import { ELEMENT_COMPATIBILITY, QUALITY_COMPATIBILITY } from '../constants/astrology.js';

// Rashi compatibility — spec §28, rule RASHI-001
export function calculateRashiCompatibility(personA: Kundli, personB: Kundli): CompatibilityFactor {
  const rashiA = getRashiByIndex(personA.rashi.index);
  const rashiB = getRashiByIndex(personB.rashi.index);

  if (!rashiA || !rashiB) {
    return {
      status: 'unknown',
      score: null,
      evidence: ['Rashi data unavailable.'],
      confidence: 'low',
    };
  }

  const elementScore = ELEMENT_COMPATIBILITY[rashiA.element]?.[rashiB.element] ?? 50;
  const qualityScore = QUALITY_COMPATIBILITY[rashiA.quality]?.[rashiB.quality] ?? 70;

  // Sign distance consideration (7th sign from each other = special relationship)
  const distance = Math.abs(personA.rashi.index - personB.rashi.index);
  const oppositeBonus = (distance === 6) ? 5 : 0; // Opposite signs share axis — nuanced
  const trikonaBonus = (distance === 4 || distance === 8) ? 8 : 0; // Trine signs

  const score = Math.min(100, Math.round((elementScore * 0.5 + qualityScore * 0.4) + oppositeBonus + trikonaBonus));

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
      `Person A Moon sign: ${rashiA.name} (${rashiA.element}, ${rashiA.quality})`,
      `Person B Moon sign: ${rashiB.name} (${rashiB.element}, ${rashiB.quality})`,
      `Element compatibility: ${elementScore}%`,
      `Quality compatibility: ${qualityScore}%`,
      distance === 6 ? 'Opposite signs — shares relationship axis.' : '',
      (distance === 4 || distance === 8) ? 'Trine sign relationship — traditionally harmonious.' : '',
    ].filter(Boolean),
    confidence: 'high',
    explanationCode: 'RASHI-001',
  };
}
