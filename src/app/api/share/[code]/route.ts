import { NextResponse } from "next/server";
import { getShare } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.trim().toUpperCase();

  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code." }, { status: 400 });
  }

  const { record, expired } = await getShare(code);

  if (expired) {
    return NextResponse.json(
      { error: "This share has expired." },
      { status: 410 }
    );
  }

  if (!record) {
    return NextResponse.json({ error: "Code not found." }, { status: 404 });
  }

  return NextResponse.json(
    {
      code: record.code,
      type: record.type,
      content: record.content,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
