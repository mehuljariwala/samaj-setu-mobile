import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/*
 * The daily upkeep that keeps the platform on Supabase's free plan, called by
 * the Vercel cron in vercel.json (supabase/migrations/20261012000200 says what
 * it does and why).
 *
 * public.run_maintenance() does the work and runs at most once in 20 hours
 * whoever asks, so a stranger calling this changes nothing. When CRON_SECRET
 * is set in Vercel, the cron sends it and everyone else is turned away. The
 * files it lists are deleted here, through the Storage API, because storage
 * refuses deletes made in SQL.
 */

type Run = {
  skipped: boolean;
  page_views_deleted?: number;
  files?: { bucket: string; name: string }[];
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('run_maintenance');
  if (error) {
    console.error('maintenance did not run', error.message);
    return Response.json({ ok: false }, { status: 500 });
  }

  const run = data as unknown as Run;
  const byBucket = new Map<string, string[]>();
  for (const file of run.files ?? []) {
    byBucket.set(file.bucket, [...(byBucket.get(file.bucket) ?? []), file.name]);
  }

  let removed = 0;
  for (const [bucket, names] of byBucket) {
    for (let start = 0; start < names.length; start += 100) {
      const { data: gone, error: removeError } = await admin.storage.from(bucket).remove(names.slice(start, start + 100));
      if (removeError) console.error('maintenance: files not removed from', bucket, removeError.message);
      removed += gone?.length ?? 0;
    }
  }

  return Response.json({
    ok: true,
    skipped: run.skipped,
    pageViewsDeleted: run.page_views_deleted ?? 0,
    filesRemoved: removed,
  });
}
