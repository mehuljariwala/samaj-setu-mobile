import type { KootaResult } from '../../types/compatibility';

// Nadi Koota — max 8 points per spec §25
// Same Nadi = Nadi Dosha (0 points) — highest weight koota
// Different Nadi = 8 points
export function calculateNadi(boyNadi: string, girlNadi: string): KootaResult {
  const same = boyNadi === girlNadi;
  const score = same ? 0 : 8;

  return {
    score,
    maximumScore: 8,
    status: same ? 'strong_caution' : 'favorable',
    personAValue: boyNadi,
    personBValue: girlNadi,
    explanationCode: 'NADI-001',
    evidence: [
      `Boy Nadi: ${boyNadi}`,
      `Girl Nadi: ${girlNadi}`,
      same
        ? 'Nadi Dosha — same Nadi is traditionally considered a strong concern.'
        : 'Different Nadi — maximum Nadi score. Auspicious.',
    ],
  };
}
