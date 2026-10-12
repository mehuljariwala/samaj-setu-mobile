import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { thumbnailPath } from '@/lib/storage';

/*
 * Photos are served from this app's own address, /media/…, and never by a
 * Supabase link handed to the phone.
 *
 * A storage link reaches Supabase on every phone that opens it: a private
 * bucket is not shared between viewers by Supabase's cache, so every family
 * scrolling Discover downloaded every photo from storage, and that alone
 * would use up the free plan's 5 GB a month. A /media link is answered once
 * by app/media/…/route.ts, which fetches the photo from storage, and after
 * that by the Vercel CDN, so storage sends a photo about once a day however
 * many families look at it.
 *
 * The link is signed here, after the database has decided this viewer may see
 * the photo, and works for the day it is handed out and the day after. That
 * is the cost: a forwarded photo link keeps working for up to two days, as a
 * photo already seen stays on the phone that saw it (spec §8). Everyone gets
 * the same link on the same day, which is what lets the CDN and the phone
 * reuse it. Nothing here asks Supabase anything.
 */

const DAY = 24 * 60 * 60;

/**
 * How many bytes /media may fetch from storage in a day before it shows a
 * plain tile instead (public.file_egress). 80 MB a day is at most 2.4 GB of
 * the free plan's 5 GB a month, leaving the rest for the database.
 */
export const PHOTO_BYTES_PER_DAY = (Number(process.env.FILE_EGRESS_DAILY_MB) || 80) * 1024 * 1024;

export type PhotoSize = 'card' | 'full';

/** The candidate's id, then the file's own id and extension, as objectPath() writes them. */
const PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,10}$/;

const today = () => Math.floor(Date.now() / 1000 / DAY);

function signature(size: PhotoSize, day: number, path: string): string {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!key) throw new Error('Photo links are signed with SUPABASE_SECRET_KEY, which is not set.');
  return createHmac('sha256', key).update(`photo-link\n${size}\n${day}\n${path}`).digest('base64url');
}

function link(path: string, size: PhotoSize): string | null {
  if (!PHOTO_PATH.test(path)) return null;
  const day = today();
  return `/media/${size}/${day}/${signature(size, day, path)}/${path}`;
}

/** A photo the database has already allowed this viewer to see. */
export function photoUrl(path: string): string | null {
  return link(path, 'full');
}

/** The same photo at card size, or the photo itself if it has no small copy. */
export function photoThumbnailUrl(path: string): string | null {
  return link(path, 'card');
}

/**
 * What a /media link asks for: the storage objects to try, in order, and how
 * many seconds the link has left. Null for a link that was not signed here or
 * has run out.
 */
export function openPhotoLink(
  size: string,
  day: string,
  sig: string,
  path: string,
): { objects: string[]; secondsLeft: number } | null {
  if ((size !== 'card' && size !== 'full') || !/^\d{1,7}$/.test(day) || !PHOTO_PATH.test(path)) {
    return null;
  }

  const issued = Number(day);
  const secondsLeft = (issued + 2) * DAY - Math.floor(Date.now() / 1000);
  // A day ahead is allowed for a server whose clock is a little fast.
  if (secondsLeft <= 0 || issued > today() + 1) return null;

  const expected = Buffer.from(signature(size, issued, path));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  return { objects: size === 'card' ? [thumbnailPath(path), path] : [path], secondsLeft };
}
