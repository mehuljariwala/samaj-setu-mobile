import type { CompatibilityScore } from '../types/compatibility';
import type { Kundli } from '../types/kundli';
import { getPlanet, getPlanetsInHouse } from '../types/kundli';
import { getPlanetRelationship } from '../constants/planets';
import { ELEMENT_COMPATIBILITY } from '../constants/astrology';
import { getRashiByIndex } from '../constants/rashis';

// Emotional compatibility — Moon-based per spec §33, EMOTIONAL-001
export function calculateEmotional(personA: Kundli, personB: Kundli): CompatibilityScore {
  const moonA = getPlanet(personA, 'Moon');
  const moonB = getPlanet(personB, 'Moon');

  if (!moonA || !moonB) {
    return { score: null, maximumScore: 100, status: 'insufficient_data', factors: [], evidence: ['Moon data unavailable.'], confidence: 'low' };
  }

  const rashiA = getRashiByIndex(personA.rashi.index);
  const rashiB = getRashiByIndex(personB.rashi.index);
  let score = 50;
  const evidence: string[] = [];
  const factors: string[] = [];

  // Element compatibility
  if (rashiA && rashiB) {
    const elemScore = ELEMENT_COMPATIBILITY[rashiA.element]?.[rashiB.element] ?? 50;
    score = Math.round(score * 0.4 + elemScore * 0.6);
    evidence.push(`Moon element compatibility: ${rashiA.element} + ${rashiB.element} = ${elemScore}%`);
    factors.push('Moon element harmony');
  }

  // Moon-Moon relationship via sign lords
  const lordAtoB = getPlanetRelationship(personA.rashi.lord as never, personB.rashi.lord as never);
  if (lordAtoB === 'friend') { score = Math.min(100, score + 10); evidence.push('Moon sign lords are friends — emotionally harmonious.'); }
  if (lordAtoB === 'enemy') { score = Math.max(0, score - 10); evidence.push('Moon sign lords are enemies — emotional friction possible.'); }
  factors.push('Moon sign lord relationship');

  return {
    score,
    maximumScore: 100,
    status: score >= 75 ? 'excellent' : score >= 60 ? 'good' : score >= 45 ? 'moderate' : 'caution',
    factors,
    evidence,
    confidence: 'medium',
  };
}

// Communication compatibility — Mercury + Moon per spec §34, EMOTIONAL-001
export function calculateCommunication(personA: Kundli, personB: Kundli): CompatibilityScore {
  const mercuryA = getPlanet(personA, 'Mercury');
  const mercuryB = getPlanet(personB, 'Mercury');

  if (!mercuryA || !mercuryB) {
    return { score: null, maximumScore: 100, status: 'insufficient_data', factors: [], evidence: ['Mercury data unavailable.'], confidence: 'low' };
  }

  let score = 60;
  const evidence: string[] = [];

  const mercRel = getPlanetRelationship(mercuryA.sign as never, mercuryB.sign as never);
  const rashiA = getRashiByIndex(personA.rashi.index);
  const rashiB = getRashiByIndex(personB.rashi.index);

  if (rashiA && rashiB) {
    const elemScore = ELEMENT_COMPATIBILITY[rashiA.element]?.[rashiB.element] ?? 50;
    score = Math.round(score * 0.5 + elemScore * 0.4 + 10);
    evidence.push(`Communication element base: ${elemScore}%`);
  }

  if (!mercuryA.retrograde && !mercuryB.retrograde) {
    score = Math.min(100, score + 5);
    evidence.push('Both Mercury direct — clear communication style.');
  }

  evidence.push(`Mercury A sign: ${mercuryA.sign}, Mercury B sign: ${mercuryB.sign}`);

  return {
    score: Math.min(100, score),
    maximumScore: 100,
    status: score >= 75 ? 'excellent' : score >= 60 ? 'good' : score >= 45 ? 'moderate' : 'caution',
    factors: ['Mercury sign', 'Moon element harmony'],
    evidence,
    confidence: 'medium',
  };
}

