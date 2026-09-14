import type { BirthDetails } from '../types/birth.js';
import type { Kundli } from '../types/kundli.js';
import { NavamshaProvider } from '../astrology/NavamshaProvider.js';
import { getCachedKundli, setCachedKundli, makeBirthHash } from '../astrology/kundliCache.js';
import { kundliRepository } from '../database/client.js';
import { logger } from '../utils/logger.js';
import { getEnv } from '../config/env.js';

const provider = new NavamshaProvider();

/**
 * Kundli Pipeline: validate → hash → cache check → Navamsha → normalize → cache → persist → return
 * Per spec §52, §107
 */
export async function runKundliPipeline(
  birth: BirthDetails & { gotra?: string },
  options: { forceRefresh?: boolean } = {},
): Promise<Kundli> {
  const env = getEnv();
  const hash = makeBirthHash(birth);

  // 1. In-memory cache check
  if (!options.forceRefresh) {
    const cached = getCachedKundli(hash);
    if (cached) {
      logger.debug('Kundli from in-memory cache', { hash });
      return cached;
    }

    // 2. Database check
    if (env.ENABLE_DATABASE) {
      const stored = await kundliRepository.findByHash(hash);
      if (stored) {
        setCachedKundli(stored);
        logger.debug('Kundli from database', { hash });
        return stored;
      }
    }
  }

  // 3. Fetch from Navamsha
  logger.info('Fetching Kundli from Navamsha', { hash });
  const kundli = await provider.getKundli({ ...birth, gotra: birth.gotra });

  // 4. Cache and persist
  setCachedKundli(kundli);
  if (env.ENABLE_DATABASE) {
    await kundliRepository.save(kundli);
  }

  logger.info('Kundli pipeline complete', { id: kundli.id, hash });
  return kundli;
}
