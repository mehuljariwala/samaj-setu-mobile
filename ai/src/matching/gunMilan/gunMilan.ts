import type { GunaMilanResult } from '../../types/compatibility.js';
import type { Kundli } from '../../types/kundli.js';
import { calculateVarna } from './varna.js';
import { calculateVashya } from './vashya.js';
import { calculateTaraKoota } from './tara.js';
import { calculateYoni } from './yoni.js';
import { calculateGrahaMaitri } from './grahaMaitri.js';
import { calculateGanaKoota } from './gana.js';
import { calculateBhakoot } from './bhakoot.js';
import { calculateNadi } from './nadi.js';
import { getNakshatraByName, getNakshatraByIndex } from '../../constants/nakshatras.js';
import { getRashiByName, getRashiByIndex } from '../../constants/rashis.js';

/**
 * Orchestrates all 8 Ashtakoot Kootas per spec §25.
 * Uses canonical Nakshatra/Rashi data.
 * LLM never modifies these scores.
 */
export function calculateGunaMilan(personA: Kundli, personB: Kundli): GunaMilanResult {
  // Resolve Nakshatra data for both persons
  const nakA = getNakshatraByName(personA.nakshatra.name)
    ?? getNakshatraByIndex(personA.nakshatra.index);
  const nakB = getNakshatraByName(personB.nakshatra.name)
    ?? getNakshatraByIndex(personB.nakshatra.index);

  // Resolve Rashi (Moon sign) data
  const rashiA = getRashiByName(personA.rashi.name) ?? getRashiByIndex(personA.rashi.index);
  const rashiB = getRashiByName(personB.rashi.name) ?? getRashiByIndex(personB.rashi.index);

  // In Guna Milan, Person A is traditionally "boy" — we keep this conventional
  // Per spec: same input → same output (deterministic)
  const varna       = nakA && nakB ? calculateVarna(nakA, nakB) : unknownKoota('Varna', 1);
  const vashya      = rashiA && rashiB ? calculateVashya(rashiA.name, rashiB.name) : unknownKoota('Vashya', 2);
  const tara        = calculateTaraKoota(personA.nakshatra.index, personB.nakshatra.index);
  const yoni        = nakA && nakB ? calculateYoni(nakA.yoni, nakB.yoni) : unknownKoota('Yoni', 4);
  const grahaMaitri = calculateGrahaMaitri(personA.rashi.lord, personB.rashi.lord);
  const gana        = nakA && nakB ? calculateGanaKoota(nakA.gana, nakB.gana) : unknownKoota('Gana', 6);
  const bhakoot     = rashiA && rashiB
    ? calculateBhakoot(rashiA.index, rashiB.index, rashiA.name, rashiB.name)
    : unknownKoota('Bhakoot', 7);
  const nadi        = nakA && nakB ? calculateNadi(nakA.nadi, nakB.nadi) : unknownKoota('Nadi', 8);

  const score = varna.score + vashya.score + tara.score + yoni.score +
    grahaMaitri.score + gana.score + bhakoot.score + nadi.score;

  const percentage = Math.round((score / 36) * 100);

  const interpretation =
    score >= 28 ? 'Highly favorable Guna Milan — traditionally considered excellent.' :
    score >= 21 ? 'Good Guna Milan — above the traditional threshold of 18/36.' :
    score >= 18 ? 'Acceptable Guna Milan — meets the traditional minimum threshold.' :
    score >= 13 ? 'Below the traditional minimum threshold — traditionally requires additional consideration.' :
    'Low Guna Milan score — traditionally considered challenging.';

  return {
    score,
    maximumScore: 36,
    percentage,
    varna,
    vashya,
    tara,
    yoni,
    grahaMaitri,
    gana,
    bhakoot,
    nadi,
    interpretation,
  };
}

function unknownKoota(name: string, max: number) {
  return {
    score: 0,
    maximumScore: max,
    status: 'neutral' as const,
    personAValue: 'unknown',
    personBValue: 'unknown',
    explanationCode: `${name.toUpperCase()}-UNKNOWN`,
    evidence: [`${name} data unavailable — could not calculate.`],
  };
}
