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
    xhr.addEventListener("abort", () =>
      reject(new Error("Upload aborted.")),
    );

    xhr.send(file);
  });
}

/**
 * Uploads one file and returns the created photo row.
 *
 * `captured_at` comes from the file's lastModified stamp, which cameras and
 * phones preserve on export. It is what the burst grouping in the grid sorts
 * and windows on; see the note in README about EXIF if your source strips it.
 */
export async function uploadPhoto(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<Photo> {
  const signResponse = await fetch("/api/upload/presigned-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type, contentLength: file.size }),
  });

  if (!signResponse.ok) {
    throw new Error(
      await readError(signResponse, "Could not get an upload URL."),
    );
  }

  const { uploadUrl, key } = (await signResponse.json()) as {
    uploadUrl: string;
    key: string;
  };

  await putToR2(uploadUrl, file, onProgress);

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

  return (await recordResponse.json()) as Photo;
}

export type UploadOutcome =
  | { file: File; ok: true; photo: Photo }
  | { file: File; ok: false; error: string };

/**
 * Uploads many files with bounded concurrency. One bad file does not sink the
 * batch — each outcome is reported independently.
 */
export async function uploadPhotos(
  files: File[],
  onFileDone?: (outcome: UploadOutcome, completed: number) => void,
): Promise<UploadOutcome[]> {
  const outcomes: UploadOutcome[] = new Array(files.length);
  let next = 0;
  let completed = 0;

  async function worker() {
    while (next < files.length) {
      const index = next++;
      const file = files[index];
      try {
        outcomes[index] = { file, ok: true, photo: await uploadPhoto(file) };
      } catch (error) {
        outcomes[index] = {
          file,
          ok: false,
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
