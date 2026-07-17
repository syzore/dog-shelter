import { randomUUID } from "node:crypto";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";

import { getR2BucketName, getR2Client, publicUrlForKey } from "@/lib/r2";

const URL_TTL_SECONDS = 300;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
};

type Body = {
  contentType?: unknown;
  contentLength?: unknown;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { contentType, contentLength } = body;

  if (typeof contentType !== "string" || !(contentType in EXTENSION_BY_TYPE)) {
    return NextResponse.json(
      {
        error: `contentType must be one of: ${Object.keys(EXTENSION_BY_TYPE).join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (
    typeof contentLength !== "number" ||
    !Number.isInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > MAX_UPLOAD_BYTES
  ) {
    return NextResponse.json(
      { error: `contentLength must be an integer in 1..${MAX_UPLOAD_BYTES}.` },
      { status: 400 },
    );
  }

  // The client never picks the key: a caller-supplied filename could collide
  // with or overwrite an existing object.
  const key = `photos/${randomUUID()}.${EXTENSION_BY_TYPE[contentType]}`;

  // ContentType and ContentLength are part of the signature, so the presigned
  // URL can only be used to upload an image of exactly the declared size.
  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    { expiresIn: URL_TTL_SECONDS },
  );

  return NextResponse.json({
    uploadUrl,
    key,
    publicUrl: publicUrlForKey(key),
  });
}
