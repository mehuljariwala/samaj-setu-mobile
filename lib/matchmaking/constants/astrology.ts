// Varna hierarchy (Koota scores)
export const VARNA_HIERARCHY: Record<string, number> = {
  brahmin: 4,
  kshatriya: 3,
  vaishya: 2,
  shudra: 1,
};

// Bhakoot compatibility rules (sign distance 1-12)
// Unfavorable: 6/8, 9/5, 12/2 — Favorable: others
export function getBhakootRelation(rashiA: number, rashiB: number): 'favorable' | 'unfavorable' {
  const fwd = ((rashiB - rashiA + 12) % 12) + 1; // 1-12
  const bck = ((rashiA - rashiB + 12) % 12) + 1;
  const unfavorable = [
    [6, 8], [8, 6],
    [9, 5], [5, 9],
    [12, 2], [2, 12],
  ];
  for (const [a, b] of unfavorable) {
    if (fwd === a && bck === b) return 'unfavorable';
  }
  return 'favorable';
}

// Graha Maitri scoring table based on lord relationships
// friend-friend: 5, friend-neutral/neutral-friend: 4,
// neutral-neutral: 3, friend-enemy/enemy-friend: 1, enemy-enemy: 0
export function getGrahaMaitriScore(
  relA: 'friend' | 'neutral' | 'enemy',
  relB: 'friend' | 'neutral' | 'enemy',
): number {
  if (relA === 'friend' && relB === 'friend') return 5;
  if ((relA === 'friend' && relB === 'neutral') || (relA === 'neutral' && relB === 'friend')) return 4;
  if (relA === 'neutral' && relB === 'neutral') return 3;
  if ((relA === 'friend' && relB === 'enemy') || (relA === 'enemy' && relB === 'friend')) return 1;
  return 0; // enemy-enemy or neutral-enemy
}

// Element compatibility for emotional/lifestyle scoring
export const ELEMENT_COMPATIBILITY: Record<string, Record<string, number>> = {
  fire:  { fire: 90, air: 80, earth: 50, water: 40 },
  earth: { earth: 85, water: 75, fire: 50, air: 45 },
  air:   { air: 85, fire: 80, water: 55, earth: 45 },
  water: { water: 88, earth: 75, air: 55, fire: 40 },
};

// Quality (modality) compatibility
export const QUALITY_COMPATIBILITY: Record<string, Record<string, number>> = {
  cardinal: { cardinal: 60, fixed: 75, mutable: 80 },
  fixed:    { fixed: 65, mutable: 80, cardinal: 75 },
  mutable:  { mutable: 70, cardinal: 80, fixed: 80 },
};