// Family compatibility — 4th/2nd house per spec §35
export function calculateFamily(personA: Kundli, personB: Kundli): CompatibilityScore {
  const house4A = getPlanetsInHouse(personA, 4);
  const house4B = getPlanetsInHouse(personB, 4);
  const house2A = getPlanetsInHouse(personA, 2);
  const house2B = getPlanetsInHouse(personB, 2);

  let score = 65;
  const evidence: string[] = [];

  // Jupiter in 4th is beneficial
  if (house4A.some((p) => p.planet === 'Jupiter')) { score += 5; evidence.push('Jupiter in Person A 4th house — family harmony indicator.'); }
  if (house4B.some((p) => p.planet === 'Jupiter')) { score += 5; evidence.push('Jupiter in Person B 4th house — family harmony indicator.'); }

  // Moon in 2nd or 4th — family orientation
  if (house2A.some((p) => p.planet === 'Moon') || house4A.some((p) => p.planet === 'Moon')) {
    score += 5; evidence.push('Moon in Person A 2nd/4th — strong family values.');
  }

  evidence.push(`Person A 4th house planets: ${house4A.map((p) => p.planet).join(', ') || 'none'}`);
  evidence.push(`Person B 4th house planets: ${house4B.map((p) => p.planet).join(', ') || 'none'}`);

  return {
    score: Math.min(100, score),
    maximumScore: 100,
    status: score >= 75 ? 'excellent' : score >= 60 ? 'good' : score >= 45 ? 'moderate' : 'caution',
    factors: ['4th house indicators', '2nd house indicators'],
    evidence,
    confidence: house4A.length > 0 || house4B.length > 0 ? 'medium' : 'low',
  };
}

// Lifestyle compatibility — Venus/Mars/Moon per spec §36
export function calculateLifestyle(personA: Kundli, personB: Kundli): CompatibilityScore {
  const venusA = getPlanet(personA, 'Venus');
  const venusB = getPlanet(personB, 'Venus');
  const rashiA = getRashiByIndex(personA.rashi.index);
  const rashiB = getRashiByIndex(personB.rashi.index);

  let score = 60;
  const evidence: string[] = [];

  if (venusA && venusB) {
    const venRel = getPlanetRelationship(venusA.sign as never, venusB.sign as never);
    if (venRel === 'friend') { score += 10; evidence.push('Venus signs compatible — similar aesthetic and lifestyle values.'); }
    evidence.push(`Venus A: ${venusA.sign}, Venus B: ${venusB.sign}`);
  }

  if (rashiA && rashiB) {
    const qualScore = rashiA.quality === rashiB.quality ? 10 : 5;
    score += qualScore;
    evidence.push(`Modality match: ${rashiA.quality} + ${rashiB.quality}`);
  }

  return {
    score: Math.min(100, score),
    maximumScore: 100,
    status: score >= 75 ? 'excellent' : score >= 60 ? 'good' : score >= 45 ? 'moderate' : 'caution',
    factors: ['Venus sign', 'Moon modality'],
    evidence,
    confidence: venusA && venusB ? 'medium' : 'low',
  };
}

// Financial compatibility — 2nd/11th house per spec §37, FINANCIAL-001
export function calculateFinancial(personA: Kundli, personB: Kundli): CompatibilityScore {
  const house2A = getPlanetsInHouse(personA, 2);
  const house11A = getPlanetsInHouse(personA, 11);
  const house2B = getPlanetsInHouse(personB, 2);
  const house11B = getPlanetsInHouse(personB, 11);
  const jupA = getPlanet(personA, 'Jupiter');
  const jupB = getPlanet(personB, 'Jupiter');

  let score = 60;
  const evidence: string[] = [];

  if (house2A.some((p) => p.planet === 'Jupiter') || house11A.some((p) => p.planet === 'Jupiter')) {
    score += 8; evidence.push('Jupiter in Person A 2nd/11th — traditionally favorable for finances.');
  }
  if (house2B.some((p) => p.planet === 'Jupiter') || house11B.some((p) => p.planet === 'Jupiter')) {
    score += 8; evidence.push('Jupiter in Person B 2nd/11th — traditionally favorable for finances.');
  }
  if (jupA && jupB) {
    const rel = getPlanetRelationship(jupA.sign as never, jupB.sign as never);
    if (rel === 'friend') { score += 5; evidence.push('Jupiter signs compatible — aligned financial philosophies.'); }
  }

  evidence.push(
    `Person A 2nd house: ${house2A.map((p) => p.planet).join(', ') || 'none'}`,
    `Person A 11th house: ${house11A.map((p) => p.planet).join(', ') || 'none'}`,
  );

  return {
    score: Math.min(100, score),
    maximumScore: 100,
    status: score >= 75 ? 'excellent' : score >= 60 ? 'good' : score >= 45 ? 'moderate' : 'caution',
    factors: ['2nd house indicators', '11th house indicators', 'Jupiter relationship'],
    evidence,
    confidence: 'medium',
  };
}

