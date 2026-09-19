// 27 Nakshatras with canonical Vedic attributes per spec §13
export interface Nakshatra {
  index: number;
  name: string;
  lord: string;             // Ruling planet (Vimshottari Dasha lord)
  rashiIndex: number;       // Primary sign index (0-11)
  gana: 'deva' | 'manushya' | 'rakshasa';
  yoni: string;             // Animal symbol
  nadi: 'aadi' | 'madhya' | 'antya'; // Nadi group
  varna: 'brahmin' | 'kshatriya' | 'vaishya' | 'shudra';
  gender: 'male' | 'female';
}

export const NAKSHATRAS: Nakshatra[] = [
  { index: 0,  name: 'Ashwini',      lord: 'Ketu',    rashiIndex: 0,  gana: 'deva',      yoni: 'horse',    nadi: 'aadi',   varna: 'vaishya',   gender: 'male' },
  { index: 1,  name: 'Bharani',      lord: 'Venus',   rashiIndex: 0,  gana: 'manushya',  yoni: 'elephant', nadi: 'madhya', varna: 'shudra',    gender: 'male' },
  { index: 2,  name: 'Krittika',     lord: 'Sun',     rashiIndex: 1,  gana: 'rakshasa',  yoni: 'goat',     nadi: 'antya',  varna: 'brahmin',   gender: 'female' },
  { index: 3,  name: 'Rohini',       lord: 'Moon',    rashiIndex: 1,  gana: 'manushya',  yoni: 'serpent',  nadi: 'antya',  varna: 'shudra',    gender: 'male' },
  { index: 4,  name: 'Mrigashira',   lord: 'Mars',    rashiIndex: 2,  gana: 'deva',      yoni: 'serpent',  nadi: 'madhya', varna: 'vaishya',   gender: 'female' },
  { index: 5,  name: 'Ardra',        lord: 'Rahu',    rashiIndex: 2,  gana: 'manushya',  yoni: 'dog',      nadi: 'aadi',   varna: 'shudra',    gender: 'female' },
  { index: 6,  name: 'Punarvasu',    lord: 'Jupiter', rashiIndex: 3,  gana: 'deva',      yoni: 'cat',      nadi: 'aadi',   varna: 'vaishya',   gender: 'male' },
  { index: 7,  name: 'Pushya',       lord: 'Saturn',  rashiIndex: 3,  gana: 'deva',      yoni: 'goat',     nadi: 'madhya', varna: 'kshatriya', gender: 'male' },
  { index: 8,  name: 'Ashlesha',     lord: 'Mercury', rashiIndex: 3,  gana: 'rakshasa',  yoni: 'cat',      nadi: 'antya',  varna: 'shudra',    gender: 'male' },
  { index: 9,  name: 'Magha',        lord: 'Ketu',    rashiIndex: 4,  gana: 'rakshasa',  yoni: 'rat',      nadi: 'antya',  varna: 'shudra',    gender: 'female' },
  { index: 10, name: 'Purva Phalguni', lord: 'Venus', rashiIndex: 4,  gana: 'manushya',  yoni: 'rat',      nadi: 'madhya', varna: 'brahmin',   gender: 'female' },
  { index: 11, name: 'Uttara Phalguni', lord: 'Sun',  rashiIndex: 5,  gana: 'manushya',  yoni: 'cow',      nadi: 'aadi',   varna: 'kshatriya', gender: 'female' },
  { index: 12, name: 'Hasta',        lord: 'Moon',    rashiIndex: 5,  gana: 'deva',      yoni: 'buffalo',  nadi: 'aadi',   varna: 'vaishya',   gender: 'male' },
  { index: 13, name: 'Chitra',       lord: 'Mars',    rashiIndex: 6,  gana: 'rakshasa',  yoni: 'tiger',    nadi: 'madhya', varna: 'vaishya',   gender: 'female' },
  { index: 14, name: 'Swati',        lord: 'Rahu',    rashiIndex: 6,  gana: 'deva',      yoni: 'buffalo',  nadi: 'antya',  varna: 'shudra',    gender: 'male' },
  { index: 15, name: 'Vishakha',     lord: 'Jupiter', rashiIndex: 7,  gana: 'rakshasa',  yoni: 'tiger',    nadi: 'antya',  varna: 'shudra',    gender: 'female' },
  { index: 16, name: 'Anuradha',     lord: 'Saturn',  rashiIndex: 7,  gana: 'deva',      yoni: 'deer',     nadi: 'madhya', varna: 'shudra',    gender: 'male' },
  { index: 17, name: 'Jyeshtha',     lord: 'Mercury', rashiIndex: 7,  gana: 'rakshasa',  yoni: 'deer',     nadi: 'aadi',   varna: 'vaishya',   gender: 'female' },
  { index: 18, name: 'Mula',         lord: 'Ketu',    rashiIndex: 8,  gana: 'rakshasa',  yoni: 'dog',      nadi: 'aadi',   varna: 'kshatriya', gender: 'female' },
  { index: 19, name: 'Purva Ashadha', lord: 'Venus',  rashiIndex: 8,  gana: 'manushya',  yoni: 'monkey',   nadi: 'madhya', varna: 'brahmin',   gender: 'female' },
  { index: 20, name: 'Uttara Ashadha', lord: 'Sun',   rashiIndex: 9,  gana: 'manushya',  yoni: 'mongoose', nadi: 'antya',  varna: 'kshatriya', gender: 'female' },
  { index: 21, name: 'Shravana',     lord: 'Moon',    rashiIndex: 9,  gana: 'deva',      yoni: 'monkey',   nadi: 'antya',  varna: 'shudra',    gender: 'male' },
  { index: 22, name: 'Dhanishtha',   lord: 'Mars',    rashiIndex: 10, gana: 'rakshasa',  yoni: 'lion',     nadi: 'madhya', varna: 'vaishya',   gender: 'female' },
  { index: 23, name: 'Shatabhisha',  lord: 'Rahu',    rashiIndex: 10, gana: 'rakshasa',  yoni: 'horse',    nadi: 'aadi',   varna: 'shudra',    gender: 'female' },
  { index: 24, name: 'Purva Bhadrapada', lord: 'Jupiter', rashiIndex: 11, gana: 'manushya', yoni: 'lion',  nadi: 'aadi',   varna: 'brahmin',   gender: 'male' },
  { index: 25, name: 'Uttara Bhadrapada', lord: 'Saturn',  rashiIndex: 11, gana: 'manushya', yoni: 'cow',   nadi: 'madhya', varna: 'kshatriya', gender: 'female' },
  { index: 26, name: 'Revati',       lord: 'Mercury', rashiIndex: 11, gana: 'deva',      yoni: 'elephant', nadi: 'antya',  varna: 'shudra',    gender: 'female' },
];

