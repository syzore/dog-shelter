import { thumbUrlFor } from "@/lib/imageTypes";
import type { Photo } from "@/lib/types";

/**
 * Client-side burst detection.
 *
 * A "burst" is a run of near-identical frames shot seconds apart. Starting
 * from an anchor photo, every photo captured within WINDOW_MS of the anchor is
 * downsampled to SIZE x SIZE grayscale on a hidden canvas and compared to the
 * anchor by mean squared error; close-enough frames join the selection.
 */

const WINDOW_MS = 60_000;
const SIZE = 64;

/**
 * How many images to decode at once. Comparisons use the small thumbnail, but
 * photos without one fall back to the multi-MB original, and firing dozens of
 * those at r2.dev at once gets rate-limited into timeouts — so cap it.
 */
const LOAD_CONCURRENCY = 5;

/**
 * MSE over 0-255 grayscale values, so the range is 0..65025.
 *
 * Tuned against real shelter photos, where every shot shares the same grass /
 * tree backdrop. That backdrop dominates the frame, so MSE reliably flags only
 * near-identical frames (~2100-3400); a different dog in the same spot can score
 * as low as ~3500. 3400 sits just under that, catching the tight core of a burst
 * without pulling in a different dog. It cannot group looser different-pose shots
 * of the same dog — the background swamps the difference — so use shift+click to
 * range-select those.
 */
const MSE_THRESHOLD = 3400;

/** One canvas reused across all downsamples. */
let sharedCanvas: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

function getCanvas() {
  if (!sharedCanvas) {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    // willReadFrequently keeps the bitmap on the CPU, since getImageData is
    // the whole point of this canvas.
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D is unavailable.");
    sharedCanvas = { canvas, ctx };
  }
  return sharedCanvas;
}

/**
 * Fetch an image's bytes, preferring the thumbnail. Using fetch + a Blob (then
 * createImageBitmap) rather than a crossOrigin <img> is the reliable way to get
 * CORS-clean pixels out of R2: the Blob is same-origin data, so the canvas is
 * never tainted. A crossOrigin <img> is fussier and stalls on some setups.
 */
async function fetchImageBitmap(photo: Photo): Promise<ImageBitmap> {
  const sources = [thumbUrlFor(photo.r2_url), photo.r2_url];
  let lastError: unknown;
  for (const url of sources) {
    try {
      const response = await fetch(url, { mode: "cors" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await createImageBitmap(await response.blob());
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("image fetch failed");
}

/**
 * Downsample to SIZE x SIZE grayscale. Uses the thumbnail — it's tiny and fast,
 * and at 64x64 the downscale swamps any thumbnail compression. Falls back to
 * the original for photos that don't have a thumbnail yet.
 */
async function grayscalePixels(photo: Photo): Promise<Float32Array> {
  const bitmap = await fetchImageBitmap(photo);
  const { ctx } = getCanvas();
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const pixels = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < pixels.length; i++) {
    const offset = i * 4;
    // Rec. 601 luma weights.
    pixels[i] =
      0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  }
  return pixels;
}

export function meanSquaredError(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return sum / a.length;
}

/**
 * Downsampled pixels keyed by photo id. Photos are immutable once uploaded,
 * so this never needs invalidation; at 16KB per entry, ~4MB per 250 photos.
 */
const pixelCache = new Map<string, Promise<Float32Array>>();

function pixelsFor(photo: Photo): Promise<Float32Array> {
  let cached = pixelCache.get(photo.id);
  if (!cached) {
    cached = grayscalePixels(photo);
    // A failed load should not poison the cache permanently.
    cached.catch(() => pixelCache.delete(photo.id));
    pixelCache.set(photo.id, cached);
  }
  return cached;
}

export type BurstResult = {
  /** Ids of matching photos, anchor included. */
  ids: string[];
  /** Photos in the time window that could not be compared (load failures). */
  failures: number;
};

/**
 * Find the anchor's burst within `photos` (must be sorted by captured_at).
 * A photo that fails to load is skipped rather than failing the whole gesture.
 */
export async function findBurst(
  photos: Photo[],
  anchor: Photo,
): Promise<BurstResult> {
  const anchorTime = new Date(anchor.captured_at).getTime();
  const candidates = photos.filter(
    (photo) =>
      photo.id !== anchor.id &&
      Math.abs(new Date(photo.captured_at).getTime() - anchorTime) <= WINDOW_MS,
  );

  const anchorPixels = await pixelsFor(anchor);

  const ids = [anchor.id];
  let failures = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor++];
      try {
        const mse = meanSquaredError(anchorPixels, await pixelsFor(candidate));
        if (mse <= MSE_THRESHOLD) ids.push(candidate.id);
      } catch {
        failures++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(LOAD_CONCURRENCY, candidates.length) }, worker),
  );

  return { ids, failures };
}

// Dev-only console handle for exercising and tuning the pipeline directly;
// stripped from production bundles.
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as unknown as Record<string, unknown>).__burst = {
    findBurst,
    meanSquaredError,
    // Raw MSE from an anchor to every in-window candidate, for tuning.
    async analyze(photos: Photo[], anchor: Photo) {
      const anchorTime = new Date(anchor.captured_at).getTime();
      const anchorPixels = await pixelsFor(anchor);
      const rows: { id: string; mse: number | null }[] = [];
      for (const photo of photos) {
        if (photo.id === anchor.id) continue;
        if (Math.abs(new Date(photo.captured_at).getTime() - anchorTime) > WINDOW_MS)
          continue;
        try {
          rows.push({
            id: photo.id,
            mse: Math.round(meanSquaredError(anchorPixels, await pixelsFor(photo))),
          });
        } catch {
          rows.push({ id: photo.id, mse: null });
        }
      }
      return rows.sort((a, b) => (a.mse ?? 1e9) - (b.mse ?? 1e9));
    },
  };
}
