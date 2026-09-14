import { describe, it, expect } from 'vitest';
import { calculateGunaMilan } from '../../src/matching/gunMilan/gunMilan.js';
import { calculateVarna } from '../../src/matching/gunMilan/varna.js';
import { calculateNadi } from '../../src/matching/gunMilan/nadi.js';
import { calculateGanaKoota } from '../../src/matching/gunMilan/gana.js';
import { calculateBhakoot } from '../../src/matching/gunMilan/bhakoot.js';
import { NAKSHATRAS } from '../../src/constants/nakshatras.js';
import { RASHIS } from '../../src/constants/rashis.js';

// Minimal Kundli mock builder
function mockKundli(rashiIndex: number, nakshatraIndex: number, rashiLord: string, gotra?: string) {
  const rashi = RASHIS[rashiIndex]!;
  const nak = NAKSHATRAS[nakshatraIndex]!;
  return {
    id: 'test',
    provider: 'navamsha' as const,
    methodology: { system: 'vedic' as const, ayanamsha: 'lahiri' as const },
    birthDetails: { dateOfBirth: '1990-01-01', timeOfBirth: '10:00:00', placeOfBirth: 'Test City', latitude: 20.0, longitude: 73.0, timezone: 'Asia/Kolkata' },
    birthDataHash: 'test',
    gotra,
    lagna: { sign: 'Aries', signIndex: 0 },
    rashi: { name: rashi.name, index: rashiIndex, lord: rashiLord },
    nakshatra: { name: nak.name, index: nakshatraIndex },
    planets: [],
    houses: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('Guna Milan — Individual Kootas', () => {
  describe('Nadi Koota', () => {
    it('returns 8 for different Nadi (aadi vs madhya)', () => {
      const result = calculateNadi('aadi', 'madhya');
      expect(result.score).toBe(8);
      expect(result.maximumScore).toBe(8);
      expect(result.status).toBe('favorable');
    });

    it('returns 0 for same Nadi (strong Dosha)', () => {
      const result = calculateNadi('aadi', 'aadi');
      expect(result.score).toBe(0);
      expect(result.status).toBe('strong_caution');
    });
  });

  describe('Gana Koota', () => {
    it('returns 6 for same Gana (deva-deva)', () => {
      const result = calculateGanaKoota('deva', 'deva');
      expect(result.score).toBe(6);
    });

    it('returns 0 for deva-rakshasa incompatibility', () => {
      const result = calculateGanaKoota('deva', 'rakshasa');
      expect(result.score).toBe(0);
      expect(result.status).toBe('strong_caution');
    });

    it('returns 5 for deva-manushya', () => {
      expect(calculateGanaKoota('deva', 'manushya').score).toBe(5);
    });
  });

  describe('Bhakoot Koota', () => {
    it('returns 7 for favorable relation (same sign)', () => {
      const result = calculateBhakoot(0, 0, 'Aries', 'Aries');
      expect(result.score).toBe(7);
    });

    it('returns 0 for 6/8 unfavorable relation', () => {
      // Aries (0) and Libra (6) = 7 forward, 7 back → actually favorable
      // Aries (0) and Virgo (5) = 6/8 → unfavorable
      const result = calculateBhakoot(0, 5, 'Aries', 'Virgo');
      expect(result.score).toBe(0);
      expect(result.status).toBe('strong_caution');
    });
  });

  describe('Varna Koota', () => {
    it('returns 1 when boy varna >= girl varna', () => {
      const brahminNak = NAKSHATRAS.find((n) => n.varna === 'brahmin')!;
      const shudraGirlNak = NAKSHATRAS.find((n) => n.varna === 'shudra')!;
      const result = calculateVarna(brahminNak, shudraGirlNak);
      expect(result.score).toBe(1);
    });

    it('returns 0 when boy varna < girl varna', () => {
      const shudraNav = NAKSHATRAS.find((n) => n.varna === 'shudra')!;
      const brahminNak = NAKSHATRAS.find((n) => n.varna === 'brahmin')!;
      const result = calculateVarna(shudraNav, brahminNak);
      expect(result.score).toBe(0);
    });
  });
});

describe('Guna Milan — Full Score', () => {
  it('produces score between 0 and 36', () => {
    const a = mockKundli(0, 0, 'Mars');  // Aries, Ashwini
    const b = mockKundli(4, 12, 'Sun'); // Leo, Hasta
    const result = calculateGunaMilan(a as never, b as never);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(36);
    expect(result.maximumScore).toBe(36);
    expect(typeof result.percentage).toBe('number');
  });

  it('is deterministic — same input produces same output', () => {
    const a = mockKundli(2, 5, 'Mercury');
    const b = mockKundli(7, 15, 'Mars');
    const r1 = calculateGunaMilan(a as never, b as never);
    const r2 = calculateGunaMilan(a as never, b as never);
    expect(r1.score).toBe(r2.score);
    expect(r1.nadi.score).toBe(r2.nadi.score);
    expect(r1.gana.score).toBe(r2.gana.score);
  });
});
