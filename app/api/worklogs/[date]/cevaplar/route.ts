import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { gunlukCevapSubmitSchema } from "@/lib/schemas";

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function detayTetikleniyor(value: unknown, tetikleyici: string | null): boolean {
  if (!tetikleyici) return false;
  if (Array.isArray(value)) return value.includes(tetikleyici);
  return String(value) === tetikleyici;
}

// POST /api/worklogs/[date]/cevaplar — işe başlama check-in'i: sabah
// sorularının cevaplarını (ve varsa koşullu takip/detay cevaplarını) kaydeder
// ve worklogs.checkin_at'i doldurur. Bugüne ait worklog henüz yoksa (ilk kez
// check-in yapılıyorsa) burada oluşturulur — /api/worklogs POST'un create
// mantığıyla aynı, tekrar edilmedi çünkü tek satırlık bir INSERT.
export async function POST(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { date } = await params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: "YYYY-MM-DD formatı bekleniyor" }, { status: 400 });
    }
    const raw = await req.json();
    const parsed = gunlukCevapSubmitSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { cevaplar } = parsed.data;

    const db = getDb();
    const sorular = await db.prepare(
      "SELECT id, zorunlu, detay_label, detay_tetikleyici FROM gunluk_soru WHERE is_active = 1"
    ).all() as { id: string; zorunlu: number; detay_label: string | null; detay_tetikleyici: string | null }[];
    const soruById = new Map(sorular.map(s => [s.id, s]));

    const answerBySoruId = new Map(cevaplar.map(c => [c.soru_id, c.value]));
    const detayBySoruId = new Map(cevaplar.map(c => [c.soru_id, c.detay]));

    const missing = sorular.filter(s => s.zorunlu && isEmpty(answerBySoruId.get(s.id)));
    if (missing.length > 0) {
      return NextResponse.json({ ok: false, error: "Zorunlu sorular cevaplanmadı", missing: missing.map(s => s.id) }, { status: 400 });
    }

    const missingDetay = sorular.filter(s =>
      s.detay_label && detayTetikleniyor(answerBySoruId.get(s.id), s.detay_tetikleyici) && isEmpty(detayBySoruId.get(s.id))
    );
    if (missingDetay.length > 0) {
      return NextResponse.json({ ok: false, error: "Detay cevap gerekli", missing: missingDetay.map(s => s.id) }, { status: 400 });
    }

    const now = nowIso();
    let worklog = await db.prepare(
      "SELECT id, checkin_at FROM worklogs WHERE user_id = ? AND work_date = ?"
    ).get(user.id, date) as { id: string; checkin_at: string | null } | undefined;

    if (!worklog) {
      const id = uuidv4();
      await db.prepare(
        `INSERT INTO worklogs (id, user_id, work_date, summary, status_code, created_at, updated_at)
         VALUES (?, ?, ?, '', 'draft', ?, ?)`
      ).run(id, user.id, date, now, now);
      worklog = { id, checkin_at: null };
    }

    for (const c of cevaplar) {
      const soru = soruById.get(c.soru_id);
      const detayGecerli = soru ? detayTetikleniyor(c.value, soru.detay_tetikleyici) : false;
      const detayCevap = detayGecerli && c.detay != null ? JSON.stringify(c.detay) : null;
      await db.prepare(
        `INSERT INTO gunluk_cevap (id, worklog_id, soru_id, cevap_json, detay_cevap, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE cevap_json = VALUES(cevap_json), detay_cevap = VALUES(detay_cevap), updated_at = VALUES(updated_at)`
      ).run(uuidv4(), worklog.id, c.soru_id, JSON.stringify(c.value), detayCevap, now, now);
    }

    if (!worklog.checkin_at) {
      await db.prepare("UPDATE worklogs SET checkin_at = ?, updated_at = ? WHERE id = ?").run(now, now, worklog.id);
    }

    return NextResponse.json({ ok: true, data: { worklog_id: worklog.id, checkin_at: worklog.checkin_at || now } });
  } catch (e) { return apiError(e); }
}
