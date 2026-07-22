import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { routePriceBulkUpdateSchema } from "@/lib/schemas";

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toDateStr(value: string | Date) {
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(value);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "route_prices:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const parsed = routePriceBulkUpdateSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { ids, mode, value, valid_from } = parsed.data;

    const db = getDb();
    const now = nowIso();
    const updated: { id: string; eski_fiyat: number; yeni_fiyat: number }[] = [];
    const skipped: { id: string; reason: string }[] = [];

    for (const id of ids) {
      const existing = await db.prepare(`SELECT * FROM route_supplier_prices WHERE id = ?`).get<any>(id);
      if (!existing) { skipped.push({ id, reason: "Bulunamadı" }); continue; }
      const existingValidFrom = toDateStr(existing.valid_from);
      if (valid_from <= existingValidFrom) {
        skipped.push({ id, reason: "Yeni geçerlilik tarihi mevcut kaydın başlangıcından sonra olmalı" });
        continue;
      }

      const eskiFiyat = Number(existing.price_amount);
      const yeniFiyat = mode === "percent"
        ? Math.round(eskiFiyat * (1 + value / 100) * 100) / 100
        : Math.round((eskiFiyat + value) * 100) / 100;

      if (yeniFiyat <= 0) { skipped.push({ id, reason: "Hesaplanan yeni fiyat 0 veya altında" }); continue; }

      // Eski kaydı, yeni fiyatın geçerlilik tarihinden bir gün öncesinde kapat
      await db.prepare(`UPDATE route_supplier_prices SET valid_to = ?, updated_at = ? WHERE id = ?`)
        .run(addDays(valid_from, -1), now, id);

      const newId = uuidv4();
      await db.prepare(
        `INSERT INTO route_supplier_prices
           (id, company_id, route_id, supplier_id, vehicle_id, plate, price_amount, currency, valid_from, valid_to, created_by, created_at, updated_at)
         VALUES (?,?,?,NULL,?,?,?,?,?,NULL,?,?,?)`
      ).run(
        newId, existing.company_id, existing.route_id, existing.vehicle_id, existing.plate,
        yeniFiyat, existing.currency, valid_from, user.id, now, now,
      );

      await logAudit({
        actorUserId: user.id, action: "route_price.bulk_update", entityType: "route_supplier_prices", entityId: newId,
        details: { onceki_id: id, eski_fiyat: eskiFiyat, yeni_fiyat: yeniFiyat, mode, value, valid_from },
      });

      updated.push({ id: newId, eski_fiyat: eskiFiyat, yeni_fiyat: yeniFiyat });
    }

    return NextResponse.json({ ok: true, data: { updated, skipped } });
  } catch (e) { return apiError(e); }
}
