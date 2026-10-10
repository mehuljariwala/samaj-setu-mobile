/**
 * Storage paths and buckets. Universal rather than server-only: the browser
 * builds the path when it uploads, and the server checks it when it records the
 * object, so both need the same rule.
 *
 * The first path segment is always the candidate id. That is how the storage
 * policies decide ownership without a table lookup — see
 * supabase/migrations/20260914001700_storage.sql.
 */
export const BUCKETS = {
  certificates: 'certificates',
  photo: 'candidate-photos',
  kundali: 'kundali',
} as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const CERTIFICATE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function objectPath(candidateId: string, filename: string): string {
  const extension = filename.includes('.')
    ? filename.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '')
    : 'bin';
  return `${candidateId}/${crypto.randomUUID()}.${extension || 'bin'}`;
}

/**
 * The card-sized copy of a photo, stored beside it in the same folder, so the
 * same storage policies cover it and it needs no row of its own. Discover shows
 * this; a photo without one (an older upload) falls back to the photo itself.
 */
export function thumbnailPath(photoPath: string): string {
  return `${photoPath.replace(/\.[a-z0-9]*$/, '')}.thumb.jpg`;
}
