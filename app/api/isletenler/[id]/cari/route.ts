import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "isleten:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(200, parseInt(searchParams.get("limit") || "50"));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const offset = (page - 1) * limit;

    const db = getDb();

    const isleten = await db.prepare(`SELECT id, unvan FROM isleten WHERE id = ?`).get(id);
    if (!isleten) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    const countRow = await db.prepare(
      `SELECT COUNT(*) as total FROM isleten_cari WHERE isleten_id = ?`
    ).get<{ total: number }>(id);

    const rows = await db.prepare(
      `SELECT ic.*, u.full_name AS created_by_name
       FROM isleten_cari ic
       LEFT JOIN users u ON u.id = ic.created_by
       WHERE ic.isleten_id = ?
       ORDER BY ic.tarih DESC, ic.created_at DESC
       LIMIT ? OFFSET ?`
    ).all(id, limit, offset);

    const summary = await db.prepare(
      `SELECT
         COALESCE(SUM(para_girisi), 0) AS toplam_giris,
         COALESCE(SUM(para_cikisi), 0) AS toplam_cikis,
         COALESCE(SUM(para_girisi) - SUM(para_cikisi), 0) AS bakiye
       FROM isleten_cari WHERE isleten_id = ?`
    ).get(id);

    return NextResponse.json({
      ok: true,
      data: rows,
      summary,
      meta: { total: countRow?.total ?? 0, page, limit },
    });
  } catch (e) { return apiError(e); }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "isleten:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();

    const tutar = parseFloat(body.tutar || "0");
    if (!tutar || tutar <= 0)
      return NextResponse.json({ ok: false, error: "Geçerli tutar giriniz" }, { status: 400 });
    if (!body.islem_turu)
      return NextResponse.json({ ok: false, error: "İşlem türü zorunludur" }, { status: 400 });

    const db = getDb();
    const isleten = await db.prepare(`SELECT id FROM isleten WHERE id = ?`).get(id);
    if (!isleten) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    const rowId = uuidv4();
    const now = nowIso();
    const tarih = body.tarih || now.split("T")[0];

    // hakedis ve kesinti = para_girisi (işletene borçlanıyoruz), ödeme = para_cikisi
    const isGiris = ["hakedis", "avans"].includes(body.islem_turu);
    const para_girisi = isGiris ? tutar : 0;
    const para_cikisi = !isGiris ? tutar : 0;

    await db.prepare(
      `INSERT INTO isleten_cari
         (id, isleten_id, tarih, vade_tarihi, tutar, para_girisi, para_cikisi,
          aciklama, islem_turu, referans_id, referans_turu, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      rowId, id, tarih,
      body.vade_tarihi || null,
      tutar, para_girisi, para_cikisi,
      body.aciklama || null,
      body.islem_turu,
      body.referans_id || null,
      body.referans_turu || null,
      user.id, now,
    );

    return NextResponse.json({ ok: true, data: { id: rowId } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
