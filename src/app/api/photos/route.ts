import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

import { getR2BucketName, getR2Client, publicUrlForKey } from "@/lib/r2";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Photo } from "@/lib/types";

const KEY_PATTERN = /^photos\/[0-9a-f-]{36}\.(jpg|png|webp|avif|heic)$/;

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
      r2_url: publicUrlForKey(key),
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
