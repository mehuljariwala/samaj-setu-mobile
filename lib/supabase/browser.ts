'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, assertPublicEnv } from './env';

/**
 * Browser client. Needed for two things only: signing in, and uploading a file
 * straight to storage so a 4 MB photograph does not travel through the Next.js
 * server.
 *
 * Everything else goes through a server action. Reads and writes belong in the
 * data access layer, where the authorisation checks live and where a response
 * can be trimmed to what the screen needs.
 */
let client: SupabaseClient<Database> | undefined;

export function getSupabaseBrowserClient() {
  assertPublicEnv();
  // `cookies: {}` picks the current overload rather than the deprecated
  // get/set/remove one — an empty object does not satisfy that older shape.
  // Omitting getAll and setAll is the documented way to keep the default
  // `document.cookie` behaviour.
  client ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {},
  });
  return client;
}
