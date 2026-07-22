import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { inspectionCreateSchema } from "@/lib/schemas";
import { sendPushToUser } from "@/lib/push";
import { sendWhatsAppToUser } from "@/lib/whatsapp";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "inspections:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const vehicle_id = searchParams.get("vehicle_id");
    const company_id = searchParams.get("company_id");
    const db = getDb();
    let sql = `SELECT i.*, v.plate as vehicle_plate, v.brand, v.model,
                      u.full_name as inspector_name,
                      i.company_vehicle_plate,
                      cv.company_id,
                      c.name as company_name
               FROM inspections i
               LEFT JOIN vehicles v ON v.id = i.vehicle_id
               LEFT JOIN company_vehicles cv ON cv.id = i.company_vehicle_id
               LEFT JOIN companies c ON c.id = cv.company_id
               LEFT JOIN users u ON u.id = i.inspector_id
               WHERE 1=1`;
    const args: unknown[] = [];
    if (vehicle_id) { sql += " AND i.vehicle_id = ?"; args.push(vehicle_id); }
    if (company_id) { sql += " AND cv.company_id = ?"; args.push(company_id); }
    sql += " ORDER BY i.inspection_date DESC, i.created_at DESC";
    const data = await db.prepare(sql).all(...args);
    return NextResponse.json({ ok: true, data });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "inspections:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const body = await req.json();
    const parsed = inspectionCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { vehicle_id, company_vehicle_id, company_vehicle_plate, company_id, inspection_date, type, result, checklist, notes } = parsed.data;
    if (!vehicle_id && !company_vehicle_id && !company_vehicle_plate)
      return NextResponse.json({ ok: false, error: "Araç seçimi zorunlu" }, { status: 400 });

    const db = getDb();
    const now = nowIso();
    const id = uuidv4();

    // Auto-compute result from checklist
    const items: { ok: boolean | null; note?: string }[] = checklist || [];
    const allEvaluated = items.length > 0 && items.every(c => c.ok !== null);
    const anyFail = items.some(c => c.ok === false);
    const anyFailWithNote = items.some(c => c.ok === false && c.note?.trim());

    let autoResult = result || "pending";
    if (allEvaluated) {
      if (!anyFail) {
        autoResult = "pass";
      } else if (anyFailWithNote && result === "conditional") {
        autoResult = "conditional";
      } else {
        autoResult = "fail";
      }
    }

    // Resolve or create vehicle record for company vehicles (needed for FK)
    let resolvedVehicleId = vehicle_id || null;
    let resolvedCompVehicleId = company_vehicle_id || null;
    let compVehiclePlate: string | null = company_vehicle_plate?.trim().toUpperCase() || null;
    // company_id: serbest plaka modunda doğrudan payload'dan gelir; firma
    // aracı modunda company_vehicles'tan çözülür (aşağıda doldurulur) —
    // her iki modda da firma bazlı raporların bu kaydı görebilmesi için
    // inspections.company_id kolonuna yazılır (bkz. migration 079).
    let resolvedCompanyId: string | null = company_id || null;

    if (company_vehicle_id && !vehicle_id) {
      const cv = await db.prepare("SELECT * FROM company_vehicles WHERE id = ?").get(company_vehicle_id) as { plate: string; company_id: string } | undefined;
      if (!cv) return NextResponse.json({ ok: false, error: "Firma aracı bulunamadı" }, { status: 404 });
      compVehiclePlate = cv.plate;
      resolvedCompanyId = cv.company_id;

      // Find or create in vehicles table so FK is satisfied
      try {
        const existing = await db.prepare("SELECT id FROM vehicles WHERE plate = ?").get(cv.plate) as { id: string } | undefined;
        if (existing) {
          resolvedVehicleId = existing.id;
        } else {
          const newVid = uuidv4();
          await db.prepare(
            `INSERT INTO vehicles (id, plate, type, capacity, status_code, created_by, created_at, updated_at)
             VALUES (?, ?, 'minibus', 0, 'active', ?, ?, ?)`
          ).run(newVid, cv.plate, user.id, now, now);
          resolvedVehicleId = newVid;
        }
      } catch {
        // vehicles lookup/insert failed — vehicle_id will be null (migration 030 makes it nullable)
        resolvedVehicleId = null;
      }
    }

    // Free-text plate mode: no vehicle FK, store plate directly
    if (!company_vehicle_id && !vehicle_id && compVehiclePlate) {
      resolvedVehicleId = null;
      resolvedCompVehicleId = null;
    }

    await db.prepare(
      `INSERT INTO inspections (id, vehicle_id, company_vehicle_id, company_vehicle_plate, company_id, inspection_date, inspector_id, type, result, checklist_json, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, resolvedVehicleId, resolvedCompVehicleId, compVehiclePlate, resolvedCompanyId,
      inspection_date, user.id, type || "routine", autoResult,
      checklist ? JSON.stringify(checklist) : null, notes || null, now, now);

    // Auto-create task + notification for company responsible when inspection fails
    if (autoResult === "fail" || autoResult === "conditional") {
      let responsibleId: string | null = null;
      let companyName = "";

      if (resolvedCompVehicleId) {
        const cv = await db.prepare(
          `SELECT c.responsible_id, c.name FROM company_vehicles cv JOIN companies c ON c.id = cv.company_id WHERE cv.id = ?`
        ).get(resolvedCompVehicleId) as { responsible_id: string | null; name: string } | undefined;
        responsibleId = cv?.responsible_id ?? null;
        companyName = cv?.name ?? "";
      } else if (resolvedCompanyId) {
        const c = await db.prepare(
          `SELECT responsible_id, name FROM companies WHERE id = ?`
        ).get(resolvedCompanyId) as { responsible_id: string | null; name: string } | undefined;
        responsibleId = c?.responsible_id ?? null;
        companyName = c?.name ?? "";
      }

      if (responsibleId) {
        const plateDisplay = compVehiclePlate || "—";
        const taskTitle = `Denetim sorunu: ${plateDisplay}`;
        const failedItems = (items as { ok: boolean | null; label?: string; note?: string }[])
          .filter(c => c.ok === false);
        const failedDesc = failedItems
          .map(c => `• ${c.label || "?"}${c.note ? ": " + c.note : ""}`)
          .join("\n");
        const description = [
          `Firma: ${companyName}`,
          `Denetim Tarihi: ${inspection_date}`,
          `Sonuç: ${autoResult === "fail" ? "Başarısız" : "Koşullu"}`,
          failedDesc ? `\nBaşarısız Kriterler:\n${failedDesc}` : "",
          notes ? `\nNot: ${notes}` : "",
        ].filter(Boolean).join("\n");

        const todoId = uuidv4();
        await db.prepare(
          `INSERT INTO todos (id, title, description, status_code, priority_code, assigned_to, created_by, department_id, due_date, reminder_daily_max, created_at, updated_at)
           VALUES (?, ?, ?, 'todo', 'high', ?, ?, NULL, NULL, 4, ?, ?)`
        ).run(todoId, taskTitle, description, responsibleId, user.id, now, now);

        const notifId = uuidv4();
        await db.prepare(
          `INSERT INTO notifications (id, user_id, title, body, link, is_read, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
        ).run(notifId, responsibleId, `Denetim başarısız: ${plateDisplay}`,
          description.slice(0, 500), "/gorevler", user.id, now, now);

        // Push + WhatsApp notification
        sendPushToUser(responsibleId, {
          title: `Denetim başarısız: ${plateDisplay}`,
          body: `Firma: ${companyName}`,
          url: "/gorevler",
        }).catch(() => {});
        sendWhatsAppToUser(responsibleId, {
          title: `Denetim başarısız: ${plateDisplay}`,
          body: `Firma: ${companyName}`,
          url: "/gorevler",
        }).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, data: { id } });
  } catch (e) { return apiError(e); }
}
