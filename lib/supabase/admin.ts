import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';

import { BUCKETS, thumbnailPath } from '@/lib/storage';
import type { Database } from './database.types';
import { SUPABASE_URL } from './env';

/**
 * The service-role client. It bypasses row level security completely.
 *
 * Used for exactly three things, all of which are impossible with a member's
 * session:
 *
 *   * minting short-lived signed URLs for private storage objects, after the
 *     database has already confirmed the caller may see them;
 *   * recording a failed sign-in, which by definition has no session
 *     (`record_failed_sign_in`, callable by the service role alone);
 *   * scheduled maintenance that runs with no user at all.
 *
 * It must never be used to serve a request on a member's behalf. If a read
 * needs the service role to succeed, the policy is wrong — fix the policy.
 */
let cached: SupabaseClient<Database> | null = null;

export function createSupabaseAdminClient() {
  const secret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!SUPABASE_URL || !secret) {
    throw new Error(
      'The service-role client needs SUPABASE_URL and SUPABASE_SECRET_KEY. ' +
        'Never expose either to the browser.',
    );
  }

  cached ??= createClient<Database>(SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}

/**
 * Short-lived link to a private object. Sixty seconds is enough to render an
 * image and short enough that a leaked URL is close to worthless — which
 * matters because, as spec §8 notes, revocation cannot recall what was already
 * fetched.
 */
export async function signedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 60,
): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  return error ? null : (data?.signedUrl ?? null);
}

/*
 * Photos are the exception to "short-lived". A new link on every page looks
 * like a new image to the phone, so each visit to Discover downloaded every
 * photo again — that alone ran the free plan's storage egress to seven times
 * its limit. Instead, everyone gets the same link to a photo for the whole of
 * an hour, and the phone shows the copy it already has.
 *
 * The link works for two hours: the hour it is handed out in, and one more for
 * a page left open and scrolled later. That is the cost — a forwarded photo
 * link stays usable for up to two hours, not one minute. The database still
 * decides who is given one; the cache only remembers links already allowed.
 */
const PHOTO_LINK_HOUR = 60 * 60;

const photoLinkThisHour = unstable_cache(
  async (paths: string[], _hour: number): Promise<string> => {
    // The first of the paths that exists. Throwing on none keeps a failure out of the cache.
    for (const path of paths) {
      const url = await signedUrl(BUCKETS.photo, path, 2 * PHOTO_LINK_HOUR);
      if (url) return url;
    }
    throw new Error('not signed');
  },
  ['photo-link'],
  { revalidate: PHOTO_LINK_HOUR },
);

async function photoLink(paths: string[]): Promise<string | null> {
  return photoLinkThisHour(paths, Math.floor(Date.now() / 1000 / PHOTO_LINK_HOUR)).catch(() => null);
}

/** A photo the database has already allowed this viewer to see. */
export function photoUrl(path: string): Promise<string | null> {
  return photoLink([path]);
}

/** The same photo at card size, or the photo itself if it has no small copy yet. */
export function photoThumbnailUrl(path: string): Promise<string | null> {
  return photoLink([thumbnailPath(path), path]);
}
