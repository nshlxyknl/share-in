import { randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SHARE_TTL_MS = 60 * 60 * 1000; // 1 hour
export const STORAGE_BUCKET = "shares";

export type ShareType = "text" | "image";

export interface ShareRecord {
  code: string;
  type: ShareType;
  content: string;
  createdAt: number;
  expiresAt: number;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const TABLE = "shares";

interface ShareRow {
  code: string;
  type: ShareType;
  content: string | null;
  path: string | null;
  created_at: string;
  expires_at: string;
}

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let admin: SupabaseClient | null = null;

function getAdmin(): SupabaseClient {
  if (!admin) {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error(
        "Supabase is not configured. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY."
      );
    }
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

function randomCode(length = CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

function extensionFor(contentType: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/svg+xml": ".svg",
  };
  return map[contentType.toLowerCase()] ?? ".bin";
}

function toRecord(row: ShareRow, content: string): ShareRecord {
  return {
    code: row.code,
    type: row.type,
    content,
    createdAt: Date.parse(row.created_at),
    expiresAt: Date.parse(row.expires_at),
  };
}

async function generateUniqueCode(): Promise<string> {
  const sb = getAdmin();
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = randomCode();
    const { data, error } = await sb
      .from(TABLE)
      .select("code")
      .eq("code", code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return code;
  }
  return randomCode(10);
}

async function signImageUrl(path: string, expiresAt: number): Promise<string> {
  const sb = getAdmin();
  const remaining = Math.max(
    60,
    Math.min(3600, Math.ceil((expiresAt - Date.now()) / 1000))
  );
  const { data, error } = await sb.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, remaining);
  if (error) throw error;
  return data.signedUrl;
}

/** Creates a signed URL the browser can upload to directly, bypassing the server. */
export async function createImageUploadPath(
  contentType: string
): Promise<{ path: string; token: string }> {
  const sb = getAdmin();
  const path = `${randomCode(12)}${extensionFor(contentType)}`;
  const { data, error } = await sb.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(path);
  if (error) throw error;
  return { path: data.path, token: data.token };
}

export async function createShare(
  type: ShareType,
  content: string
): Promise<ShareRecord> {
  const sb = getAdmin();
  const code = await generateUniqueCode();
  const now = Date.now();
  const expiresAt = now + SHARE_TTL_MS;

  const { error } = await sb.from(TABLE).insert({
    code,
    type,
    content: type === "text" ? content : null,
    path: type === "image" ? content : null,
    expires_at: new Date(expiresAt).toISOString(),
  });
  if (error) throw error;

  return { code, type, content, createdAt: now, expiresAt };
}

export async function getShare(
  code: string
): Promise<{ record?: ShareRecord; expired: boolean }> {
  const sb = getAdmin();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("code", code)
    .maybeSingle<ShareRow>();
  if (error) throw error;
  if (!data) return { expired: false };

  const expiresAt = Date.parse(data.expires_at);
  if (Date.now() >= expiresAt) {
    await deleteShare(code);
    return { expired: true };
  }

  if (data.type === "image") {
    const content = await signImageUrl(data.path ?? "", expiresAt);
    return { record: toRecord(data, content), expired: false };
  }
  return { record: toRecord(data, data.content ?? ""), expired: false };
}

export async function deleteShare(code: string): Promise<void> {
  const sb = getAdmin();
  const { data } = await sb
    .from(TABLE)
    .select("path")
    .eq("code", code)
    .maybeSingle<{ path: string | null }>();
  if (data?.path) {
    await sb.storage.from(STORAGE_BUCKET).remove([data.path]);
  }
  await sb.from(TABLE).delete().eq("code", code);
}

/** Deletes every expired share and its stored image. Used by the cleanup cron. */
export async function deleteExpiredShares(): Promise<number> {
  const sb = getAdmin();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from(TABLE)
    .select("code, path")
    .lt("expires_at", now);
  if (error) throw error;
  if (!data || data.length === 0) return 0;

  const paths = data
    .map((row) => (row as { path: string | null }).path)
    .filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    await sb.storage.from(STORAGE_BUCKET).remove(paths);
  }
  await sb.from(TABLE).delete().lt("expires_at", now);
  return data.length;
}
