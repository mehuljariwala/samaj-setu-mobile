import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';
import { SUPABASE_URL } from './env';

/**
 * The service-role client. It bypasses row level security completely.
 *
 * Used for exactly two things, both of which are impossible with a member's
 * session:
 *
 *   * minting short-lived signed URLs for private storage objects, after the
 *     database has already confirmed the caller may see them;
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
