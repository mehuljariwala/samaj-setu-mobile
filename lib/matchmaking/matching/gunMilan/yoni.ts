import type { KootaResult } from '../../types/compatibility';
import { getYoniScore } from '../../constants/nakshatras';

/**
 * Yoni Koota — max 4 points.
 *
 * This used to score in three buckets: 4 for the same animal, 0 for a
 * sworn-enemy pair, 2 for everything else. The 3-point "friendly" branch it
 * appeared to have could never run, because the table it consulted mapped
 * every animal to a list containing only itself, and that case was already
 * taken by the equality check above it. The effect was that 624 of the 729
 * nakshatra pairs — 86% — came back as a flat neutral 2.
 *
 * It now reads the classical 14x14 grid, so friendly (3) and unfriendly (1)
 * are distinguished as the tradition distinguishes them.
 */
export function calculateYoni(boyYoni: string, girlYoni: string): KootaResult {
  const score = getYoniScore(boyYoni, girlYoni);

  if (score === undefined) {
    return {
      score: 0,
      maximumScore: 4,
      status: 'neutral',
      personAValue: boyYoni,
      personBValue: girlYoni,
      explanationCode: 'YONI-UNKNOWN',
      evidence: [`Unrecognised Yoni pair: ${boyYoni} / ${girlYoni}.`],
    };
  }

  const relation =
    score === 4 ? 'Same Yoni'
      : score === 3 ? 'Friendly Yonis'
        : score === 2 ? 'Neutral Yonis'
          : score === 1 ? 'Unfriendly Yonis'
            : 'Sworn-enemy Yonis';

  const note =
    score === 4 ? 'Same Yoni — highly compatible.'
      : score === 3 ? 'Friendly Yoni pair.'
        : score === 2 ? 'Neither friendly nor hostile.'
          : score === 1 ? 'Unfriendly Yoni pair — traditional caution.'
            : 'Sworn-enemy Yoni pair — traditionally the strongest Yoni caution.';

  return {
    score,
    maximumScore: 4,
    status: score >= 3 ? 'favorable' : score === 2 ? 'neutral' : score === 1 ? 'caution' : 'strong_caution',
    personAValue: boyYoni,
    personBValue: girlYoni,
    explanationCode: 'YONI-001',
    evidence: [
      `Boy Yoni: ${boyYoni}`,
      `Girl Yoni: ${girlYoni}`,
      `${relation} — ${score}/4.`,
      note,
    ],
  };
}
