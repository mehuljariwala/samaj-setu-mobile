import { getEnv } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError, ErrorCodes } from '../types/api.js';
import type { BirthDetails } from '../types/birth.js';

type RequestMethod = 'GET' | 'POST';

interface NavamshaRequestParams {
  dob: string;    // YYYY-MM-DD
  tob: string;    // HH:mm:ss
  lat: number;
  lon: number;
  tz: string;     // IANA timezone
}

async function navamshaRequest<T>(
  path: string,
  params: NavamshaRequestParams,
  method: RequestMethod = 'GET',
  retries?: number,
): Promise<T> {
  const env = getEnv();
  const maxRetries = retries ?? env.ASTROLOGY_MAX_RETRIES;
  const baseUrl = env.NAVAMSHA_BASE_URL;
  const apiKey = env.NAVAMSHA_API_KEY;

  if (!apiKey) {
    throw new AppError(ErrorCodes.KUNDLI_CALCULATION_FAILED, 500,
      'Navamsha API key is not configured. Set NAVAMSHA_API_KEY in .env');
  }

  const url = new URL(`${baseUrl}${path}`);

  // Navamsha uses query params per their docs
  url.searchParams.set('dob', params.dob);
  url.searchParams.set('tob', params.tob);
  url.searchParams.set('lat', String(params.lat));
  url.searchParams.set('lon', String(params.lon));
  url.searchParams.set('tz', params.tz);

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.NAVAMSHA_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        throw new AppError(ErrorCodes.KUNDLI_PROVIDER_RATE_LIMIT, 429,
          'Navamsha API rate limit reached.');
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new AppError(ErrorCodes.KUNDLI_CALCULATION_FAILED, 502,
          `Navamsha API error: ${response.status} ${response.statusText}`,
          { body: body.slice(0, 500) });
      }

      const data = await response.json() as T;
      return data;

    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof AppError) throw err;

      if ((err as Error).name === 'AbortError') {
        lastError = new AppError(ErrorCodes.KUNDLI_PROVIDER_TIMEOUT, 504,
          'Navamsha API timed out.');
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
  throw new AppError(ErrorCodes.KUNDLI_CALCULATION_FAILED, 502,
    'Navamsha API unavailable after retries.');
}

function toNavamshaParams(birth: BirthDetails): NavamshaRequestParams {
  // Ensure HH:mm:ss format
  const tob = birth.timeOfBirth.includes(':')
    ? birth.timeOfBirth.split(':').length === 2
      ? `${birth.timeOfBirth}:00`
      : birth.timeOfBirth
    : `${birth.timeOfBirth}:00:00`;

  return {
    dob: birth.dateOfBirth,
    tob,
    lat: birth.latitude,
    lon: birth.longitude,
    tz: birth.timezone,
  };
}

/** GET /api/v1/kundali/basic — basic chart with planets, lagna, rashi, nakshatra */
export async function getBasicKundli(birth: BirthDetails): Promise<unknown> {
  return navamshaRequest('/api/v1/kundali/basic', toNavamshaParams(birth));
}

/** GET /api/v1/planets/extended — extended planet data with houses */
export async function getExtendedKundli(birth: BirthDetails): Promise<unknown> {
  return navamshaRequest('/api/v1/planets/extended', toNavamshaParams(birth));
}

/** GET /api/v1/dasha/vimshottari — Vimshottari Dasha periods */
export async function getDasha(birth: BirthDetails): Promise<unknown> {
  return navamshaRequest('/api/v1/dasha/vimshottari', toNavamshaParams(birth));
}

/** POST /api/v1/matchmaking/ashtakoot — provider Ashtakoot Gun Milan */
export async function getAshtakoot(birthA: BirthDetails, birthB: BirthDetails): Promise<unknown> {
  const env = getEnv();
  const apiKey = env.NAVAMSHA_API_KEY;

  if (!apiKey) {
    throw new AppError(ErrorCodes.KUNDLI_CALCULATION_FAILED, 500, 'Navamsha API key not configured.');
  }

  const paramsA = toNavamshaParams(birthA);
  const paramsB = toNavamshaParams(birthB);

  const url = `${env.NAVAMSHA_BASE_URL}/api/v1/matchmaking/ashtakoot`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), env.NAVAMSHA_TIMEOUT_MS);

  try {
    const body = {
      boy: { dob: paramsA.dob, tob: paramsA.tob, lat: paramsA.lat, lon: paramsA.lon, tz: paramsA.tz },
      girl: { dob: paramsB.dob, tob: paramsB.tob, lat: paramsB.lat, lon: paramsB.lon, tz: paramsB.tz },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new AppError(ErrorCodes.KUNDLI_CALCULATION_FAILED, 502,
        `Navamsha Ashtakoot error: ${response.status}`, { body: text.slice(0, 500) });
    }
    return response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof AppError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new AppError(ErrorCodes.KUNDLI_PROVIDER_TIMEOUT, 504, 'Navamsha Ashtakoot timed out.');
    }
    throw new AppError(ErrorCodes.KUNDLI_CALCULATION_FAILED, 502, 'Navamsha Ashtakoot unavailable.');
  }
}
