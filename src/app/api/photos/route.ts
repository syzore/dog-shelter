import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

import { getR2BucketName, getR2Client, publicUrlForKey } from "@/lib/r2";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Photo } from "@/lib/types";

// Content-addressed keys are photos/<64-hex>.<ext>; the older 36-char uuid
// form is still accepted so rows written before content-addressing keep working.
const KEY_PATTERN = /^photos\/([0-9a-f]{64}|[0-9a-f-]{36})\.(jpg|png|webp|avif|heic)$/;

type Body = {
  key?: unknown;
  capturedAt?: unknown;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { key, capturedAt } = body;

  if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }

  if (typeof capturedAt !== "string" || Number.isNaN(Date.parse(capturedAt))) {
    return NextResponse.json(
      { error: "capturedAt must be an ISO 8601 timestamp." },
      { status: 400 },
    );
  }

  const r2Url = publicUrlForKey(key);

  // Content-addressed keys mean an identical image already in the DB has this
  // same URL. Short-circuit so a race (or a retried request) can't create a
  // duplicate row. The client pre-checks too, before ever uploading.
  const existing = await getSupabaseAdmin()
    .from("photos")
    .select("id")
    .eq("r2_url", r2Url)
    .limit(1)
    .maybeSingle();
  if (existing.data) {
    return NextResponse.json({ duplicate: true }, { status: 200 });
  }

  // Confirm the upload actually landed before recording a row for it, so a
  // failed or abandoned PUT can't leave a photo pointing at a 404.
  try {
    await getR2Client().send(
      new HeadObjectCommand({ Bucket: getR2BucketName(), Key: key }),
    );
  } catch {
    return NextResponse.json(
      { error: "No uploaded object found for that key." },
      { status: 409 },
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("photos")
    .insert({
      r2_url: r2Url,
      captured_at: new Date(capturedAt).toISOString(),
      dog_id: null,
      is_used: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as Photo, { status: 201 });
}
