import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { deleteInspectionPhoto } from "@/lib/uploads";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "inspections:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const inspection = await db.prepare("SELECT id FROM inspections WHERE id = ?").get(id);
    if (!inspection) return NextResponse.json({ ok: false, error: "Denetim bulunamadı" }, { status: 404 });

    const photos = await db.prepare(
      "SELECT filename FROM inspection_photos WHERE inspection_id = ?"
    ).all(id) as { filename: string }[];

    for (const photo of photos) {
      await deleteInspectionPhoto(photo.filename);
    }

    await db.prepare("DELETE FROM inspection_photos WHERE inspection_id = ?").run(id);
    await db.prepare("DELETE FROM inspections WHERE id = ?").run(id);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
