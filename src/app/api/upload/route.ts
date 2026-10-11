import { NextResponse } from "next/server";
import { createImageUploadPath, STORAGE_BUCKET } from "@/lib/storage";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
]);

export async function POST(request: Request) {
  let body: { contentType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const contentType =
    typeof body.contentType === "string" ? body.contentType.toLowerCase() : "";

  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: "Unsupported image type." },
      { status: 400 }
    );
  }

  try {
    const { path, token } = await createImageUploadPath(contentType);
    return NextResponse.json({ path, token, bucket: STORAGE_BUCKET }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/upload] createSignedUploadUrl failed:", message);
    return NextResponse.json(
      { error: `Could not start upload: ${message}` },
      { status: 500 }
    );
  }
}
