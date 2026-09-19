import { createHash } from 'node:crypto';

/**
 * Generates a deterministic SHA-256 hash from birth details + methodology.
 * Same input always produces the same hash (spec §21).
 */
export function generateBirthDataHash(params: {
  dateOfBirth: string;
  timeOfBirth: string;
  latitude: number;
  longitude: number;
  timezone: string;
  methodology?: string;
}): string {
  const canonical = [
    params.dateOfBirth,
    params.timeOfBirth,
    params.latitude.toFixed(4),
    params.longitude.toFixed(4),
    params.timezone,
    params.methodology ?? 'vedic-lahiri',
  ].join('|');

  return createHash('sha256').update(canonical).digest('hex');
}
