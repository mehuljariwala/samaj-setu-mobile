import type { CompatibilityFactor, GotraData } from '../types/compatibility';

// Gotra compatibility — spec §31, GOTRA-001
// Gotra is NEVER inferred from birth details (spec §73)
export function calculateGotraCompatibility(gotraA?: string, gotraB?: string): CompatibilityFactor & { gotraData: GotraData } {
  if (!gotraA || !gotraB) {
    const gotraData: GotraData = {
      personGotra: gotraA,
      partnerGotra: gotraB,
      status: 'unknown',
    };
    return {
      status: 'unknown',
      score: null,
      evidence: [
        !gotraA && !gotraB ? 'Neither person provided Gotra. Cannot assess.' :
        !gotraA ? 'Person A Gotra not provided.' : 'Person B Gotra not provided.',
        'Per tradition, Gotra should be provided by the family, not derived from birth data.',
      ],
      confidence: 'low',
      explanationCode: 'GOTRA-UNKNOWN',
      gotraData,
    };
  }

  const same = gotraA.trim().toLowerCase() === gotraB.trim().toLowerCase();
  const gotraData: GotraData = {
    personGotra: gotraA,
    partnerGotra: gotraB,
    status: same ? 'same' : 'different',
  };

  return {
    status: same ? 'caution' : 'favorable',
    score: same ? 0 : 100,
    maximumScore: 100,
    percentage: same ? 0 : 100,
    evidence: [
      `Person A Gotra: ${gotraA}`,
      `Person B Gotra: ${gotraB}`,
      same
        ? 'Same Gotra — traditionally considered a strong caution in many communities. Please verify with your family traditions.'
        : 'Different Gotra — traditionally considered auspicious.',
    ],
    confidence: 'high',
    explanationCode: 'GOTRA-001',
    gotraData,
  };
}