export function getNakshatraByIndex(index: number): Nakshatra | undefined {
  return NAKSHATRAS.find((n) => n.index === index);
}

export function getNakshatraByName(name: string): Nakshatra | undefined {
  const lower = name.toLowerCase();
  return NAKSHATRAS.find((n) => n.name.toLowerCase() === lower);
}

// Tara compatibility (birth star counting) — 9 Taras cycle
export const TARA_NAMES = [
  'Janma', 'Sampat', 'Vipat', 'Kshema', 'Pratyak',
  'Sadhana', 'Naidhana', 'Mitra', 'Parama Mitra',
];

export function calculateTara(fromNakshatraIndex: number, toNakshatraIndex: number): number {
  return ((toNakshatraIndex - fromNakshatraIndex + 27) % 27) % 9 + 1;
}

/**
 * The Yoni Koota matrix.
 *
 * Classical Yoni scoring is five-tiered: 4 for the same animal, 3 friendly,
 * 2 neutral, 1 unfriendly, 0 for the sworn-enemy pairs. Which pairs are
 * *friendly* is the part that varies between sources; the seven sworn-enemy
 * pairs (horse/buffalo, elephant/lion, goat/monkey, serpent/mongoose,
 * dog/deer, cat/rat, cow/tiger) are consistent everywhere and are the zeros
 * on the anti-diagonal below.
 *
 * Transcribed from the Saravali table and cross-checked against
 * findyourfate's per-animal friend/enemy lists, which reproduce the horse,
 * elephant, goat, serpent and dog rows exactly. Two cells in the source grid
 * disagreed with their mirror image and were resolved by that cross-check:
 * horse/deer is 3 (horse's friends are serpent, deer and monkey) and
 * buffalo/lion is 1 (lion is on buffalo's unfriendly list). One genuine
 * source disagreement is left at Saravali's value: cat/mongoose is 2 here,
 * where findyourfate makes it unfriendly.
 *
 * `goat` is Mesha and `deer` is Mriga; both animals are translated several
 * ways (sheep, ram; hare, rabbit) and the names here follow the nakshatra
 * table above.
 *
 * Symmetry and the all-4 diagonal are asserted in tests rather than trusted,
 * because a hand-transcribed 14x14 grid is exactly the kind of table that
 * rots silently.
 */
