import { NextResponse } from "next/server";
import { deleteExpiredShares } from "@/lib/storage";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  try {
    const removed = await deleteExpiredShares();
    return NextResponse.json({ removed });
  } catch {
    return NextResponse.json({ error: "Cleanup failed." }, { status: 500 });
  }
}
