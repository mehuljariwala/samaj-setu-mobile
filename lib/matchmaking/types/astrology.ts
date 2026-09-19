import type { Kundli } from './kundli';

export interface AstrologyProvider {
  getKundli(birthDetails: import('./birth').BirthDetails & { gotra?: string }): Promise<Kundli>;
  getCompatibility?(personA: Kundli, personB: Kundli): Promise<ProviderCompatibility>;
}

export interface ProviderCompatibility {
  gunaMilan?: {
    score: number;
    maximumScore: number;
  };
  manglik?: {
    personA: boolean;
    personB: boolean;
  };
  raw?: unknown;
}

export interface ProviderCrossCheck {
  providerScore?: number;
  internalScore?: number;
  difference?: number;
  status: 'matched' | 'minor_difference' | 'major_difference' | 'not_available';
}
