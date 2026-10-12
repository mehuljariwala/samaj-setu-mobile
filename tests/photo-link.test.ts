import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { openPhotoLink, photoThumbnailUrl, photoUrl } = await import('@/lib/photo-link');

const photo = '0250ef52-f29b-4d2d-834a-9475d4081f1b/7c9e6679-7425-40de-944b-e07fc1f90ae7.jpeg';
const DAY = 24 * 60 * 60 * 1000;

/** /media/<size>/<day>/<sig>/<candidate>/<file>, split the way the route receives it. */
function parts(link: string | null) {
  const [, media, size, day, sig, candidate, file] = (link ?? '').split('/');
  expect(media).toBe('media');
  return { size, day, sig, path: `${candidate}/${file}` };
}

const open = (link: string | null) => {
  const { size, day, sig, path } = parts(link);
  return openPhotoLink(size, day, sig, path);
};

beforeEach(() => {
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-14T09:30:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('photo links', () => {
  it('opens a full-size link to the photo itself, for between one and two days', () => {
    const link = open(photoUrl(photo));
    expect(link?.objects).toEqual([photo]);
    expect(link!.secondsLeft).toBeGreaterThan(24 * 60 * 60);
    expect(link!.secondsLeft).toBeLessThanOrEqual(2 * 24 * 60 * 60);
  });

  it('opens a card link to the small copy first, then the photo', () => {
    expect(open(photoThumbnailUrl(photo))?.objects).toEqual([
      '0250ef52-f29b-4d2d-834a-9475d4081f1b/7c9e6679-7425-40de-944b-e07fc1f90ae7.thumb.jpg',
      photo,
    ]);
  });

  it('gives everyone the same link all day, which is what lets the CDN and phones reuse it', () => {
    const morning = photoUrl(photo);
    vi.setSystemTime(new Date('2026-11-14T23:59:00Z'));
    expect(photoUrl(photo)).toBe(morning);
    vi.setSystemTime(new Date('2026-11-15T00:01:00Z'));
    expect(photoUrl(photo)).not.toBe(morning);
  });

  it('works the day after it is handed out, and not the day after that', () => {
    const link = photoUrl(photo);
    vi.setSystemTime(Date.now() + DAY);
    expect(open(link)).not.toBeNull();
    vi.setSystemTime(Date.now() + DAY);
    expect(open(link)).toBeNull();
  });

  it('refuses a link that was changed or signed with another key', () => {
    const { size, day, sig, path } = parts(photoUrl(photo));
    const other = '0250ef52-f29b-4d2d-834a-9475d4081f1b/00000000-0000-4000-8000-000000000000.jpg';

    expect(openPhotoLink(size, day, sig, other)).toBeNull();
    expect(openPhotoLink('card', day, sig, path)).toBeNull();
    expect(openPhotoLink(size, String(Number(day) + 1), sig, path)).toBeNull();
    expect(openPhotoLink(size, day, `${sig.slice(0, -1)}A`, path)).toBeNull();

    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_rotated');
    expect(openPhotoLink(size, day, sig, path)).toBeNull();
  });

  it('only names photos in the shape uploads are stored in', () => {
    expect(photoUrl('../certificates/0250ef52-f29b-4d2d-834a-9475d4081f1b.jpg')).toBeNull();
    expect(photoUrl('0250ef52-f29b-4d2d-834a-9475d4081f1b/x.jpg')).toBeNull();
    expect(openPhotoLink('full', 'today', 'sig', photo)).toBeNull();
    expect(openPhotoLink('original', '20406', 'sig', photo)).toBeNull();
  });
});
