import { NextResponse } from "next/server";
import { createShare } from "@/lib/storage";

const MAX_TEXT_LENGTH = 20_000;

export async function POST(request: Request) {
  let body: { type?: unknown; content?: unknown; path?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { type, content, path } = body;

  if (type !== "text" && type !== "image") {
    return NextResponse.json(
      { error: "Type must be 'text' or 'image'." },
      { status: 400 }
    );
  }

  try {
    if (type === "text") {
      if (typeof content !== "string" || content.length === 0) {
        return NextResponse.json(
          { error: "Content is required." },
          { status: 400 }
        );
      }
      if (content.length > MAX_TEXT_LENGTH) {
        return NextResponse.json(
          { error: `Text is too long (max ${MAX_TEXT_LENGTH} characters).` },
          { status: 413 }
        );
      }
      const record = await createShare("text", content);
      return NextResponse.json(
        { code: record.code, type: record.type, expiresAt: record.expiresAt },
        { status: 201 }
      );
    }

    if (typeof path !== "string" || !/^[A-Za-z0-9._-]{1,80}\.[a-z0-9]+$/.test(path)) {
      return NextResponse.json({ error: "Invalid image path." }, { status: 400 });
    }
    const record = await createShare("image", path);
    return NextResponse.json(
      { code: record.code, type: record.type, expiresAt: record.expiresAt },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Could not create share." },
      { status: 500 }
    );
  }
}
