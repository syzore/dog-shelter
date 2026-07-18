import { objectKeyFor } from "@/lib/imageTypes";
import { getSupabase } from "@/lib/supabase/client";
import type { Photo } from "@/lib/types";

const UPLOAD_CONCURRENCY = 4;

async function readError(response: Response, fallback: string) {
  try {
    const body = await response.json();
    return typeof body?.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

/** Lowercase hex SHA-256 of the file's bytes. */
async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function publicBase(): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (!base) throw new Error("NEXT_PUBLIC_R2_PUBLIC_URL is not set.");
  return base.replace(/\/+$/, "");
}

const THUMB_MAX_DIM = 480;
const THUMB_QUALITY = 0.72;

/**
 * Downscale the image to a small JPEG for the grid. Returns null if the format
 * can't be decoded in this browser (e.g. some HEIC), in which case the upload
 * proceeds without a thumbnail and the grid falls back to the original.
 */
async function makeThumbnail(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      THUMB_MAX_DIM / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return await new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", THUMB_QUALITY),
    );
  } catch {
    return null;
  }
}

function putBlob(uploadUrl: string, blob: Blob, contentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.addEventListener("load", () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`R2 rejected the upload (HTTP ${xhr.status}).`)),
    );
    xhr.addEventListener("error", () =>
      reject(new Error("Network error during upload.")),
    );
    xhr.send(blob);
  });
}

/**
 * PUTs the file to R2. Uses XHR rather than fetch because fetch exposes no
 * upload progress, and a burst import is dozens of files at once.
 */
function putToR2(
  uploadUrl: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(`R2 rejected the upload (HTTP ${xhr.status}).`));
      }
    });
    xhr.addEventListener("error", () =>
      reject(new Error("Network error during upload.")),
    );
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted.")));

    xhr.send(file);
  });
}

export type UploadResult =
  | { status: "uploaded"; photo: Photo }
  | { status: "duplicate" };

/**
 * Uploads one file (whose SHA-256 the caller has already computed) and returns
 * the created photo row — or reports that the exact image already exists.
 *
 * The object key is the SHA-256 of the bytes, so an identical image maps to a
 * URL that is already in the database. We check for that first and skip the
 * upload entirely (these files are 25MB, so not re-sending a duplicate matters).
 *
 * `captured_at` comes from the file's lastModified stamp, which cameras and
 * phones preserve on export. It is what the burst grouping in the grid sorts
 * and windows on; see the note in README about EXIF if your source strips it.
 */
export async function uploadPhoto(
  file: File,
  hash: string,
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  const key = objectKeyFor(hash, file.type);
  if (!key) throw new Error(`Unsupported image type: ${file.type || "unknown"}.`);
  const r2Url = `${publicBase()}/${key}`;

  const existing = await getSupabase()
    .from("photos")
    .select("id")
    .eq("r2_url", r2Url)
    .limit(1)
    .maybeSingle();
  if (existing.data) {
    onProgress?.(1);
    return { status: "duplicate" };
  }

  // Generate the thumbnail while the presign request is in flight.
  const [signResponse, thumbBlob] = await Promise.all([
    fetch("/api/upload/presigned-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType: file.type,
        contentLength: file.size,
        sha256: hash,
      }),
    }),
    makeThumbnail(file),
  ]);

  if (!signResponse.ok) {
    throw new Error(await readError(signResponse, "Could not get an upload URL."));
  }

  const { uploadUrl, thumbUploadUrl } = (await signResponse.json()) as {
    uploadUrl: string;
    thumbUploadUrl: string;
  };

  await Promise.all([
    putToR2(uploadUrl, file, onProgress),
    // A failed thumbnail is non-fatal — the grid falls back to the original.
    thumbBlob
      ? putBlob(thumbUploadUrl, thumbBlob, "image/jpeg").catch(() => {})
      : Promise.resolve(),
  ]);

  const capturedAt = new Date(file.lastModified || Date.now()).toISOString();
  const recordResponse = await fetch("/api/photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, capturedAt }),
  });

  if (!recordResponse.ok) {
    throw new Error(
      await readError(recordResponse, "Upload saved but could not be recorded."),
    );
  }

  const recorded = (await recordResponse.json()) as Photo | { duplicate: true };
  if ("duplicate" in recorded) return { status: "duplicate" };
  return { status: "uploaded", photo: recorded };
}

export type UploadOutcome =
  | { file: File; status: "uploaded"; photo: Photo }
  | { file: File; status: "duplicate" }
  | { file: File; status: "failed"; error: string };

/**
 * Uploads many files with bounded concurrency. One bad file does not sink the
 * batch — each outcome is reported independently. Files that are identical to
 * one another within the same batch are also collapsed to a single upload.
 */
export async function uploadPhotos(
  files: File[],
  onFileDone?: (outcome: UploadOutcome, completed: number) => void,
): Promise<UploadOutcome[]> {
  const outcomes: UploadOutcome[] = new Array(files.length);
  const seenHashes = new Set<string>();
  let next = 0;
  let completed = 0;

  async function worker() {
    while (next < files.length) {
      const index = next++;
      const file = files[index];
      try {
        // Collapse exact duplicates chosen in the same batch before uploading.
        const hash = await sha256Hex(file);
        if (seenHashes.has(hash)) {
          outcomes[index] = { file, status: "duplicate" };
        } else {
          seenHashes.add(hash);
          const result = await uploadPhoto(file, hash);
          outcomes[index] =
            result.status === "uploaded"
              ? { file, status: "uploaded", photo: result.photo }
              : { file, status: "duplicate" };
        }
      } catch (error) {
        outcomes[index] = {
          file,
          status: "failed",
          error: error instanceof Error ? error.message : "Upload failed.",
        };
      }
      onFileDone?.(outcomes[index], ++completed);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker),
  );

  return outcomes;
}
