import { NextResponse, after, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { originOf } from '@/lib/data/activity-origin';
import type { Database } from '@/lib/supabase/database.types';
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

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
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

  // Touching getClaims() is what triggers the refresh. Its answer grants
  // nothing here — trusting it would be an authorisation decision made in the
  // one place that cannot enforce it. It only decides whether to log a visit.
  const { data } = await supabase.auth.getClaims();

  if (data?.claims?.sub && isPageView(request)) {
    const { ip, userAgent } = originOf(request.headers);
    const path = request.nextUrl.pathname;
    // After the response, so a slow log never slows a page. record_activity
    // takes the account from the token, drops repeats within a minute, and
    // reads the profile id out of /discover/<id>.
    after(async () => {
      const { error } = await supabase.rpc('record_activity', {
        p_kind: 'page.view',
        p_path: path,
        p_ip: ip ?? undefined,
        p_user_agent: userAgent ?? undefined,
      });
      if (error) console.error('page view not recorded', path, error.message);
    });
  }

  return response;
}

/**
 * A screen the member actually opened: a full load or a client-side
 * navigation. Not a prefetch (the router fetches links before anyone taps
 * them), not a Server Action POST, not framework or API traffic.
 */
function isPageView(request: NextRequest) {
  if (request.method !== 'GET') return false;
  const headers = request.headers;
  if (
    headers.has('next-router-prefetch') ||
    headers.has('next-router-segment-prefetch') ||
    headers.get('purpose') === 'prefetch' ||
    headers.get('sec-purpose')?.includes('prefetch')
  ) {
    return false;
  }
  const path = request.nextUrl.pathname;
  return !/^\/(?:_next|api|\.well-known|auth)(?:\/|$)/.test(path) && !/\.[a-z0-9]+$/i.test(path);
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
