import { promises as fs } from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";

export const SHARE_TTL_MS = 60 * 60 * 1000; // 1 hour

export type ShareType = "text" | "image";

export interface ShareRecord {
  code: string;
  type: ShareType;
  content: string;
  createdAt: number;
  expiresAt: number;
}

const DATA_DIR = path.join(process.cwd(), "data");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function fileFor(code: string): string {
  return path.join(DATA_DIR, `${code}.json`);
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function randomCode(length = CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = randomCode();
    if (!(await exists(fileFor(code)))) return code;
  }
  return randomCode(10);
}

export async function createShare(
  type: ShareType,
  content: string
): Promise<ShareRecord> {
  await ensureDataDir();
  const code = await generateUniqueCode();
  const now = Date.now();
  const record: ShareRecord = {
    code,
    type,
    content,
    createdAt: now,
    expiresAt: now + SHARE_TTL_MS,
  };
  await fs.writeFile(fileFor(code), JSON.stringify(record), "utf8");
  return record;
}

export async function getShare(
  code: string
): Promise<{ record?: ShareRecord; expired: boolean }> {
  try {
    const raw = await fs.readFile(fileFor(code), "utf8");
    const record = JSON.parse(raw) as ShareRecord;
    if (Date.now() >= record.expiresAt) {
      await deleteShare(code);
      return { expired: true };
    }
    return { record, expired: false };
  } catch {
    return { expired: false };
  }
}

export async function deleteShare(code: string): Promise<void> {
  try {
    await fs.unlink(fileFor(code));
  } catch {
    // ignore missing file
  }
}
