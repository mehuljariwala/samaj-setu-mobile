import type { KootaResult } from '../../types/compatibility';
import { YONI_COMPATIBILITY, YONI_ENEMIES } from '../../constants/nakshatras';

// Yoni Koota — max 4 points per spec §25
export function calculateYoni(boyYoni: string, girlYoni: string): KootaResult {
  let score = 0;

  const compatible = YONI_COMPATIBILITY[boyYoni]?.includes(girlYoni) ?? false;
  const isEnemy = YONI_ENEMIES.some(
    ([a, b]) => (a === boyYoni && b === girlYoni) || (a === girlYoni && b === boyYoni),
  );

  if (boyYoni === girlYoni) {
    score = 4; // Same yoni — maximum
  } else if (isEnemy) {
    score = 0; // Enemy yoni
  } else if (compatible) {
    score = 3;
  } else {
    score = 2; // Neutral
  }

  return {
    score,
    maximumScore: 4,
    status: score >= 4 ? 'favorable' : score >= 2 ? 'neutral' : 'caution',
    personAValue: boyYoni,
    personBValue: girlYoni,
    explanationCode: 'YONI-001',
    evidence: [
      `Boy Yoni: ${boyYoni}`,
      `Girl Yoni: ${girlYoni}`,
      boyYoni === girlYoni
        ? 'Same Yoni — highly compatible.'
        : isEnemy
        ? 'Enemy Yoni pair — caution.'
        : `Score: ${score}/4`,
    ],
  };
}