// Career compatibility — 10th house per spec §38
export function calculateCareer(personA: Kundli, personB: Kundli): CompatibilityScore {
  const house10A = getPlanetsInHouse(personA, 10);
  const house10B = getPlanetsInHouse(personB, 10);
  const satA = getPlanet(personA, 'Saturn');
  const satB = getPlanet(personB, 'Saturn');

  let score = 60;
  const evidence: string[] = [];

  const rashiA = getRashiByIndex(personA.rashi.index);
  const rashiB = getRashiByIndex(personB.rashi.index);

  if (rashiA && rashiB) {
    const elemScore = ELEMENT_COMPATIBILITY[rashiA.element]?.[rashiB.element] ?? 50;
    score = Math.round(score * 0.5 + elemScore * 0.5);
  }

  if (satA && satB) {
    const rel = getPlanetRelationship(satA.sign as never, satB.sign as never);
    if (rel === 'friend') { score += 8; evidence.push('Saturn signs compatible — compatible work discipline.'); }
  }

  evidence.push(
    `Person A 10th house: ${house10A.map((p) => p.planet).join(', ') || 'none'}`,
    `Person B 10th house: ${house10B.map((p) => p.planet).join(', ') || 'none'}`,
  );

  return {
    score: Math.min(100, score),
    maximumScore: 100,
    status: score >= 75 ? 'excellent' : score >= 60 ? 'good' : score >= 45 ? 'moderate' : 'caution',
    factors: ['10th house indicators', 'Saturn sign'],
    evidence,
    confidence: 'medium',
  };
}

// Long-term compatibility — 7th house + Venus/Jupiter per spec §39
export function calculateLongTerm(personA: Kundli, personB: Kundli): CompatibilityScore {
  const house7A = getPlanetsInHouse(personA, 7);
  const house7B = getPlanetsInHouse(personB, 7);
  const venusA = getPlanet(personA, 'Venus');
  const venusB = getPlanet(personB, 'Venus');
  const jupA = getPlanet(personA, 'Jupiter');
  const jupB = getPlanet(personB, 'Jupiter');

  let score = 60;
  const evidence: string[] = [];

  if (house7A.some((p) => p.planet === 'Jupiter')) { score += 8; evidence.push('Jupiter in 7th — bliss and wisdom in partnership.'); }
  if (house7B.some((p) => p.planet === 'Jupiter')) { score += 8; evidence.push('Jupiter in partner 7th — supportive.'); }
  if (house7A.some((p) => p.planet === 'Venus')) { score += 6; evidence.push('Venus in 7th — romantic long-term potential.'); }

  if (venusA && venusB) {
    const rel = getPlanetRelationship(venusA.sign as never, venusB.sign as never);
    if (rel === 'friend') { score += 8; evidence.push('Venus signs compatible — harmonious long-term romantic alignment.'); }
    if (rel === 'enemy') { score -= 5; evidence.push('Venus signs in tension — long-term adjustment needed.'); }
  }

  if (jupA && jupB) {
    const rel = getPlanetRelationship(jupA.sign as never, jupB.sign as never);
    if (rel === 'friend') { score += 5; evidence.push('Jupiter signs aligned — shared growth and wisdom.'); }
  }

  evidence.push(
    `Person A 7th house: ${house7A.map((p) => p.planet).join(', ') || 'none'}`,
    `Person B 7th house: ${house7B.map((p) => p.planet).join(', ') || 'none'}`,
  );

  return {
    score: Math.min(100, score),
    maximumScore: 100,
    status: score >= 75 ? 'excellent' : score >= 60 ? 'good' : score >= 45 ? 'moderate' : 'caution',
    factors: ['7th house indicators', 'Venus relationship', 'Jupiter relationship'],
    evidence,
    confidence: 'medium',
  };
}
