import { NextRequest, NextResponse } from "next/server";
import { requirePortalUser } from "@/lib/portal-auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import {
  isAllowedCustomerInspectionFileType,
  extForCustomerInspectionMime,
  saveCustomerInspectionFile,
  MAX_CUSTOMER_INSPECTION_FILE_BYTES,
  MAX_CUSTOMER_INSPECTION_FILES_PER_SUBMISSION,
} from "@/lib/uploads";

export async function GET(_req: NextRequest) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const db = getDb();
    const submissions = await db.prepare(
      `SELECT s.*, cu.full_name AS olusturan
       FROM customer_inspection_submissions s
       JOIN customer_users cu ON cu.id = s.created_by
       WHERE s.company_id = ?
       ORDER BY s.created_at DESC`
    ).all<any>(portalUser.company_id);

    const files = await db.prepare(
      `SELECT f.* FROM customer_inspection_files f
       JOIN customer_inspection_submissions s ON s.id = f.submission_id
       WHERE s.company_id = ?`
    ).all<any>(portalUser.company_id);

    const bySubmission = new Map<string, any[]>();
    for (const f of files) {
      const list = bySubmission.get(f.submission_id) ?? [];
      list.push(f);
      bySubmission.set(f.submission_id, list);
    }

    // Personelin Seri Denetim ile yaptığı TÜM resmi denetimler — sadece
    // müşteri gönderimine linked_inspection_id ile bağlı olanlar değil,
    // personelin bağımsız yaptığı denetimler de dahil (bkz. patron geri
    // bildirimi: "operasyon tarafında yapılan denetimler ayrı görülebilsin").
    const companyInspections = await db.prepare(
      `SELECT i.id, i.company_vehicle_plate, i.inspection_date, i.type, i.result, i.checklist_json, i.notes,
              u.full_name AS inspector_name
       FROM inspections i
       LEFT JOIN users u ON u.id = i.inspector_id
       WHERE i.company_id = ?
       ORDER BY i.inspection_date DESC, i.created_at DESC`
    ).all<any>(portalUser.company_id);

    const inspectionIds = companyInspections.map(i => i.id);
    const photosByInspection = new Map<string, any[]>();
    if (inspectionIds.length > 0) {
      const placeholders = inspectionIds.map(() => "?").join(",");
      const photos = await db.prepare(
        `SELECT id, inspection_id, filename, criterion_index FROM inspection_photos WHERE inspection_id IN (${placeholders})`
      ).all<any>(...inspectionIds);
      for (const p of photos) {
        const list = photosByInspection.get(p.inspection_id) ?? [];
        list.push(p);
        photosByInspection.set(p.inspection_id, list);
      }
    }

    const allInspById = new Map<string, any>();
    const staffInspectionsByPlate = new Map<string, any[]>();
    for (const i of companyInspections) {
      const full = {
        ...i,
        checklist: i.checklist_json ? JSON.parse(i.checklist_json) : null,
        photos: photosByInspection.get(i.id) ?? [],
      };
      allInspById.set(i.id, full);
      const plate = (i.company_vehicle_plate || "").toUpperCase();
      if (plate) {
        const list = staffInspectionsByPlate.get(plate) ?? [];
        list.push(full);
        staffInspectionsByPlate.set(plate, list);
      }
    }

    const data = submissions.map(s => ({
      ...s,
      files: bySubmission.get(s.id) ?? [],
      linked_inspection: s.linked_inspection_id ? allInspById.get(s.linked_inspection_id) ?? null : null,
    }));

    const staff_inspections = Object.fromEntries(staffInspectionsByPlate);
    return NextResponse.json({ ok: true, data, staff_inspections });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const portalUser = await requirePortalUser();
    if (!portalUser) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const formData = await req.formData();
    const title = (formData.get("title") as string | null)?.trim();
    const inspection_date = (formData.get("inspection_date") as string | null)?.trim();
    const note = (formData.get("note") as string | null)?.trim() || null;
    const plate = (formData.get("plate") as string | null)?.trim().toUpperCase();
    const company_vehicle_id = (formData.get("company_vehicle_id") as string | null) || null;
    const type = (formData.get("type") as string | null) || null;
    const checklistRaw = (formData.get("checklist") as string | null) || null;
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);

    let checklist: { label: string; ok: boolean | null; note?: string }[] | null = null;
    if (checklistRaw) {
      try { checklist = JSON.parse(checklistRaw); } catch { checklist = null; }
    }

    if (!title || !inspection_date || !plate) {
      return NextResponse.json({ ok: false, error: "Başlık, tarih ve plaka zorunludur" }, { status: 400 });
    }
    if (files.length === 0 && (!checklist || checklist.length === 0)) {
      return NextResponse.json({ ok: false, error: "En az bir dosya ekleyin veya checklist doldurun" }, { status: 400 });
    }
    if (files.length > MAX_CUSTOMER_INSPECTION_FILES_PER_SUBMISSION) {
      return NextResponse.json({ ok: false, error: `En fazla ${MAX_CUSTOMER_INSPECTION_FILES_PER_SUBMISSION} dosya eklenebilir` }, { status: 400 });
    }
    for (const file of files) {
      if (!isAllowedCustomerInspectionFileType(file.type))
        return NextResponse.json({ ok: false, error: `Desteklenmeyen dosya türü: ${file.type}` }, { status: 400 });
      if (file.size > MAX_CUSTOMER_INSPECTION_FILE_BYTES)
        return NextResponse.json({ ok: false, error: "Dosya 8MB'ı geçemez" }, { status: 400 });
    }

    const db = getDb();
    const now = nowIso();
    const id = uuidv4();
    await db.prepare(
      `INSERT INTO customer_inspection_submissions
         (id, company_id, company_vehicle_id, plate, type, title, inspection_date, note, checklist_json, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'yeni', ?, ?, ?)`
    ).run(id, portalUser.company_id, company_vehicle_id, plate, type, title, inspection_date, note,
      checklist ? JSON.stringify(checklist) : null, portalUser.id, now, now);

    for (const file of files) {
      const filename = `${uuidv4()}.${extForCustomerInspectionMime(file.type)}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await saveCustomerInspectionFile(filename, buffer);
      await db.prepare(
        `INSERT INTO customer_inspection_files (id, submission_id, filename, original_name, mime_type, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), id, filename, file.name, file.type, file.size, now);
    }

    // İç tarafta denetim yetkisi olan herkese bildirim
    const evaluators = await db.prepare(
      `SELECT DISTINCT u.id FROM users u
       JOIN role_permissions rp ON rp.role_name = u.role
       WHERE rp.permission_key = 'inspections:read' AND u.is_active = 1`
    ).all<{ id: string }>();
    for (const ev of evaluators) {
      await db.prepare(
        `INSERT INTO notifications (id, user_id, title, body, link, is_read, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
      ).run(uuidv4(), ev.id, `Müşteri denetimi yüklendi: ${plate}`, title, "/denetimler", portalUser.id, now, now);
    }

    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
