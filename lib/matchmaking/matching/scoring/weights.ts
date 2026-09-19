// Configurable weights per spec §40-43 — must sum to 100
// ALGORITHM_VERSION: 1.0.0
export const WEIGHTS = {
  gunaMilan:     25, // 25% — traditional Ashtakoot (highest)
  rashi:         10, // 10%
  nakshatra:      8, // 8%
  gana:           5, // 5%
  emotional:     10, // 10%
  communication:  7, // 7%
  family:         8, // 8%
  lifestyle:      7, // 7%
  financial:      5, // 5% — astrological interpretation only
  career:         5, // 5%
  longTerm:      10, // 10%
  // gotra and manglik are qualitative, not weighted into score
} as const;

// Verify sum = 100
const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (total !== 100) {
  throw new Error(`Weights must sum to 100, got ${total}`);
}
