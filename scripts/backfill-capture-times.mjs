/**
 * Rewrite photos.captured_at from each image's real EXIF capture time.
 *
 * Early uploads stored file.lastModified, which is the export/download time —
 * hundreds of photos land within seconds of each other, so the grid order and
 * burst time-windows are meaningless. This reads EXIF DateTimeOriginal instead.
 *
 *   node scripts/backfill-capture-times.mjs [--limit N] [--dry]
 *
 * Cheap: EXIF lives in the file header, so it fetches only the first 64KB of
 * each original via a Range request. Reads credentials from .env.local.
 */
import { readFileSync } from "node:fs";

import exifr from "exifr";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const limitArg = process.argv.indexOf("--limit");
const limit = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : Infinity;
const dry = process.argv.includes("--dry");

const supabaseHeaders = {
  apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
};

// Keep this identical to exifDateToIso in src/lib/imageTypes.ts so backfilled
// photos and new uploads land on the same timeline.
function exifDateToIso(raw) {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

async function exifCaptureTime(r2Url) {
  const resp = await fetch(r2Url, { headers: { Range: "bytes=0-65535" } });
  if (!resp.ok && resp.status !== 206) throw new Error(`download HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const parsed = await exifr.parse(buf, { pick: ["DateTimeOriginal"], reviveValues: false });
  return exifDateToIso(parsed?.DateTimeOriginal);
}

async function main() {
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/photos?select=id,r2_url,captured_at`,
    { headers: supabaseHeaders },
  );
  const photos = await res.json();
  console.log(`${photos.length} photos.${dry ? " (dry run)" : ""} Limit: ${limit}.`);

  let updated = 0, unchanged = 0, noExif = 0, failed = 0;
  for (const photo of photos) {
    if (updated + unchanged + noExif + failed >= limit) break;
    try {
      const taken = await exifCaptureTime(photo.r2_url);
      if (!taken) { noExif++; console.log(`- no EXIF: ${photo.id}`); continue; }
      if (new Date(taken).getTime() === new Date(photo.captured_at).getTime()) {
        unchanged++;
        continue;
      }
      if (!dry) {
        const patch = await fetch(
          `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/photos?id=eq.${photo.id}`,
          {
            method: "PATCH",
            headers: { ...supabaseHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ captured_at: taken }),
          },
        );
        if (!patch.ok) throw new Error(`PATCH HTTP ${patch.status}`);
      }
      updated++;
      console.log(`✓ ${photo.captured_at} -> ${taken}`);
    } catch (error) {
      failed++;
      console.log(`✗ ${photo.id}: ${error.message}`);
    }
  }
  console.log(`\nDone. Updated ${updated}, unchanged ${unchanged}, no-EXIF ${noExif}, failed ${failed}.`);
}

main();
