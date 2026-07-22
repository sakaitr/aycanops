import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import {
  isAllowedImageType,
  extForMime,
  saveInspectionPhoto,
  deleteInspectionPhoto,
  isSafeFilename,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_INSPECTION,
} from "@/lib/uploads";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "inspections:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const data = await db.prepare(
      "SELECT id, filename, created_at FROM inspection_photos WHERE inspection_id = ? ORDER BY created_at ASC"
    ).all(id);
    return NextResponse.json({ ok: true, data });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "inspections:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();

    const inspection = await db.prepare("SELECT id FROM inspections WHERE id = ?").get(id);
    if (!inspection) return NextResponse.json({ ok: false, error: "Denetim bulunamadı" }, { status: 404 });

    const countRow = await db.prepare(
      "SELECT COUNT(*) AS total FROM inspection_photos WHERE inspection_id = ?"
    ).get(id) as { total: number };

    const formData = await req.formData();
    const files = formData.getAll("photos").filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ ok: false, error: "Fotoğraf bulunamadı" }, { status: 400 });

    if (Number(countRow.total) + files.length > MAX_PHOTOS_PER_INSPECTION) {
      return NextResponse.json(
        { ok: false, error: `Bir denetime en fazla ${MAX_PHOTOS_PER_INSPECTION} fotoğraf eklenebilir` },
        { status: 400 }
      );
    }

    const now = nowIso();
    const created: { id: string; filename: string }[] = [];

    for (const file of files) {
      if (!isAllowedImageType(file.type)) {
        return NextResponse.json({ ok: false, error: `Desteklenmeyen dosya türü: ${file.type}` }, { status: 400 });
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return NextResponse.json({ ok: false, error: "Fotoğraf 8MB'ı geçemez" }, { status: 400 });
      }

      const filename = `${uuidv4()}.${extForMime(file.type)}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await saveInspectionPhoto(filename, buffer);

      const photoId = uuidv4();
      await db.prepare(
        "INSERT INTO inspection_photos (id, inspection_id, filename, created_by, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(photoId, id, filename, user.id, now);
      created.push({ id: photoId, filename });
    }

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "inspections:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const photoId = searchParams.get("photo_id");
    if (!photoId) return NextResponse.json({ ok: false, error: "photo_id gerekli" }, { status: 400 });

    const db = getDb();
    const photo = await db.prepare(
      "SELECT filename FROM inspection_photos WHERE id = ? AND inspection_id = ?"
    ).get(photoId, id) as { filename: string } | undefined;
    if (!photo) return NextResponse.json({ ok: false, error: "Fotoğraf bulunamadı" }, { status: 404 });
    if (!isSafeFilename(photo.filename)) {
      return NextResponse.json({ ok: false, error: "Geçersiz dosya adı" }, { status: 400 });
    }

    await db.prepare("DELETE FROM inspection_photos WHERE id = ?").run(photoId);
    await deleteInspectionPhoto(photo.filename);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
