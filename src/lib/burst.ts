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
 * MSE over 0-255 grayscale values, so the range is 0..65025. Identical frames
 * score ~0; the same scene re-framed scores in the low hundreds; different
 * scenes score in the thousands. 1000 keeps "same dog, slight motion" while
 * rejecting a genuinely new composition.
 */
const MSE_THRESHOLD = 1000;

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

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Required to read pixels back from a cross-origin (R2) image. Only works
    // if the bucket sends Access-Control-Allow-Origin; see README.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          "Could not load a photo for comparison — usually missing CORS on the R2 bucket (see README).",
        ),
      );
    image.src = url;
  });
}

/** Downsample to SIZE x SIZE and reduce to per-pixel luminance. */
async function grayscalePixels(url: string): Promise<Float32Array> {
  const image = await loadImage(url);
  const { ctx } = getCanvas();
  ctx.drawImage(image, 0, 0, SIZE, SIZE);
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
    cached = grayscalePixels(photo.r2_url);
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
 * Comparisons run in parallel; a photo that fails to load is skipped rather
 * than failing the whole gesture.
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
  const matches = await Promise.allSettled(
    candidates.map(async (candidate) => ({
      id: candidate.id,
      mse: meanSquaredError(anchorPixels, await pixelsFor(candidate)),
    })),
  );

  const ids = [anchor.id];
  let failures = 0;
  for (const result of matches) {
    if (result.status === "rejected") failures++;
    else if (result.value.mse <= MSE_THRESHOLD) ids.push(result.value.id);
  }
  return { ids, failures };
}

// Dev-only console handle for exercising the canvas pipeline directly;
// stripped from production bundles.
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as unknown as Record<string, unknown>).__burst = {
    findBurst,
    meanSquaredError,
  };
}
