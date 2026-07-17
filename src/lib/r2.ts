import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

import { requireEnv } from "@/lib/env";

let cached: S3Client | null = null;

/**
 * S3-compatible client pointed at Cloudflare R2.
 *
 * R2 ignores regions but the SDK requires one, hence "auto".
 */
export function getR2Client(): S3Client {
  if (!cached) {
    const accountId = requireEnv("R2_ACCOUNT_ID", process.env.R2_ACCOUNT_ID);
    cached = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv(
          "R2_ACCESS_KEY_ID",
          process.env.R2_ACCESS_KEY_ID,
        ),
        secretAccessKey: requireEnv(
          "R2_SECRET_ACCESS_KEY",
          process.env.R2_SECRET_ACCESS_KEY,
        ),
      },
    });
  }
  return cached;
}

export function getR2BucketName(): string {
  return requireEnv("R2_BUCKET_NAME", process.env.R2_BUCKET_NAME);
}

/**
 * Public URL an uploaded object is readable at, for storing in `photos.r2_url`.
 */
export function publicUrlForKey(key: string): string {
  const base = requireEnv(
    "NEXT_PUBLIC_R2_PUBLIC_URL",
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
  ).replace(/\/+$/, "");
  return `${base}/${key}`;
}
