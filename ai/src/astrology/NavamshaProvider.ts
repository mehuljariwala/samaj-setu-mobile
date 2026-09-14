import type { AstrologyProvider } from '../types/astrology.js';
import type { BirthDetails } from '../types/birth.js';
import type { Kundli } from '../types/kundli.js';
import { getBasicKundli, getExtendedKundli } from './navamshaClient.js';
import { normalizeKundli } from './kundliNormalizer.js';
import { generateBirthDataHash } from '../utils/hashing.js';

export class NavamshaProvider implements AstrologyProvider {
  async getKundli(birth: BirthDetails & { gotra?: string }): Promise<Kundli> {
    const hash = generateBirthDataHash(birth);

    // Try extended first, fall back to basic
    let raw: unknown;
    try {
      raw = await getExtendedKundli(birth);
    } catch {
      raw = await getBasicKundli(birth);
    }

    return normalizeKundli(
      raw,
      {
        dateOfBirth: birth.dateOfBirth,
        timeOfBirth: birth.timeOfBirth,
        placeOfBirth: birth.placeOfBirth,
        latitude: birth.latitude,
        longitude: birth.longitude,
        timezone: birth.timezone,
        birthTimeAccuracy: birth.birthTimeAccuracy,
      },
      hash,
      birth.gotra,
    );
  }
}
