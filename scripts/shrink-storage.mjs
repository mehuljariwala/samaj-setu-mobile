#!/usr/bin/env node
// ---------------------------------------------------------------------------
// One-off: shrink the images already in storage to what the app now uploads
// (lib/shrink-image.ts), and give every profile photo its card-sized copy
// (lib/storage.ts, thumbnailPath), which is what Discover shows.
//
// Every image it would change is first downloaded, unchanged, to a backup
// folder, and nothing is replaced unless its backup is on disk at the right
// size. Without --apply it only fills the backup and reports what it would do;
// --apply then works from the backup, so it downloads nothing twice.
//
//   npm install --no-save sharp
//   node scripts/shrink-storage.mjs <backup-folder> [--apply]
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from .env.local.
// PDFs are left alone. The database rows keep their original mime_type and
// size_bytes, so the admin certificate viewer shows the size as uploaded.
// Running it again is safe: anything already shrunk is skipped.
// ---------------------------------------------------------------------------
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [backupDir] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const apply = process.argv.includes('--apply');

if (!backupDir) {
  console.error('Usage: node scripts/shrink-storage.mjs <backup-folder> [--apply]');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8').split('\n')
    .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.replace(/^["']|["']$/g, '')]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// The same sizes as lib/shrink-image.ts.
const PHOTO = { longest: 1200, quality: 80, keepUnder: 300 * 1024 };
const DOCUMENT = { longest: 2000, quality: 85, keepUnder: 600 * 1024 };
const THUMBNAIL_SHORTEST = 400;
const THUMBNAIL_QUALITY = 72;
const BUCKETS = [
  ['candidate-photos', PHOTO],
  ['kundali', DOCUMENT],
  ['certificates', DOCUMENT],
];

const thumbnailPath = (path) => `${path.replace(/\.[a-z0-9]*$/, '')}.thumb.jpg`;
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

async function listAll(bucket, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    for (const item of data) {
      const name = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...await listAll(bucket, name));
      else files.push({ name, size: item.metadata?.size ?? 0, type: item.metadata?.mimetype ?? '' });
    }
    if (data.length < 1000) return files;
  }
}

async function sizeOnDisk(path) {
  try { return (await stat(path)).size; } catch { return null; }
}

/** The original, from the backup if it is there, otherwise downloaded into it. Never overwritten. */
async function original(bucket, file) {
  const path = resolve(backupDir, bucket, file.name);
  const onDisk = await sizeOnDisk(path);
  if (onDisk !== null) return { bytes: await readFile(path), replaced: onDisk !== file.size };

  const { data, error } = await supabase.storage.from(bucket).download(file.name);
  if (error) throw new Error(`download: ${error.message}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  if (await sizeOnDisk(path) !== bytes.length) throw new Error('backup did not write in full');
  return { bytes, replaced: false };
}

async function upload(bucket, name, bytes) {
  const { error } = await supabase.storage.from(bucket)
    .upload(name, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`upload ${name}: ${error.message}`);
}

async function shrinkOne(bucket, fit, file, existing, totals) {
  const { bytes, replaced } = await original(bucket, file);
  // .rotate() with no angle turns a sideways phone photo upright from its EXIF;
  // the white background stops a transparent PNG turning black as a JPEG.
  const image = () => sharp(bytes, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' });

  if (bucket === 'candidate-photos' && !existing.has(thumbnailPath(file.name))) {
    const thumbnail = await image()
      .resize({ width: THUMBNAIL_SHORTEST, height: THUMBNAIL_SHORTEST, fit: 'outside', withoutEnlargement: true })
      .jpeg({ quality: THUMBNAIL_QUALITY, mozjpeg: true })
      .toBuffer();
    totals.thumbnails += 1;
    totals.thumbnailBytes += thumbnail.length;
    if (apply) await upload(bucket, thumbnailPath(file.name), thumbnail);
  }

  // A file whose size no longer matches its backup has been shrunk already.
  if (replaced) { totals.done += 1; return; }

  const { width = 0, height = 0 } = await image().metadata();
  if (Math.max(width, height) <= fit.longest && file.size <= fit.keepUnder) { totals.small += 1; return; }

  const small = await image()
    .resize({ width: fit.longest, height: fit.longest, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: fit.quality, mozjpeg: true })
    .toBuffer();
  if (small.length > file.size * 0.9) { totals.small += 1; return; }

  totals.shrunk += 1;
  totals.before += file.size;
  totals.after += small.length;
  if (apply) await upload(bucket, file.name, small);
}

async function inPool(items, size, work) {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}

console.log(apply ? 'Shrinking, with backups in' : 'Dry run (backups only) into', resolve(backupDir), '\n');

for (const [bucket, fit] of BUCKETS) {
  const all = await listAll(bucket);
  const existing = new Set(all.map((file) => file.name));
  const images = all.filter((file) => file.type.startsWith('image/') && !file.name.endsWith('.thumb.jpg'));
  const totals = { shrunk: 0, before: 0, after: 0, small: 0, done: 0, thumbnails: 0, thumbnailBytes: 0, failed: 0 };

  let seen = 0;
  await inPool(images, 4, async (file) => {
    try {
      await shrinkOne(bucket, fit, file, existing, totals);
    } catch (error) {
      totals.failed += 1;
      console.error(`  ✗ ${bucket}/${file.name} (${kb(file.size)}): ${error.message}`);
    }
    seen += 1;
    if (seen % 50 === 0) console.log(`  ${bucket}: ${seen} of ${images.length}`);
  });

  console.log(`${bucket}: ${all.length} files, ${images.length} images`);
  console.log(`  ${apply ? 'shrunk' : 'would shrink'} ${totals.shrunk}: ${mb(totals.before)} → ${mb(totals.after)}`);
  if (bucket === 'candidate-photos') {
    console.log(`  ${apply ? 'added' : 'would add'} ${totals.thumbnails} card-sized copies, ${mb(totals.thumbnailBytes)} in all`);
  }
  console.log(`  already small ${totals.small}, already shrunk ${totals.done}, failed ${totals.failed}\n`);
}
