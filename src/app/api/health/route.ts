import { NextResponse, connection } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  await connection();

  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const result: Record<string, unknown> = {
    url,
    hasServiceKey: Boolean(key),
    serviceKeyPrefix: key.slice(0, 8),
    projectRefFromUrl: url.replace(/^https?:\/\//, "").split(".")[0] || null,
  };

  if (key.startsWith("eyJ") && key.split(".").length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString("utf8")
      );
      result.serviceKeyRole = payload.role ?? null;
    } catch {
      result.serviceKeyRole = "unreadable";
    }
  }

  if (!url || !key) {
    result.error = "Missing Supabase env vars";
    return NextResponse.json(result);
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await sb.storage.listBuckets();
    result.buckets = error
      ? { error: error.message }
      : data?.map((b) => ({ name: b.name, public: b.public }));
  } catch (error) {
    result.buckets = { error: error instanceof Error ? error.message : String(error) };
  }

  try {
    const { error } = await sb.from("shares").select("code").limit(1);
    result.sharesTable = error ? { error: error.message } : "ok";
  } catch (error) {
    result.sharesTable = { error: error instanceof Error ? error.message : String(error) };
  }

  return NextResponse.json(result);
}
