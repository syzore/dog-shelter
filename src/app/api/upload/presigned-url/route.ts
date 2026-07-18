import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";

import {
  ACCEPTED_CONTENT_TYPES,
  EXTENSION_BY_TYPE,
  objectKeyFor,
  SHA256_HEX,
  thumbKeyFor,
} from "@/lib/imageTypes";
import { getR2BucketName, getR2Client, publicUrlForKey } from "@/lib/r2";

const URL_TTL_SECONDS = 300;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type Body = {
  contentType?: unknown;
  contentLength?: unknown;
  sha256?: unknown;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { contentType, contentLength, sha256 } = body;

  if (typeof contentType !== "string" || !(contentType in EXTENSION_BY_TYPE)) {
    return NextResponse.json(
      { error: `contentType must be one of: ${ACCEPTED_CONTENT_TYPES.join(", ")}` },
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

  // The key is derived from the caller's content hash, not a caller-supplied
  // name — so it can't traverse paths, and re-uploading identical bytes just
  // re-writes the same object.
  if (typeof sha256 !== "string" || !SHA256_HEX.test(sha256)) {
    return NextResponse.json(
      { error: "sha256 must be a 64-character hex digest." },
      { status: 400 },
    );
  }

  const key = objectKeyFor(sha256, contentType);
  if (!key) {
    return NextResponse.json({ error: "Unsupported content type." }, { status: 400 });
  }

  // ContentType and ContentLength are part of the signature, so the presigned
  // URL can only be used to upload an image of exactly the declared size.
  // The thumbnail URL is signed to the thumb key as a JPEG; its size isn't
  // known here (the client generates it), so only the type is constrained.
  const [uploadUrl, thumbUploadUrl] = await Promise.all([
    getSignedUrl(
      getR2Client(),
      new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
      { expiresIn: URL_TTL_SECONDS },
    ),
    getSignedUrl(
      getR2Client(),
      new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: thumbKeyFor(sha256),
        ContentType: "image/jpeg",
      }),
      { expiresIn: URL_TTL_SECONDS },
    ),
  ]);

  return NextResponse.json({
    uploadUrl,
    thumbUploadUrl,
    key,
    publicUrl: publicUrlForKey(key),
  });
}
