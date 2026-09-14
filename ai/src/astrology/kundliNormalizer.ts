import { v4 as uuidv4 } from 'uuid';
import type { Kundli, PlanetData, HouseData, LagnaData, RashiData, NakshatraData } from '../types/kundli.js';
import { getRashiByName, getRashiByIndex } from '../constants/rashis.js';
import { getNakshatraByName } from '../constants/nakshatras.js';

/**
 * Normalizes the raw Navamsha API response into the canonical internal Kundli schema.
 * Preserves raw provider data internally. Never invents missing values.
 * Per spec §20.
 */
export function normalizeKundli(
  providerData: unknown,
  birthDetails: {
    dateOfBirth: string;
    timeOfBirth: string;
    placeOfBirth: string;
    latitude: number;
    longitude: number;
    timezone: string;
    birthTimeAccuracy?: string;
  },
  birthDataHash: string,
  gotra?: string,
): Kundli {
  const raw = providerData as Record<string, unknown>;
  const now = new Date().toISOString();

  // ---- Lagna ----
  const lagnaRaw = (raw['lagna'] ?? raw['ascendant'] ?? raw['Lagna']) as Record<string, unknown> | undefined;
  const lagnaSign = String(lagnaRaw?.['sign'] ?? lagnaRaw?.['rashi'] ?? '');
  const lagnaSignIndex = lagnaRaw?.['sign_index'] != null
    ? Number(lagnaRaw['sign_index'])
    : (getRashiByName(lagnaSign)?.index ?? 0);

  const lagna: LagnaData = {
    sign: lagnaSign,
    signIndex: lagnaSignIndex,
    degree: lagnaRaw?.['degree'] != null ? Number(lagnaRaw['degree']) : undefined,
    lord: lagnaRaw?.['lord'] ? String(lagnaRaw['lord']) : getRashiByIndex(lagnaSignIndex)?.lord,
  };

  // ---- Moon Rashi ----
  const moonRaw = findPlanetRaw(raw, 'Moon');
  const moonSign = String(moonRaw?.['sign'] ?? moonRaw?.['rashi'] ?? '');
  const moonSignIndex = moonRaw?.['sign_index'] != null
    ? Number(moonRaw['sign_index'])
    : (getRashiByName(moonSign)?.index ?? 0);
  const rashiLord = getRashiByIndex(moonSignIndex)?.lord ?? '';

  const rashi: RashiData = {
    name: moonSign,
    index: moonSignIndex,
    lord: rashiLord,
  };

  // ---- Nakshatra ----
  const nakshatraRaw = (raw['nakshatra'] ?? raw['moon_nakshatra'] ?? raw['Nakshatra']) as Record<string, unknown> | undefined;
  const nakshatraName = String(nakshatraRaw?.['name'] ?? moonRaw?.['nakshatra'] ?? '');
  const nakshatraIndex = nakshatraRaw?.['index'] != null
    ? Number(nakshatraRaw['index'])
    : (getNakshatraByName(nakshatraName)?.index ?? 0);

  const nakshatra: NakshatraData = {
    name: nakshatraName,
    index: nakshatraIndex,
    pada: nakshatraRaw?.['pada'] != null ? Number(nakshatraRaw['pada']) : undefined,
    lord: nakshatraRaw?.['lord'] ? String(nakshatraRaw['lord']) : undefined,
  };

  // ---- Planets ----
  const planetsRaw = (raw['planets'] ?? raw['planet_positions'] ?? []) as Record<string, unknown>[];
  const planets: PlanetData[] = Array.isArray(planetsRaw)
    ? planetsRaw.map(normalizePlanet)
    : normalizePlanetsFromObject(raw);

  // ---- Houses ----
  const housesRaw = (raw['houses'] ?? raw['house_cusps'] ?? []) as Record<string, unknown>[];
  const houses: HouseData[] = Array.isArray(housesRaw)
    ? housesRaw.map(normalizeHouse)
    : [];

  return {
    id: uuidv4(),
    provider: 'navamsha',
    providerVersion: raw['version'] ? String(raw['version']) : undefined,
    methodology: {
      system: 'vedic',
      ayanamsha: 'lahiri',
      houseSystem: raw['house_system'] ? String(raw['house_system']) : 'equal',
    },
    birthDetails,
    birthDataHash,
    gotra,
    lagna,
    rashi,
    nakshatra,
    planets,
    houses,
    dashas: raw['dasha'] ? normalizeDasha(raw['dasha'] as Record<string, unknown>) : undefined,
    doshas: raw['doshas'] ? (raw['doshas'] as Record<string, unknown>) : undefined,
    rawProviderData: providerData,
    createdAt: now,
    updatedAt: now,
  };
}

