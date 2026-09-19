import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import type { Database } from './database.types';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, assertPublicEnv } from './env';

/**
 * A request-scoped Supabase client that carries the signed-in member's session.
 *
 * Every query made through it is subject to the row level security policies in
 * `supabase/migrations/20260914001200_rls.sql`. That is the point: server code
 * holding a member's session has exactly the member's privileges, so a bug in a
 * data-access function leaks nothing the member could not already read.
 *
 * Create a new one per request. Sharing a client between requests would mean
 * sharing a session between users.
 */
export async function createSupabaseServerClient() {
  assertPublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. That is fine: proxy.ts runs
          // before every request and refreshes the session there, so a refresh
          // dropped here is picked up on the next navigation rather than lost.
        }
      },
    },
  });
}
