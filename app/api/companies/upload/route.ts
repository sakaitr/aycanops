import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import ExcelJS from "exceljs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "yonetici")
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ ok: false, error: "Dosya bulunamadı" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const worksheet = wb.worksheets[0];
    if (!worksheet) return NextResponse.json({ ok: false, error: "Excel sayfası bulunamadı" }, { status: 400 });

    // Collect rows as arrays; skip header (row 1)
    // columns: [0]=Firma Adı, [1]=Plaka, [2]=Güzergah (metin, opsiyonel), [3]=Şöför (opsiyonel)
    const allRows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const r = [
        row.getCell(1).text?.trim() ?? "",
        row.getCell(2).text?.trim() ?? "",
        row.getCell(3).text?.trim() ?? "",
        row.getCell(4).text?.trim() ?? "",
      ];
      allRows.push(r);
    });
    const dataRows = allRows.filter((r) => r[1] && r[1].trim());

    const db = getDb();
    const now = nowIso();

    // Pre-load all routes for name lookup
    const routeRows = await db.prepare("SELECT id, name FROM routes WHERE is_active = 1").all<{ id: string; name: string }>();
    const routeMap = new Map<string, string>(routeRows.map(r => [r.name.trim().toLowerCase(), r.id]));

    let inserted = 0, skipped = 0, errors: string[] = [];

    for (const r of dataRows) {
      const companyName = r[0] ?? "";
      const plate = (r[1] ?? "").toUpperCase();
      const routeText = r[2] ? r[2] : null;
      const driverName = r[3] ? r[3] : null;
      if (!plate) { skipped++; continue; }
      if (!companyName) { skipped++; continue; }

      // Resolve route_id from route name (case-insensitive)
      const routeId = routeText ? (routeMap.get(routeText.toLowerCase()) ?? null) : null;

      // 1. Ensure plate exists in master vehicle registry
      await db.prepare(
        "INSERT IGNORE INTO vehicles (id, plate, type, capacity, status_code, driver_name, created_by, created_at, updated_at) VALUES (?, ?, 'minibus', 14, 'active', ?, ?, ?, ?)"
      ).run(uuidv4(), plate, driverName, user.id, now, now);
      if (driverName) {
        await db.prepare(
          "UPDATE vehicles SET driver_name = ?, updated_at = ? WHERE plate = ? AND (driver_name IS NULL OR driver_name = '')"
        ).run(driverName, now, plate);
      }

      // 2. Ensure company exists
      await db.prepare(
        "INSERT IGNORE INTO companies (id, name, is_active, created_by, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)"
      ).run(uuidv4(), companyName, user.id, now, now);
      const company = await db.prepare("SELECT id FROM companies WHERE name = ?").get<{ id: string }>(companyName);
      if (!company) { errors.push(`Firma oluşturulamadı: ${companyName}`); skipped++; continue; }

      // 3. Link vehicle to company
      const result = await db.prepare(
        "INSERT IGNORE INTO company_vehicles (id, company_id, plate, driver_name, route_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
      ).run(uuidv4(), company.id, plate, driverName, routeId, now, now);
      if (result.affectedRows > 0) {
        inserted++;
      } else {
        if (driverName) {
          await db.prepare(
            "UPDATE company_vehicles SET driver_name = ?, updated_at = ? WHERE company_id = ? AND plate = ? AND (driver_name IS NULL OR driver_name = '')"
          ).run(driverName, now, company.id, plate);
        }
        if (routeId) {
          await db.prepare(
            "UPDATE company_vehicles SET route_id = ?, updated_at = ? WHERE company_id = ? AND plate = ? AND route_id IS NULL"
          ).run(routeId, now, company.id, plate);
        }
        skipped++;
      }
    }

    return NextResponse.json({ ok: true, data: { inserted, skipped, errors } });
  } catch (e: any) {
    console.error("Upload error:", e);
    return NextResponse.json({ ok: false, error: "Dosya işlenemedi: " + e.message }, { status: 500 });
  }
}
