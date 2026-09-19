import { getEnv } from '@/lib/matchmaking/config';
import { logger } from '../utils/logger';
import { AppError, ErrorCodes } from '../types/api';
import type { BirthDetails } from '../types/birth';

// ---------------------------------------------------------------------------
// StandardBirthRequest shape — per api.navamsha.in/openapi.json
// ---------------------------------------------------------------------------
interface NavamshaBirthRequest {
  year: number;
  month: number;
  date: number;
  hours: number;
  minutes: number;
  seconds: number;
  latitude: number;
  longitude: number;
  timezone: number;  // float UTC offset, e.g. 5.5 for IST
}

// StandardCompatibilityRequest shape (bride / groom)
interface NavamshaCompatibilityRequest {
  bride: NavamshaBirthRequest;
  groom: NavamshaBirthRequest;
}

// ---------------------------------------------------------------------------
// IANA timezone → numeric UTC offset
// ---------------------------------------------------------------------------
function ianaToOffsetHours(tz: string): number {
  try {
    // Use Intl to find the current offset for the timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(now);
    const offsetStr = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    // offsetStr is like "GMT+5:30", "GMT-4", "GMT+0"
    const match = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 5.5; // fallback IST
    const sign = match[1] === '+' ? 1 : -1;
    const hrs = parseInt(match[2], 10);
    const mins = parseInt(match[3] ?? '0', 10);
    return sign * (hrs + mins / 60);
  } catch {
    return 5.5; // fallback IST
  }
}

// ---------------------------------------------------------------------------
// Convert BirthDetails → NavamshaBirthRequest
// ---------------------------------------------------------------------------
function toBirthRequest(birth: BirthDetails): NavamshaBirthRequest {
  const [yearStr, monthStr, dayStr] = birth.dateOfBirth.split('-');
  const timeParts = birth.timeOfBirth.split(':');
  const hours = parseInt(timeParts[0] ?? '0', 10);
  const minutes = parseInt(timeParts[1] ?? '0', 10);
  const seconds = parseInt(timeParts[2] ?? '0', 10);

  return {
    year: parseInt(yearStr!, 10),
    month: parseInt(monthStr!, 10),
    date: parseInt(dayStr!, 10),
    hours,
    minutes,
    seconds,
    latitude: birth.latitude,
    longitude: birth.longitude,
    timezone: ianaToOffsetHours(birth.timezone),
  };
}

// ---------------------------------------------------------------------------
// Core POST helper
// ---------------------------------------------------------------------------
async function navamshaPost<T>(
  path: string,
  body: unknown,
  retries?: number,
): Promise<T> {
  const env = getEnv();
  const maxRetries = retries ?? env.ASTROLOGY_MAX_RETRIES;
  const baseUrl = env.NAVAMSHA_BASE_URL;
  const apiKey = env.NAVAMSHA_API_KEY;

  if (!apiKey) {
    throw new AppError(
      ErrorCodes.KUNDLI_CALCULATION_FAILED,
      500,
      'Navamsha API key is not configured. Set NAVAMSHA_API_KEY in .env',
    );
  }

  const url = `${baseUrl}${path}`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.NAVAMSHA_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        throw new AppError(
          ErrorCodes.KUNDLI_PROVIDER_RATE_LIMIT,
          429,
          'Navamsha API rate limit reached.',
        );
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new AppError(
          ErrorCodes.KUNDLI_CALCULATION_FAILED,
          502,
          `Navamsha API error: ${response.status} ${response.statusText}`,
          { body: text.slice(0, 500) },
        );
      }

      const data = await response.json() as T;
      return data;

    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof AppError) throw err;

      if ((err as Error).name === 'AbortError') {
        lastError = new AppError(ErrorCodes.KUNDLI_PROVIDER_TIMEOUT, 504, 'Navamsha API timed out.');
      } else {
        lastError = err;
      }

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * 2 ** attempt, 5000);
        logger.warn('Navamsha request failed, retrying', { attempt, delay, path });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  if (lastError instanceof AppError) throw lastError;
  throw new AppError(ErrorCodes.KUNDLI_CALCULATION_FAILED, 502, 'Navamsha API unavailable after retries.');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** POST /api/v1/kundali/basic — Lagna, planets, nakshatra, rashi */
export async function getBasicKundli(birth: BirthDetails): Promise<unknown> {
  return navamshaPost('/api/v1/kundali/basic', toBirthRequest(birth));
}

/** POST /api/v1/planets/extended — Extended planet positions */
export async function getExtendedKundli(birth: BirthDetails): Promise<unknown> {
  return navamshaPost('/api/v1/planets/extended', toBirthRequest(birth));
}

/** POST /api/v1/dasha/vimshottari — Vimshottari Dasha periods */
export async function getDasha(birth: BirthDetails): Promise<unknown> {
  return navamshaPost('/api/v1/dasha/vimshottari', toBirthRequest(birth));
}

/** POST /api/v1/dosha/mangal — Mangal Dosha check */
export async function getMangalDosha(birth: BirthDetails): Promise<unknown> {
  return navamshaPost('/api/v1/dosha/mangal', toBirthRequest(birth));
}

/**
 * POST /api/v1/compatibility/ashtakoot — 36-point Gun Milan
 * personA = bride (female), personB = groom (male)
 */
export async function getAshtakoot(birthA: BirthDetails, birthB: BirthDetails): Promise<unknown> {
  const body: NavamshaCompatibilityRequest = {
    bride: toBirthRequest(birthA),
    groom: toBirthRequest(birthB),
  };
  return navamshaPost('/api/v1/compatibility/ashtakoot', body);
}
