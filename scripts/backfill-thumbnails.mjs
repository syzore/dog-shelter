/**
 * Generate and upload thumbnails for photos that don't have one yet.
 *
 * Thumbnails are created for new uploads automatically; this backfills the
 * ones that predate that. Idempotent — it skips any photo whose thumb already
 * exists, so it's safe to re-run and to interrupt.
 *
 *   node scripts/backfill-thumbnails.mjs [--limit N]
 *
 * Reads credentials from .env.local.
 */
import { readFileSync } from "node:fs";

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

const THUMB_MAX_DIM = 480;
const THUMB_QUALITY = 72;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const limitArg = process.argv.indexOf("--limit");
const limit = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});
const bucket = env.R2_BUCKET_NAME;

function keyFromUrl(r2Url) {
  return new URL(r2Url).pathname.slice(1); // photos/<name>.<ext>
}
function thumbKeyFromKey(key) {
  return key.replace(/^photos\/(.+)\.[^.]+$/, "photos/thumb/$1.jpg");
}

async function objectExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/photos?select=id,r2_url&order=captured_at.asc`,
    {
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
    },
  );
  const photos = await res.json();
  console.log(`${photos.length} photos total. Limit: ${limit}.`);

  let done = 0;
  let skipped = 0;
  let failed = 0;
  for (const photo of photos) {
    if (done + skipped >= limit) break;
    const key = keyFromUrl(photo.r2_url);
    const thumbKey = thumbKeyFromKey(key);
    try {
      if (await objectExists(thumbKey)) {
        skipped++;
        continue;
      }
      const original = await fetch(photo.r2_url);
      if (!original.ok) throw new Error(`download HTTP ${original.status}`);
      const buffer = Buffer.from(await original.arrayBuffer());
      const thumb = await sharp(buffer)
        .resize(THUMB_MAX_DIM, THUMB_MAX_DIM, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: THUMB_QUALITY })
        .toBuffer();
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: thumbKey,
          Body: thumb,
          ContentType: "image/jpeg",
        }),
      );
      done++;
      console.log(`✓ ${thumbKey} (${Math.round(thumb.length / 1024)}KB)`);
    } catch (error) {
      failed++;
      console.log(`✗ ${key}: ${error.message}`);
    }
  }
  console.log(`\nDone. Created ${done}, skipped ${skipped}, failed ${failed}.`);
}

main();
