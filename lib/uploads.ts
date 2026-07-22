import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";

// public/ dizini deploy sırasında ezilebiliyor (bkz. Dockerfile.runner),
// bu yüzden yüklenen dosyalar ayrı, kalıcı bir Docker volume'a yazılır.
const UPLOAD_ROOT = process.env.DENETIM_UPLOAD_DIR || path.join(process.cwd(), "data", "uploads", "denetim");

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB
export const MAX_PHOTOS_PER_INSPECTION = 12;

export function isAllowedImageType(mimeType: string): boolean {
  return mimeType in ALLOWED_MIME;
}

export function extForMime(mimeType: string): string {
  return ALLOWED_MIME[mimeType] || "bin";
}

export async function saveInspectionPhoto(filename: string, buffer: Buffer): Promise<void> {
  await mkdir(UPLOAD_ROOT, { recursive: true });
  await writeFile(path.join(UPLOAD_ROOT, filename), buffer);
}

export async function readInspectionPhotoPath(filename: string): Promise<string> {
  return path.join(UPLOAD_ROOT, filename);
}

export async function deleteInspectionPhoto(filename: string): Promise<void> {
  try {
    await unlink(path.join(UPLOAD_ROOT, filename));
  } catch {
    // dosya zaten yoksa sessizce geç
  }
}

// Path traversal koruması: filename sadece uuid.ext formatında olmalı
export function isSafeFilename(filename: string): boolean {
  return /^[a-f0-9-]+\.(jpg|jpeg|png|webp|heic)$/i.test(filename);
}
