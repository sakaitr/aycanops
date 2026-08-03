import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { nowIso } from "@/lib/time";
import { createDriverRecord } from "@/lib/driver-resolve";

const VALID_DURUM = ["acik", "islemde", "cozuldu", "kapandi"];
const SEVERITY_CATEGORY = "sikayet";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare("SELECT * FROM portal_tickets WHERE id = ?").get(id) as any;
    if (!existing) return NextResponse.json({ ok: false, error: "Talep bulunamadı" }, { status: 404 });

    const raw = await req.json();

    // Sürücü şikayeti değerlendirme (kabul/reddet) — ayrı yetki gerektirir
    if (raw.action === "evaluate") {
      if (existing.kategori !== "surucu_sikayeti")
        return NextResponse.json({ ok: false, error: "Bu talep sürücü şikayeti değil" }, { status: 400 });
      if (!hasPermission(user, "driver_complaints:evaluate"))
        return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
      if (existing.eval_durum !== "bekliyor")
        return NextResponse.json({ ok: false, error: "Bu şikayet zaten değerlendirilmiş" }, { status: 400 });

      const now = nowIso();

      if (raw.decision === "reddet") {
        if (!raw.eval_note?.trim())
          return NextResponse.json({ ok: false, error: "Red gerekçesi zorunludur" }, { status: 400 });
        await db.prepare(
          `UPDATE portal_tickets SET eval_durum = 'reddedildi', eval_note = ?, eval_by = ?, eval_at = ?, durum = 'kapandi', updated_at = ? WHERE id = ?`
        ).run(raw.eval_note.trim(), user.id, now, now, id);
        return NextResponse.json({ ok: true });
      }

      if (raw.decision === "kabul") {
        const severity = Number(raw.severity);
        if (!severity || severity < 1 || severity > 4)
          return NextResponse.json({ ok: false, error: "Geçerli bir ciddiyet seçin" }, { status: 400 });

        const recordId = await createDriverRecord({
          driver_name: existing.driver_name,
          vehicle_id: existing.vehicle_id,
          incident_date: existing.incident_date || existing.created_at.slice(0, 10),
          category: SEVERITY_CATEGORY,
          severity,
          description: existing.icerik,
          action_taken: raw.eval_note || null,
          reported_by: user.id,
        });

        await db.prepare(
          `UPDATE portal_tickets SET eval_durum = 'sicile_islendi', eval_note = ?, eval_by = ?, eval_at = ?, driver_record_id = ?, durum = 'cozuldu', updated_at = ? WHERE id = ?`
        ).run(raw.eval_note?.trim() || null, user.id, now, recordId, now, id);
        return NextResponse.json({ ok: true, driver_record_id: recordId });
      }

      return NextResponse.json({ ok: false, error: "Geçersiz işlem" }, { status: 400 });
    }

    // Genel durum güncellemesi
    if (!hasPermission(user, "musteri_destek:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { durum } = raw;
    if (!VALID_DURUM.includes(durum))
      return NextResponse.json({ ok: false, error: "Geçersiz durum" }, { status: 400 });

    await db.prepare("UPDATE portal_tickets SET durum = ?, assigned_to = ?, updated_at = ? WHERE id = ?")
      .run(durum, user.id, nowIso(), id);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
