/**
 * Clamp a value to a range.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalise a score from an arbitrary range to 0–100.
 */
export function normalizeScore(score: number, max: number): number {
  if (max <= 0) return 0;
  return clamp(Math.round((score / max) * 100), 0, 100);
}

/**
 * Round to a given number of decimal places.
 */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Calculate a weighted average, skipping null/undefined scores.
 * Returns null if no valid scores exist.
 */
export function weightedAverage(
  items: Array<{ score: number | null | undefined; weight: number }>
): number | null {
  let totalWeight = 0;
  let totalScore = 0;

  for (const item of items) {
    if (item.score == null) continue;
    totalScore += item.score * item.weight;
    totalWeight += item.weight;
  }

  if (totalWeight === 0) return null;
  return clamp(Math.round(totalScore / totalWeight), 0, 100);
}
