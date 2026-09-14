import type { BirthDetails } from './birth.js';

export interface LagnaData {
  sign: string;
  signIndex: number;
  degree?: number;
  lord?: string;
}

export interface RashiData {
  name: string;
  index: number;
  lord: string;
}

export interface NakshatraData {
  name: string;
  index: number;
  pada?: number;
  lord?: string;
}

export interface PlanetData {
  planet: string;
  longitude?: number | null;
  latitude?: number | null;
  sign: string;
  signIndex: number;
  house?: number | null;
  degree?: number | null;
  nakshatra?: string | null;
  nakshatraPada?: number | null;
  retrograde?: boolean;
  combust?: boolean;
  dignity?: string | null;
}

export interface HouseData {
  house: number;
  sign?: string;
  signIndex?: number;
  degreeStart?: number;
  degreeEnd?: number;
  lord?: string;
  planets?: string[];
}

export interface DashaPeriod {
  planet: string;
  startDate: string;
  endDate: string;
}

export interface DashaData {
  system?: string;
  current?: {
    mahadasha?: string;
    antardasha?: string;
    startDate?: string;
    endDate?: string;
  };
  periods?: DashaPeriod[];
}

export interface DivisionalChartData {
  [chartName: string]: unknown;
}

export interface DoshaData {
  manglik?: boolean;
  kaalSarp?: boolean;
  [key: string]: unknown;
}

export interface Kundli {
  id: string;

  provider: 'navamsha';
  providerVersion?: string;

  methodology: {
    system: 'vedic';
    ayanamsha: 'lahiri';
    houseSystem?: string;
  };

  birthDetails: {
    dateOfBirth: string;
    timeOfBirth: string;
    placeOfBirth: string;
    latitude: number;
    longitude: number;
    timezone: string;
    birthTimeAccuracy?: string;
  };

  birthDataHash: string;
  gotra?: string;

  lagna: LagnaData;
  rashi: RashiData;
  nakshatra: NakshatraData;
  planets: PlanetData[];
  houses: HouseData[];

  dashas?: DashaData;
  divisionalCharts?: DivisionalChartData;
  doshas?: DoshaData;

  rawProviderData?: unknown;

  createdAt: string;
  updatedAt: string;
}

export interface StoredKundli extends Kundli {
  dbId?: string;
  birthProfileId?: string;
}

// Helper to find a planet in a kundli by name
export function getPlanet(kundli: Kundli, name: string): PlanetData | undefined {
  return kundli.planets.find(
    (p) => p.planet.toLowerCase() === name.toLowerCase(),
  );
}

// Helper to get house data
export function getHouse(kundli: Kundli, num: number): HouseData | undefined {
  return kundli.houses.find((h) => h.house === num);
}

// Helper: get all planets in a specific house
export function getPlanetsInHouse(kundli: Kundli, house: number): PlanetData[] {
  return kundli.planets.filter((p) => p.house === house);
}
