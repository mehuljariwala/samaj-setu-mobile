import { describe, expect, it } from 'vitest';

import { objectPath, thumbnailPath } from '@/lib/storage';

const candidate = '0250ef52-f29b-4d2d-834a-9475d4081f1b';

describe('thumbnailPath', () => {
  it('puts the card-sized copy beside the photo, always as a JPEG', () => {
    expect(thumbnailPath(`${candidate}/a1b2.jpg`)).toBe(`${candidate}/a1b2.thumb.jpg`);
    expect(thumbnailPath(`${candidate}/a1b2.png`)).toBe(`${candidate}/a1b2.thumb.jpg`);
  });

  it('keeps the candidate folder first, which the storage policies decide ownership by', () => {
    const photo = objectPath(candidate, 'IMG_2041.HEIC.jpeg');
    expect(thumbnailPath(photo).split('/')[0]).toBe(candidate);
    expect(thumbnailPath(photo)).not.toBe(photo);
  });
});