export const YONI_ORDER = [
  'horse', 'elephant', 'goat', 'serpent', 'dog', 'cat', 'rat',
  'cow', 'buffalo', 'tiger', 'deer', 'monkey', 'mongoose', 'lion',
] as const;

export type Yoni = (typeof YONI_ORDER)[number];

/* eslint-disable @stylistic/no-multi-spaces */
export const YONI_MATRIX: readonly (readonly number[])[] = [
  /*            hrs  ele  got  ser  dog  cat  rat  cow  buf  tig  dee  mon  mng  lio */
  /* horse */    [4,   2,   2,   3,   2,   2,   2,   1,   0,   1,   3,   3,   2,   1],
  /* elephant */ [2,   4,   3,   3,   2,   2,   2,   2,   3,   1,   2,   3,   2,   0],
  /* goat */     [2,   3,   4,   2,   1,   2,   1,   3,   3,   1,   2,   0,   3,   1],
  /* serpent */  [3,   3,   2,   4,   2,   1,   1,   1,   1,   2,   2,   2,   0,   2],
  /* dog */      [2,   2,   1,   2,   4,   2,   1,   2,   2,   1,   0,   2,   1,   1],
  /* cat */      [2,   2,   2,   1,   2,   4,   0,   2,   2,   1,   3,   3,   2,   1],
  /* rat */      [2,   2,   1,   1,   1,   0,   4,   2,   2,   2,   2,   2,   1,   2],
  /* cow */      [1,   2,   3,   1,   2,   2,   2,   4,   3,   0,   3,   2,   2,   1],
  /* buffalo */  [0,   3,   3,   1,   2,   2,   2,   3,   4,   1,   2,   2,   2,   1],
  /* tiger */    [1,   1,   1,   2,   1,   1,   2,   0,   1,   4,   1,   1,   2,   1],
  /* deer */     [3,   2,   2,   2,   0,   3,   2,   3,   2,   1,   4,   2,   2,   1],
  /* monkey */   [3,   3,   0,   2,   2,   3,   2,   2,   2,   1,   2,   4,   3,   2],
  /* mongoose */ [2,   2,   3,   0,   1,   2,   1,   2,   2,   2,   2,   3,   4,   2],
  /* lion */     [1,   0,   1,   2,   1,   1,   2,   1,   1,   1,   1,   2,   2,   4],
];
/* eslint-enable @stylistic/no-multi-spaces */

/** Score for a yoni pair, or undefined if either animal is unrecognised. */
export function getYoniScore(a: string, b: string): number | undefined {
  const i = YONI_ORDER.indexOf(a as Yoni);
  const j = YONI_ORDER.indexOf(b as Yoni);
  if (i < 0 || j < 0) return undefined;
  return YONI_MATRIX[i]![j];
}

/** The seven sworn-enemy pairs, derived from the matrix rather than restated. */
export const YONI_ENEMIES: [string, string][] = YONI_ORDER.flatMap((a, i) =>
  YONI_ORDER.slice(i + 1)
    .map((b, offset): [string, string] | null =>
      YONI_MATRIX[i]![i + 1 + offset] === 0 ? [a, b] : null)
    .filter((pair): pair is [string, string] => pair !== null));
