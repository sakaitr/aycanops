import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { gunlukSoruSchema } from "@/lib/schemas";

function parseRow(row: any) {
  return {
    ...row,
    secenekler: row.secenekler ? JSON.parse(row.secenekler) : null,
    detay_secenekler: row.detay_secenekler ? JSON.parse(row.detay_secenekler) : null,
    zorunlu: !!row.zorunlu,
    is_active: !!row.is_active,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "gunluk_soru:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const rows = await db.prepare(
      `SELECT * FROM gunluk_soru WHERE is_active = 1 ORDER BY sort_order ASC, created_at ASC`
    ).all() as any[];

    return NextResponse.json({ ok: true, data: rows.map(parseRow) });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "gunluk_soru:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = gunlukSoruSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    if ((d.tip === "checklist" || d.tip === "secim") && (!d.secenekler || d.secenekler.length === 0)) {
      return NextResponse.json({ ok: false, error: "Checklist/seçim tipi için en az bir seçenek gerekli" }, { status: 400 });
    }
    if (d.detay_tip === "secim" && (!d.detay_secenekler || d.detay_secenekler.length === 0)) {
      return NextResponse.json({ ok: false, error: "Takip sorusu seçim tipi için en az bir seçenek gerekli" }, { status: 400 });
    }
    if (d.detay_label && !d.detay_tetikleyici) {
      return NextResponse.json({ ok: false, error: "Takip sorusu için tetikleyici cevap seçilmeli" }, { status: 400 });
    }
    if (d.detay_label && !d.detay_tip) {
      return NextResponse.json({ ok: false, error: "Takip sorusu için cevap tipi seçilmeli" }, { status: 400 });
    }

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    const maxRow = await db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM gunluk_soru").get() as any;

    await db.prepare(
      `INSERT INTO gunluk_soru
       (id, label, tip, secenekler, zorunlu, sort_order, is_active, bolum_baslik, detay_label, detay_tip, detay_secenekler, detay_tetikleyici, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, d.label, d.tip, d.secenekler ? JSON.stringify(d.secenekler) : null, d.zorunlu === false ? 0 : 1, maxRow?.next_order ?? 0,
      d.bolum_baslik || null, d.detay_label || null, d.detay_tip || null,
      d.detay_secenekler ? JSON.stringify(d.detay_secenekler) : null, d.detay_tetikleyici || null,
      now, now
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
