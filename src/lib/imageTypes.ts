/**
 * Shared between the client uploader and the API routes so they agree on
 * accepted formats and on how an object key is derived from a file's content.
 */

export const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
};

export const ACCEPTED_CONTENT_TYPES = Object.keys(EXTENSION_BY_TYPE);

/** A lowercase 64-char hex SHA-256 digest. */
export const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Content-addressed key: the object is named by the SHA-256 of its bytes, so
 * identical images resolve to the same key and the same public URL. That is
 * what lets us detect "this exact image already exists" — a duplicate simply
 * maps to a row that is already in the database.
 */
export function objectKeyFor(
  sha256Hex: string,
  contentType: string,
): string | null {
  const ext = EXTENSION_BY_TYPE[contentType];
  if (!ext) return null;
  return `photos/${sha256Hex}.${ext}`;
}

/** Where the small preview for a given content hash lives. Always a JPEG. */
export function thumbKeyFor(sha256Hex: string): string {
  return `photos/thumb/${sha256Hex}.jpg`;
}

/**
 * Turn a raw EXIF DateTimeOriginal ("YYYY:MM:DD HH:MM:SS", no timezone) into an
 * ISO string, treating it as UTC. The offset from true UTC doesn't matter — the
 * app only ever compares capture times to each other — but it must be applied
 * identically on the client and in the backfill so new and old photos share one
 * consistent timeline. Returns null if the value isn't a valid EXIF datetime.
 */
export function exifDateToIso(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * Derive a photo's thumbnail URL from its original URL, for the grid. If the
 * thumb doesn't exist (e.g. photos uploaded before thumbnails, or a format we
 * couldn't downscale), the grid's <img> onError falls back to the original.
 */
export function thumbUrlFor(r2Url: string): string {
  return r2Url.replace(/\/photos\/([^/]+)\.[^./]+$/, "/photos/thumb/$1.jpg");
}
