import type { Kundli } from '../types/kundli';
import { generateBirthDataHash } from '../utils/hashing';
import { logger } from '../utils/logger';

interface CacheEntry {
  kundli: Kundli;
  cachedAt: number;
}

// In-memory cache keyed by birth-data hash per spec §21
const cache = new Map<string, CacheEntry>();
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function getCachedKundli(birthDataHash: string): Kundli | null {
  const entry = cache.get(birthDataHash);
  if (!entry) return null;

  if (Date.now() - entry.cachedAt > TTL_MS) {
    cache.delete(birthDataHash);
    return null;
  }

  logger.debug('Kundli cache hit', { birthDataHash });
  return entry.kundli;
}

export function setCachedKundli(kundli: Kundli): void {
  cache.set(kundli.birthDataHash, { kundli, cachedAt: Date.now() });
  logger.debug('Kundli cached', { birthDataHash: kundli.birthDataHash });
}

export function makeBirthHash(birth: {
  dateOfBirth: string;
  timeOfBirth: string;
  latitude: number;
  longitude: number;
  timezone: string;
}): string {
  return generateBirthDataHash(birth);
}
