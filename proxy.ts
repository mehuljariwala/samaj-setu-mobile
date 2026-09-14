import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from '@/lib/supabase/env';

/**
 * Session refresh. (Next.js 16 renamed Middleware to Proxy; same mechanism.)
 *
 * Server Components cannot write cookies, so a token that expires mid-render
 * has nowhere to put its replacement. This runs first, refreshes if needed, and
 * writes the new cookies onto the response.
 *
 * It deliberately makes no authorisation decision. Per the Next.js guidance,
 * Proxy is for optimistic checks, not for session management or authorisation —
 * and here every real decision already lives in a row level security policy or
 * an RPC, where it cannot be skipped by a request that never passes through
 * this file.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    // Not configured yet — the prototype still runs entirely on local state.
    return response;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // A response that carries a refreshed auth cookie must never be cached
        // by a CDN, or one member's token gets served to another.
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Touching getClaims() is what triggers the refresh. Its answer is ignored on
  // purpose: trusting it here would be an authorisation decision made in the
  // one place that cannot enforce it.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Running on a PNG would
     * refresh a session for a request that never reads one.
     */
    '/((?!_next/static|_next/image|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
