import { after } from 'next/server';

import { PHOTO_BYTES_PER_DAY, openPhotoLink } from '@/lib/photo-link';
import { BUCKETS } from '@/lib/storage';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/*
 * A photo, by the /media link lib/photo-link.ts signed for it.
 *
 * The database decided who may see the photo before the link was signed, so
 * this checks the signature and reads no session. Without a cookie the answer
 * is the same for everyone, and the Vercel CDN keeps it and gives it to the
 * next family without running this again (proxy.ts leaves /media alone for the
 * same reason). Storage is asked only when the CDN has no copy.
 *
 * Every byte fetched from storage is counted against a daily allowance
 * (public.file_egress). Once today is over it, families see a plain tile
 * instead of photos until tomorrow, rather than the project being switched off
 * for the rest of the month as it was in October 2026.
 */

const PLACEHOLDER =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 5"><rect width="4" height="5" fill="#ece7e1"/></svg>';

const refuse = (status: number) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });

/** Today's storage egress, or 0 if it cannot be read — a missing counter must not hide every photo. */
async function spentToday(): Promise<number> {
  const { data, error } = await createSupabaseAdminClient().rpc('file_egress', { p_add: 0 });
  if (error) console.error('file_egress unreadable', error.message);
  return error ? 0 : (data ?? 0);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ size: string; day: string; sig: string; candidate: string; file: string }> },
) {
  // A query string would make a new CDN entry, and so a new download, for the
  // same photo. Nothing the app links to has one.
  if (new URL(request.url).search) return refuse(400);

  const { size, day, sig, candidate, file } = await context.params;
  const link = openPhotoLink(size, day, sig, `${candidate}/${file}`);
  if (!link) return refuse(404);

  if ((await spentToday()) >= PHOTO_BYTES_PER_DAY) {
    console.warn('file_egress: daily allowance used, serving placeholders');
    return new Response(PLACEHOLDER, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
    });
  }

  const storage = createSupabaseAdminClient().storage.from(BUCKETS.photo);
  for (const object of link.objects) {
    const { data } = await storage.download(object);
    if (!data) continue;

    after(async () => {
      const { error } = await createSupabaseAdminClient().rpc('file_egress', { p_add: data.size });
      if (error) console.error('file_egress not recorded', error.message);
    });

    return new Response(data, {
      headers: {
        'Content-Type': data.type || 'image/jpeg',
        // The phone keeps it for as long as the link works; so does the CDN.
        'Cache-Control': `public, max-age=${link.secondsLeft}, immutable`,
        'Vercel-CDN-Cache-Control': `max-age=${link.secondsLeft}`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  return refuse(404);
}
