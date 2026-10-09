import { NextResponse } from "next/server";
import { createShare, type ShareType } from "@/lib/storage";

const MAX_TEXT_LENGTH = 20_000;
const MAX_IMAGE_CHARS = 8_000_000; // ~6MB binary
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml);base64,/i;

export async function POST(request: Request) {
  let body: { type?: unknown; content?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { type, content } = body;

  if (type !== "text" && type !== "image") {
    return NextResponse.json(
      { error: "Type must be 'text' or 'image'." },
      { status: 400 }
    );
  }

  if (typeof content !== "string" || content.length === 0) {
    return NextResponse.json({ error: "Content is required." }, { status: 400 });
  }

  if (type === "text" && content.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Text is too long (max ${MAX_TEXT_LENGTH} characters).` },
      { status: 413 }
    );
  }

  if (type === "image") {
    if (!IMAGE_DATA_URL.test(content)) {
      return NextResponse.json(
        { error: "Invalid image data." },
        { status: 400 }
      );
    }
    if (content.length > MAX_IMAGE_CHARS) {
      return NextResponse.json(
        { error: "Image is too large (max ~6MB)." },
        { status: 413 }
      );
    }
  }

  const record = await createShare(type as ShareType, content);

  return NextResponse.json(
    { code: record.code, type: record.type, expiresAt: record.expiresAt },
    { status: 201 }
  );
}
