import type { ManglikResult } from '../types/compatibility.js';
import type { Kundli } from '../types/kundli.js';
import { getPlanet } from '../types/kundli.js';
import { MANGLIK_HOUSES } from '../constants/planets.js';

// Manglik determination — spec §32, MANGALIK-001
// Mars in 1, 2, 4, 7, 8, or 12 = Manglik
// Respects provider data if available; falls back to internal calculation
function checkManglik(kundli: Kundli): { isManglik: boolean; source: 'navamsha' | 'internal'; details: string[] } {
  // 1. Use provider data if available
  if (typeof kundli.doshas?.manglik === 'boolean') {
    return { isManglik: kundli.doshas.manglik, source: 'navamsha', details: ['Based on Navamsha API calculation.'] };
  }

  // 2. Internal calculation
  const mars = getPlanet(kundli, 'Mars');
  if (!mars || mars.house == null) {
    return { isManglik: false, source: 'internal', details: ['Mars house data unavailable — cannot determine Manglik status.'] };
  }

  const isManglik = MANGLIK_HOUSES.includes(mars.house);
  return {
    isManglik,
    source: 'internal',
    details: [
      `Mars is in house ${mars.house}`,
      isManglik
        ? `House ${mars.house} is a Manglik house (1,2,4,7,8,12).`
        : `House ${mars.house} is not a Manglik house.`,
    ],
  };
}

export function calculateManglik(personA: Kundli, personB: Kundli): ManglikResult {
  const a = checkManglik(personA);
  const b = checkManglik(personB);

  let compatibilityStatus: ManglikResult['compatibilityStatus'] = 'compatible';
  const cancellationFactors: string[] = [];

  if (a.isManglik && b.isManglik) {
    compatibilityStatus = 'compatible';
    cancellationFactors.push('Both persons are Manglik — traditionally considered mutually cancelling.');
  } else if (a.isManglik || b.isManglik) {
    compatibilityStatus = 'caution';
  }

  return {
    personA: a,
    personB: b,
    compatibilityStatus,
    cancellationFactors,
    explanation:
      a.isManglik && b.isManglik
        ? 'Both partners are Manglik — many traditions consider this compatible.'
        : a.isManglik || b.isManglik
        ? 'One partner is Manglik — traditionally recommended to consult an astrologer for remedies.'
        : 'Neither partner is Manglik — traditional astrology considers this auspicious.',
  };
}
