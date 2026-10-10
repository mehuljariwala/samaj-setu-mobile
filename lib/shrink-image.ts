/**
 * Phone cameras save photos of three to eight megabytes, and those used to be
 * stored and served exactly as taken. Every Discover visit then downloaded each
 * family's full photo, which ran the free storage plan's egress to seven times
 * its limit. So images are made small here, in the browser, before they leave
 * the phone — which also makes the upload itself work on a weak signal.
 *
 * Browser only: it draws on a canvas. Anything that cannot be drawn (a PDF, a
 * format this browser cannot decode) is handed back untouched, so shrinking can
 * never be the reason an upload fails.
 */

type Fit = {
  /** The longest edge, in pixels, at most. */
  longest: number;
  /** The shortest edge, in pixels, at most — for thumbnails that are cropped square. */
  shortest?: number;
  quality: number;
  /** A file already this small and within the edges is kept as it is. */
  keepUnder?: number;
};

/** What the profile page shows: sharp on a phone at about 150–250 KB. */
const PHOTO: Fit = { longest: 1200, quality: 0.8, keepUnder: 300 * 1024 };
/** What the Discover cards show, at about 30 KB. Saved beside the photo; see thumbnailPath. */
const THUMBNAIL: Fit = { longest: 800, shortest: 400, quality: 0.72 };
/** Certificates, ID cards and janmakshar: small print has to stay readable for the admin. */
const DOCUMENT: Fit = { longest: 2000, quality: 0.85, keepUnder: 600 * 1024 };

export const shrinkPhoto = (file: File) => shrink(file, PHOTO);
export const shrinkDocument = (file: File) => shrink(file, DOCUMENT);

/** The card-sized copy, or null if this browser cannot draw the image. */
export async function photoThumbnail(file: File): Promise<File | null> {
  const small = await shrink(file, THUMBNAIL);
  return small === file ? null : small;
}

async function shrink(file: File, fit: Fit): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const url = URL.createObjectURL(file);
  try {
    // An <img> rather than createImageBitmap: every current browser turns a
    // sideways phone photo upright (EXIF orientation) when drawing one.
    const image = new Image();
    image.src = url;
    await image.decode();

    const { naturalWidth: width, naturalHeight: height } = image;
    const scale = Math.min(
      1,
      fit.longest / Math.max(width, height),
      fit.shortest ? fit.shortest / Math.min(width, height) : 1,
    );
    if (scale === 1 && fit.keepUnder && file.size <= fit.keepUnder) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    // JPEG has no transparency; without this a transparent PNG turns black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', fit.quality));
    if (!blob || blob.type !== 'image/jpeg') return file;
    // Re-encoding an already-compressed image at full size can come out larger.
    if (scale === 1 && fit.keepUnder && blob.size >= file.size) return file;

    const name = `${file.name.replace(/\.[^./]*$/, '') || 'photo'}.jpg`;
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
