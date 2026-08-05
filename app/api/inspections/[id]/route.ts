import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { deleteInspectionPhoto } from "@/lib/uploads";
import { inspectionUpdateSchema } from "@/lib/schemas";
import { nowIso } from "@/lib/time";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "inspections:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare("SELECT id FROM inspections WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Denetim bulunamadı" }, { status: 404 });

    const body = await req.json();
    const parsed = inspectionUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { company_id, company_vehicle_plate, inspection_date, type, notes, result, checklist } = parsed.data;

    const fields: string[] = [];
    const args: unknown[] = [];
    if (company_id !== undefined) { fields.push("company_id = ?"); args.push(company_id); }
    if (company_vehicle_plate !== undefined) { fields.push("company_vehicle_plate = ?"); args.push(company_vehicle_plate?.trim().toUpperCase() || null); }
    if (inspection_date !== undefined) { fields.push("inspection_date = ?"); args.push(inspection_date); }
    if (type !== undefined) { fields.push("type = ?"); args.push(type); }
    if (notes !== undefined) { fields.push("notes = ?"); args.push(notes); }
    // Sonuç (geçti/kaldı/koşullu) elle değiştirildiğinde otomatik hesaplama
    // devre dışı bırakılır — staff'ın açık kararı esas alınır.
    if (result !== undefined) { fields.push("result = ?"); args.push(result); }
    if (checklist !== undefined) { fields.push("checklist_json = ?"); args.push(JSON.stringify(checklist)); }
    if (fields.length === 0) return NextResponse.json({ ok: true });

    fields.push("updated_at = ?");
    args.push(nowIso());
    args.push(id);

    await db.prepare(`UPDATE inspections SET ${fields.join(", ")} WHERE id = ?`).run(...args);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

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
