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

// Yoni pairs — same yoni animals are compatible
export const YONI_COMPATIBILITY: Record<string, string[]> = {
  horse:    ['horse'],
  elephant: ['elephant'],
  goat:     ['goat'],
  serpent:  ['serpent'],
  dog:      ['dog'],
  cat:      ['cat'],
  rat:      ['rat'],
  cow:      ['cow'],
  buffalo:  ['buffalo'],
  tiger:    ['tiger'],
  deer:     ['deer'],
  monkey:   ['monkey'],
  lion:     ['lion'],
  mongoose: ['mongoose'],
};

// Yoni enemies — incompatible pairs
export const YONI_ENEMIES: [string, string][] = [
  ['cow', 'tiger'],
  ['elephant', 'lion'],
  ['horse', 'buffalo'],
  ['dog', 'deer'],
  ['rat', 'cat'],
  ['serpent', 'mongoose'],
  ['goat', 'monkey'],
];
