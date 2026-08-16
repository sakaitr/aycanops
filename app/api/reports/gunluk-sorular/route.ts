import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

// GET /api/reports/gunluk-sorular?date_from&date_to — her aktif soru için
// verilen tarih aralığındaki cevapların dağılımı (evet/hayır sayısı,
// checklist/seçim seçeneklerinin frekansı, metin sorularda cevaplanma oranı).
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "reports:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    const db = getDb();
    const sorular = await db.prepare(
      "SELECT id, label, tip, secenekler FROM gunluk_soru WHERE is_active = 1 ORDER BY sort_order ASC"
    ).all() as { id: string; label: string; tip: string; secenekler: string | null }[];

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (dateFrom) { conditions.push("w.work_date >= ?"); params.push(dateFrom); }
    if (dateTo) { conditions.push("w.work_date <= ?"); params.push(dateTo); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const cevaplar = await db.prepare(
      `SELECT c.soru_id, c.cevap_json FROM gunluk_cevap c JOIN worklogs w ON w.id = c.worklog_id ${where}`
    ).all(...params) as { soru_id: string; cevap_json: string }[];

    const cevaplarBySoru = new Map<string, any[]>();
    for (const c of cevaplar) {
      const list = cevaplarBySoru.get(c.soru_id) ?? [];
      list.push(JSON.parse(c.cevap_json));
      cevaplarBySoru.set(c.soru_id, list);
    }

    const toplamGunlukSayisi = new Set(
      (await db.prepare(`SELECT w.id FROM worklogs w ${where}`).all(...params) as { id: string }[]).map(w => w.id)
    ).size;

    const data = sorular.map(s => {
      const values = cevaplarBySoru.get(s.id) ?? [];
      const cevaplanan = values.filter(v => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)).length;

      let dagilim: { label: string; adet: number }[] = [];
      if (s.tip === "evet_hayir") {
        dagilim = [
          { label: "Evet", adet: values.filter(v => v === true).length },
          { label: "Hayır", adet: values.filter(v => v === false).length },
        ];
      } else if (s.tip === "checklist" || s.tip === "secim") {
        const secenekler: string[] = s.secenekler ? JSON.parse(s.secenekler) : [];
        dagilim = secenekler.map(opt => ({
          label: opt,
          adet: values.filter(v => Array.isArray(v) ? v.includes(opt) : v === opt).length,
        }));
      }

      return { soru_id: s.id, label: s.label, tip: s.tip, cevaplanan, toplam: toplamGunlukSayisi, dagilim };
    });

    return NextResponse.json({ ok: true, data: { toplamGunlukSayisi, sorular: data } });
  } catch (e) { return apiError(e); }
}
