import { mkdir, writeFile, unlink } from "fs/promises";
import { createHash } from "crypto";
import path from "path";

// public/ dizini deploy sırasında ezilebiliyor — yüklenen dosyalar ayrı,
// kalıcı bir yola yazılır. Bu yol mevcut denetim_photos Docker volume'ünün
// (data/uploads) kapsadığı ebeveyn dizinin altında olduğu için yeni bir
// volume tanımlamaya gerek yok.
const UPLOAD_ROOT = process.env.FINANS_BELGE_UPLOAD_DIR || path.join(process.cwd(), "data", "uploads", "finans-belgeler");

const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/xml": "xml",
  "text/xml": "xml",
};

export const MAX_BELGE_BYTES = 15 * 1024 * 1024; // 15MB

export function isAllowedFinansMime(mimeType: string): boolean {
  return mimeType in ALLOWED_MIME;
}

export function extForFinansMime(mimeType: string): string {
  return ALLOWED_MIME[mimeType] || "bin";
}

export function computeFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function saveFinansBelge(filename: string, buffer: Buffer): Promise<void> {
  await mkdir(UPLOAD_ROOT, { recursive: true });
  await writeFile(path.join(UPLOAD_ROOT, filename), buffer);
}

export async function readFinansBelgePath(filename: string): Promise<string> {
  return path.join(UPLOAD_ROOT, filename);
}

export async function deleteFinansBelge(filename: string): Promise<void> {
  try {
    await unlink(path.join(UPLOAD_ROOT, filename));
  } catch {
    // dosya zaten yoksa sessizce geç
  }
}

// Path traversal koruması: filename sadece uuid.ext formatında olmalı
export function isSafeFinansFilename(filename: string): boolean {
  return /^[a-f0-9-]+\.(pdf|jpg|jpeg|png|webp|xml)$/i.test(filename);
}
