import { describe, it, expect } from 'vitest';
import { calculateGunaMilan } from '@/lib/matchmaking/matching/gunMilan/gunMilan';
import { calculateVarna } from '@/lib/matchmaking/matching/gunMilan/varna';
import { calculateNadi } from '@/lib/matchmaking/matching/gunMilan/nadi';
import { calculateGanaKoota } from '@/lib/matchmaking/matching/gunMilan/gana';
import { calculateBhakoot } from '@/lib/matchmaking/matching/gunMilan/bhakoot';
import { calculateYoni } from '@/lib/matchmaking/matching/gunMilan/yoni';
import { calculateTaraKoota } from '@/lib/matchmaking/matching/gunMilan/tara';
import {
  NAKSHATRAS,
  YONI_ORDER,
  YONI_MATRIX,
  YONI_ENEMIES,
} from '@/lib/matchmaking/constants/nakshatras';
import { RASHIS } from '@/lib/matchmaking/constants/rashis';

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

describe('Yoni Koota', () => {
  // The grid is hand-transcribed from a classical table, so its shape is
  // asserted rather than trusted. Yoni compatibility is mutual; an asymmetric
  // cell means a copying slip, not a tradition.
  it('the matrix is 14x14, symmetric, and 4 down the diagonal', () => {
    expect(YONI_ORDER).toHaveLength(14);
    expect(YONI_MATRIX).toHaveLength(14);

    const asymmetric: string[] = [];
    for (let i = 0; i < 14; i++) {
      expect(YONI_MATRIX[i]).toHaveLength(14);
      expect(YONI_MATRIX[i]![i]).toBe(4);
      for (let j = 0; j < 14; j++) {
        const value = YONI_MATRIX[i]![j]!;
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(4);
        if (value !== YONI_MATRIX[j]![i]) {
          asymmetric.push(`${YONI_ORDER[i]}/${YONI_ORDER[j]}: ${value} vs ${YONI_MATRIX[j]![i]}`);
        }
      }
    }
    expect(asymmetric).toEqual([]);
  });

  it('scores 4 for the same yoni', () => {
    expect(calculateYoni('horse', 'horse').score).toBe(4);
    expect(calculateYoni('lion', 'lion').score).toBe(4);
  });

  it('scores 0 for each of the seven sworn-enemy pairs', () => {
    const sworn: [string, string][] = [
      ['horse', 'buffalo'], ['elephant', 'lion'], ['goat', 'monkey'],
      ['serpent', 'mongoose'], ['dog', 'deer'], ['cat', 'rat'], ['cow', 'tiger'],
    ];
    for (const [a, b] of sworn) {
      expect(calculateYoni(a, b).score, `${a}/${b}`).toBe(0);
      expect(calculateYoni(b, a).score, `${b}/${a}`).toBe(0);
    }
    // And the matrix derives exactly those seven, no more.
    expect(YONI_ENEMIES).toHaveLength(7);
  });

  it("scores 3 for friendly pairs — horse's friends are serpent, deer and monkey", () => {
    expect(calculateYoni('horse', 'serpent').score).toBe(3);
    expect(calculateYoni('horse', 'deer').score).toBe(3);
    expect(calculateYoni('horse', 'monkey').score).toBe(3);
  });

  it("scores 1 for unfriendly pairs — horse's are cow, tiger and lion", () => {
    expect(calculateYoni('horse', 'cow').score).toBe(1);
    expect(calculateYoni('horse', 'tiger').score).toBe(1);
    expect(calculateYoni('horse', 'lion').score).toBe(1);
  });

  it('scores 2 for a neutral pair', () => {
    expect(calculateYoni('horse', 'elephant').score).toBe(2);
  });

  /**
   * Regression for the dead "friendly" branch: the old table mapped every
   * animal to itself alone, so 3 and 1 were unreachable and 86% of real
   * nakshatra pairs collapsed onto a flat 2.
   */
  it('reaches all five tiers across real nakshatra pairs', () => {
    const seen = new Set<number>();
    for (const a of NAKSHATRAS) {
      for (const b of NAKSHATRAS) seen.add(calculateYoni(a.yoni, b.yoni).score);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('returns a flagged result rather than a silent 0 for an unknown animal', () => {
    const result = calculateYoni('horse', 'griffin');
    expect(result.explanationCode).toBe('YONI-UNKNOWN');
  });
});

describe('Tara Koota', () => {
  // Tara is counted both ways; each favourable direction is worth 1.5.
  const favourable = (from: number, to: number) =>
    [2, 4, 6, 8, 9].includes(((to - from + 27) % 27) % 9 + 1);

  function findPair(wanted: 0 | 1 | 2) {
    for (let a = 0; a < 27; a++) {
      for (let b = 0; b < 27; b++) {
        const sides = Number(favourable(a, b)) + Number(favourable(b, a));
        if (sides === wanted) return [a, b] as const;
      }
    }
    throw new Error(`no pair with ${wanted} favourable side(s)`);
  }

  it('awards 3 when both sides are favourable', () => {
    const [a, b] = findPair(2);
    expect(calculateTaraKoota(a, b).score).toBe(3);
  });

  /** The rounding this replaces turned 1.5 into 2 on 67% of all pairs. */
  it('awards exactly 1.5 when only one side is favourable', () => {
    const [a, b] = findPair(1);
    expect(calculateTaraKoota(a, b).score).toBe(1.5);
  });

  it('awards 0 when neither side is favourable', () => {
    const [a, b] = findPair(0);
    expect(calculateTaraKoota(a, b).score).toBe(0);
  });

  it('never exceeds its maximum', () => {
    for (let a = 0; a < 27; a++) {
      for (let b = 0; b < 27; b++) {
        const { score } = calculateTaraKoota(a, b);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(3);
      }
    }
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
