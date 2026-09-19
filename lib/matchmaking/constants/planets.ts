// 9 Vedic Grahas (planets) with relationships per spec §14
export const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'] as const;
export type Planet = (typeof PLANETS)[number];

// Natural planet relationships (Naisargika Sambandha)
// friend / neutral / enemy
export const PLANET_RELATIONSHIPS: Record<Planet, { friends: Planet[]; neutrals: Planet[]; enemies: Planet[] }> = {
  Sun:     { friends: ['Moon', 'Mars', 'Jupiter'],    neutrals: ['Mercury'],                  enemies: ['Venus', 'Saturn', 'Rahu', 'Ketu'] },
  Moon:    { friends: ['Sun', 'Mercury'],              neutrals: ['Mars', 'Jupiter', 'Venus', 'Saturn'], enemies: ['Rahu', 'Ketu'] },
  Mars:    { friends: ['Sun', 'Moon', 'Jupiter'],      neutrals: ['Venus', 'Saturn'],          enemies: ['Mercury', 'Rahu', 'Ketu'] },
  Mercury: { friends: ['Sun', 'Venus'],                neutrals: ['Mars', 'Jupiter', 'Saturn'], enemies: ['Moon', 'Rahu', 'Ketu'] },
  Jupiter: { friends: ['Sun', 'Moon', 'Mars'],         neutrals: ['Saturn'],                   enemies: ['Mercury', 'Venus', 'Rahu', 'Ketu'] },
  Venus:   { friends: ['Mercury', 'Saturn'],           neutrals: ['Mars', 'Jupiter'],          enemies: ['Sun', 'Moon', 'Rahu', 'Ketu'] },
  Saturn:  { friends: ['Mercury', 'Venus'],            neutrals: ['Jupiter'],                  enemies: ['Sun', 'Moon', 'Mars', 'Rahu', 'Ketu'] },
  Rahu:    { friends: ['Venus', 'Saturn'],             neutrals: ['Mercury', 'Jupiter'],       enemies: ['Sun', 'Moon', 'Mars'] },
  Ketu:    { friends: ['Mars', 'Venus', 'Saturn'],     neutrals: ['Mercury', 'Jupiter'],       enemies: ['Sun', 'Moon'] },
};

export type PlanetRelationship = 'friend' | 'neutral' | 'enemy';

export function getPlanetRelationship(planetA: Planet, planetB: Planet): PlanetRelationship {
  const rel = PLANET_RELATIONSHIPS[planetA];
  if (!rel) return 'neutral';
  if (rel.friends.includes(planetB)) return 'friend';
  if (rel.enemies.includes(planetB)) return 'enemy';
  return 'neutral';
}

// Manglik houses: Mars in 1st, 2nd, 4th, 7th, 8th, 12th
export const MANGLIK_HOUSES = [1, 2, 4, 7, 8, 12];

// Manglik cancellation factors
export const MANGLIK_CANCELLATION = [
  'Both persons are Manglik',
  'Mars in own sign (Aries, Scorpio)',
  'Mars in exaltation (Capricorn)',
  'Mars in 7th house of Navamsha',
  'Jupiter aspects Mars strongly',
  'Mars in Leo — considered partially cancelled by some traditions',
];
