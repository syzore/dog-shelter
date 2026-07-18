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
