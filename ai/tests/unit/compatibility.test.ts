import { describe, it, expect } from 'vitest';
import { calculateGotraCompatibility } from '../../src/matching/gotra.js';
import { calculateManglik } from '../../src/matching/manglik.js';
import { calculateRashiCompatibility } from '../../src/matching/rashi.js';
import { RASHIS } from '../../src/constants/rashis.js';
import { NAKSHATRAS } from '../../src/constants/nakshatras.js';

function baseKundli(rashiIndex: number, marsHouse?: number) {
  const rashi = RASHIS[rashiIndex]!;
  const nak = NAKSHATRAS[0]!;
  return {
    id: 'test',
    provider: 'navamsha' as const,
    methodology: { system: 'vedic' as const, ayanamsha: 'lahiri' as const },
    birthDetails: { dateOfBirth: '1990-01-01', timeOfBirth: '10:00:00', placeOfBirth: 'Test', latitude: 19.0, longitude: 73.0, timezone: 'Asia/Kolkata' },
    birthDataHash: 'test',
    lagna: { sign: 'Aries', signIndex: 0 },
    rashi: { name: rashi.name, index: rashiIndex, lord: rashi.lord },
    nakshatra: { name: nak.name, index: 0 },
    planets: marsHouse != null ? [{ planet: 'Mars', sign: 'Aries', signIndex: 0, house: marsHouse }] : [],
    houses: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('Gotra Compatibility', () => {
  it('returns unknown status when gotra not provided', () => {
    const result = calculateGotraCompatibility(undefined, undefined);
    expect(result.status).toBe('unknown');
    expect(result.score).toBeNull();
    expect(result.gotraData.status).toBe('unknown');
  });

  it('returns caution for same gotra', () => {
    const result = calculateGotraCompatibility('Kashyap', 'Kashyap');
    expect(result.status).toBe('caution');
    expect(result.score).toBe(0);
    expect(result.gotraData.status).toBe('same');
  });

  it('returns favorable for different gotra', () => {
    const result = calculateGotraCompatibility('Kashyap', 'Bharadwaj');
    expect(result.status).toBe('favorable');
    expect(result.score).toBe(100);
    expect(result.gotraData.status).toBe('different');
  });

  it('never infers gotra from birth data', () => {
    // If no gotra provided, always returns unknown — never fabricates
    const result = calculateGotraCompatibility(undefined, 'Kashyap');
    expect(result.status).toBe('unknown');
  });
});

describe('Manglik Detection', () => {
  it('marks Manglik when Mars is in house 7', () => {
    const a = baseKundli(0, 7);
    const b = baseKundli(1);
    const result = calculateManglik(a as never, b as never);
    expect(result.personA.isManglik).toBe(true);
    expect(result.compatibilityStatus).toBe('caution');
  });

  it('marks compatible when both are Manglik', () => {
    const a = baseKundli(0, 7);
    const b = baseKundli(1, 8);
    const result = calculateManglik(a as never, b as never);
    expect(result.personA.isManglik).toBe(true);
    expect(result.personB.isManglik).toBe(true);
    expect(result.compatibilityStatus).toBe('compatible');
    expect(result.cancellationFactors.length).toBeGreaterThan(0);
  });

  it('marks non-Manglik when Mars is in house 3', () => {
    const a = baseKundli(0, 3);
    const result = calculateManglik(a as never, baseKundli(1) as never);
    expect(result.personA.isManglik).toBe(false);
    expect(result.compatibilityStatus).toBe('compatible');
  });

  it('handles missing Mars data gracefully', () => {
    const a = baseKundli(0); // no Mars planet
    const b = baseKundli(1);
    const result = calculateManglik(a as never, b as never);
    // Should not throw
    expect(result.personA.isManglik).toBe(false);
  });
});

describe('Rashi Compatibility', () => {
  it('returns a score between 0 and 100', () => {
    const a = baseKundli(0);
    const b = baseKundli(4);
    const result = calculateRashiCompatibility(a as never, b as never);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score ?? 0).toBeLessThanOrEqual(100);
  });

  it('includes evidence array', () => {
    const a = baseKundli(0);
    const b = baseKundli(5);
    const result = calculateRashiCompatibility(a as never, b as never);
    expect(Array.isArray(result.evidence)).toBe(true);
    expect(result.evidence.length).toBeGreaterThan(0);
  });
});
