// 12 Rashis (zodiac signs) — canonical index 0-11 per spec §12
export interface Rashi {
  index: number;
  name: string;       // English
  sanskrit: string;   // Sanskrit name
  lord: string;       // Ruling planet
  element: 'fire' | 'earth' | 'air' | 'water';
  quality: 'cardinal' | 'fixed' | 'mutable';
  gender: 'male' | 'female';
}

export const RASHIS: Rashi[] = [
  { index: 0,  name: 'Aries',       sanskrit: 'Mesha',     lord: 'Mars',    element: 'fire',  quality: 'cardinal', gender: 'male' },
  { index: 1,  name: 'Taurus',      sanskrit: 'Vrishabha', lord: 'Venus',   element: 'earth', quality: 'fixed',    gender: 'female' },
  { index: 2,  name: 'Gemini',      sanskrit: 'Mithuna',   lord: 'Mercury', element: 'air',   quality: 'mutable',  gender: 'male' },
  { index: 3,  name: 'Cancer',      sanskrit: 'Karka',     lord: 'Moon',    element: 'water', quality: 'cardinal', gender: 'female' },
  { index: 4,  name: 'Leo',         sanskrit: 'Simha',     lord: 'Sun',     element: 'fire',  quality: 'fixed',    gender: 'male' },
  { index: 5,  name: 'Virgo',       sanskrit: 'Kanya',     lord: 'Mercury', element: 'earth', quality: 'mutable',  gender: 'female' },
  { index: 6,  name: 'Libra',       sanskrit: 'Tula',      lord: 'Venus',   element: 'air',   quality: 'cardinal', gender: 'male' },
  { index: 7,  name: 'Scorpio',     sanskrit: 'Vrischika', lord: 'Mars',    element: 'water', quality: 'fixed',    gender: 'female' },
  { index: 8,  name: 'Sagittarius', sanskrit: 'Dhanu',     lord: 'Jupiter', element: 'fire',  quality: 'mutable',  gender: 'male' },
  { index: 9,  name: 'Capricorn',   sanskrit: 'Makara',    lord: 'Saturn',  element: 'earth', quality: 'cardinal', gender: 'female' },
  { index: 10, name: 'Aquarius',    sanskrit: 'Kumbha',    lord: 'Saturn',  element: 'air',   quality: 'fixed',    gender: 'male' },
  { index: 11, name: 'Pisces',      sanskrit: 'Meena',     lord: 'Jupiter', element: 'water', quality: 'mutable',  gender: 'female' },
];

export function getRashiByIndex(index: number): Rashi | undefined {
  return RASHIS.find((r) => r.index === index);
}

export function getRashiByName(name: string): Rashi | undefined {
  const lower = name.toLowerCase();
  return RASHIS.find(
    (r) => r.name.toLowerCase() === lower || r.sanskrit.toLowerCase() === lower,
  );
}

// Vashya groups for Vashya Koota
export const VASHYA_GROUPS: Record<string, string> = {
  // Chatushpada (4-legged): Aries, Taurus, Capricorn (first half)
  Aries: 'chatushpada', Taurus: 'chatushpada', Capricorn: 'chatushpada',
  // Manava (human): Gemini, Virgo, Libra, Aquarius, Sagittarius (first half)
  Gemini: 'manava', Virgo: 'manava', Libra: 'manava', Aquarius: 'manava', Sagittarius: 'manava',
  // Jalchar (water): Cancer, Pisces, Capricorn (second half)
  Cancer: 'jalchar', Pisces: 'jalchar',
  // Vanchar (wild): Leo
  Leo: 'vanchar',
  // Keeta (insect): Scorpio
  Scorpio: 'keeta',
};
