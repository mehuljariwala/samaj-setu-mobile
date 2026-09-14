import type { KootaResult } from '../../types/compatibility.js';
import { getPlanetRelationship } from '../../constants/planets.js';
import type { Planet } from '../../constants/planets.js';
import { getGrahaMaitriScore } from '../../constants/astrology.js';

// Graha Maitri Koota — max 5 points per spec §25
// Based on the natural relationship between the lords of the Moon signs
export function calculateGrahaMaitri(boyMoonLord: string, girlMoonLord: string): KootaResult {
  const boyPlanet = boyMoonLord as Planet;
  const girlPlanet = girlMoonLord as Planet;

  const boyRelToGirl = getPlanetRelationship(boyPlanet, girlPlanet);
  const girlRelToBoy = getPlanetRelationship(girlPlanet, boyPlanet);

  const score = getGrahaMaitriScore(boyRelToGirl, girlRelToBoy);

  return {
    score,
    maximumScore: 5,
    status: score >= 4 ? 'favorable' : score >= 3 ? 'neutral' : score >= 1 ? 'caution' : 'strong_caution',
    personAValue: `${boyMoonLord} (${boyRelToGirl})`,
    personBValue: `${girlMoonLord} (${girlRelToBoy})`,
    explanationCode: 'GRAHA-MAITRI-001',
    evidence: [
      `Boy Moon sign lord: ${boyMoonLord}`,
      `Girl Moon sign lord: ${girlMoonLord}`,
      `${boyMoonLord} considers ${girlMoonLord} a ${boyRelToGirl}`,
      `${girlMoonLord} considers ${boyMoonLord} a ${girlRelToBoy}`,
      `Graha Maitri score: ${score}/5`,
    ],
  };
}
