/**
 * Download an image to disk.
 *
 * The images live on a different origin (R2), and browsers ignore the `download`
 * filename for cross-origin hrefs — a plain <a download> just navigates to the
 * image. So we fetch the bytes as a blob (needs the same bucket CORS that burst
 * detection relies on) and download that. If the fetch is blocked or fails, we
 * fall back to opening the image in a new tab so the user can still save it.
 */
export async function downloadPhoto(url: string): Promise<void> {
  const filename = url.split("/").pop()?.split("?")[0] || "photo.jpg";
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const objectUrl = URL.createObjectURL(await response.blob());
    triggerDownload(objectUrl, filename);
    // Revoke after the browser has had time to start the download.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

function triggerDownload(href: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
