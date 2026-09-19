/**
 * Supabase connection settings.
 *
 * Supabase issues two generations of key names. New projects get
 * `sb_publishable_…` / `sb_secret_…`; older ones get the legacy `anon` and
 * `service_role` JWTs. Both are read here so the same code works against either,
 * and so nobody has to rename an environment variable to run the app.
 */

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  '';

/** Fail at the first call rather than with an opaque 401 from PostgREST. */
export function assertPublicEnv(): void {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env.local and set ' +
        'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
}