function findPlanetRaw(raw: Record<string, unknown>, name: string): Record<string, unknown> | undefined {
  const planets = raw['planets'] ?? raw['planet_positions'];
  if (Array.isArray(planets)) {
    return planets.find((p: Record<string, unknown>) =>
      String(p['planet'] ?? p['name'] ?? '').toLowerCase() === name.toLowerCase(),
    ) as Record<string, unknown> | undefined;
  }
  // Some providers return planets as an object keyed by name
  const obj = planets as Record<string, unknown>;
  return obj?.[name.toLowerCase()] as Record<string, unknown> | undefined
    ?? obj?.[name] as Record<string, unknown> | undefined;
}

function normalizePlanet(p: Record<string, unknown>): PlanetData {
  const sign = String(p['sign'] ?? p['rashi'] ?? '');
  const signIndex = p['sign_index'] != null
    ? Number(p['sign_index'])
    : (getRashiByName(sign)?.index ?? 0);
  return {
    planet: String(p['planet'] ?? p['name'] ?? ''),
    longitude: p['longitude'] != null ? Number(p['longitude']) : null,
    latitude: p['latitude'] != null ? Number(p['latitude']) : null,
    sign,
    signIndex,
    house: p['house'] != null ? Number(p['house']) : null,
    degree: p['degree'] != null ? Number(p['degree']) : null,
    nakshatra: p['nakshatra'] ? String(p['nakshatra']) : null,
    nakshatraPada: p['nakshatra_pada'] != null ? Number(p['nakshatra_pada']) : null,
    retrograde: p['retrograde'] === true || p['is_retrograde'] === true,
    combust: p['combust'] === true || p['is_combust'] === true,
    dignity: p['dignity'] ? String(p['dignity']) : null,
  };
}

function normalizePlanetsFromObject(raw: Record<string, unknown>): PlanetData[] {
  const names = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
  return names.flatMap((name) => {
    const p = raw[name.toLowerCase()] ?? raw[name];
    if (p && typeof p === 'object') {
      return [normalizePlanet({ planet: name, ...(p as Record<string, unknown>) })];
    }
    return [];
  });
}

function normalizeHouse(h: Record<string, unknown>): HouseData {
  const sign = h['sign'] ? String(h['sign']) : undefined;
  return {
    house: Number(h['house'] ?? h['number'] ?? 0),
    sign,
    signIndex: h['sign_index'] != null ? Number(h['sign_index'])
      : sign ? getRashiByName(sign)?.index : undefined,
    degreeStart: h['degree_start'] != null ? Number(h['degree_start']) : undefined,
    degreeEnd: h['degree_end'] != null ? Number(h['degree_end']) : undefined,
    lord: h['lord'] ? String(h['lord']) : sign ? getRashiByName(sign)?.lord : undefined,
    planets: Array.isArray(h['planets']) ? h['planets'].map(String) : undefined,
  };
}

function normalizeDasha(d: Record<string, unknown>) {
  return {
    system: d['system'] ? String(d['system']) : 'vimshottari',
    current: d['current'] ? {
      mahadasha: (d['current'] as Record<string, unknown>)['mahadasha'] ? String((d['current'] as Record<string, unknown>)['mahadasha']) : undefined,
      antardasha: (d['current'] as Record<string, unknown>)['antardasha'] ? String((d['current'] as Record<string, unknown>)['antardasha']) : undefined,
      startDate: (d['current'] as Record<string, unknown>)['start_date'] ? String((d['current'] as Record<string, unknown>)['start_date']) : undefined,
      endDate: (d['current'] as Record<string, unknown>)['end_date'] ? String((d['current'] as Record<string, unknown>)['end_date']) : undefined,
    } : undefined,
  };
}
