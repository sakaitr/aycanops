import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { finansGiderSchema } from "@/lib/schemas";
import { syncHareket, deleteHareket } from "@/lib/finans-hareket";
import { checkDuplicateBelgeNo } from "@/lib/finans-gider";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_gider:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const gider = await db.prepare(
      `SELECT g.*, k.ad AS kategori_ad, c.unvan AS cari_ad, u.full_name AS created_by_ad
       FROM finans_gider g
       LEFT JOIN finans_kategori k ON k.id = g.kategori_id
       LEFT JOIN cari_tedarikci c ON c.id = g.cari_id
       LEFT JOIN users u ON u.id = g.created_by
       WHERE g.id = ?`
    ).get(id);
    if (!gider) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    const kalemler = await db.prepare(
      `SELECT * FROM finans_gider_kalem WHERE gider_id = ? ORDER BY sort_order ASC`
    ).all(id);

    const belgeler = await db.prepare(
      `SELECT id, dosya_adi, dosya_yolu, mime_type, boyut_bayt, created_at
       FROM finans_belge WHERE iliskili_tip = 'gider' AND iliskili_id = ? ORDER BY created_at ASC`
    ).all(id);

    return NextResponse.json({ ok: true, data: { ...(gider as object), kalemler, belgeler } });
  } catch (e) { return apiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    // "duzenle" — tam kayıt düzenlemesi için ayrıca atanan dar izin (seçili
    // kişiler); "update" — mevcut taslak-tamamlama akışının kullandığı izin.
    // İkisinden biri yeterli, geriye dönük hiçbir şey kırılmıyor.
    if (!hasPermission(user, "finans_gider:update") && !hasPermission(user, "finans_gider:duzenle"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare("SELECT id FROM finans_gider WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    const raw = await req.json();
    const parsed = finansGiderSchema.partial({ tip: true, tarih: true, kategori_id: true, tutar: true }).safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;
    const belgeNoUyarisi = d.belge_no !== undefined ? await checkDuplicateBelgeNo(d.belge_no, id) : null;

    const now = nowIso();
    const fields: string[] = [];
    const args: unknown[] = [];
    const set = (col: string, val: unknown) => { fields.push(`${col} = ?`); args.push(val); };

    if (d.tip !== undefined) set("tip", d.tip);
    if (d.tarih !== undefined) set("tarih", d.tarih);
    if (d.kategori_id !== undefined) set("kategori_id", d.kategori_id);
    if (d.cari_id !== undefined) set("cari_id", d.cari_id || null);
    if (d.belge_no !== undefined) set("belge_no", d.belge_no || null);
    if (d.tutar !== undefined) set("tutar", d.tutar);
    if (d.kdv_tutar !== undefined) set("kdv_tutar", d.kdv_tutar);
    if (d.aciklama !== undefined) set("aciklama", d.aciklama || null);
    if (d.department_id !== undefined) set("department_id", d.department_id || null);
    if (d.proje_id !== undefined) set("proje_id", d.proje_id || null);
    if (d.masraf_merkezi_id !== undefined) set("masraf_merkezi_id", d.masraf_merkezi_id || null);
    if (d.vehicle_id !== undefined) set("vehicle_id", d.vehicle_id || null);
    if (d.route_id !== undefined) set("route_id", d.route_id || null);
    if (d.company_id !== undefined) set("company_id", d.company_id || null);
    if (d.durum !== undefined) set("durum", d.durum);
    fields.push("updated_at = ?"); args.push(now);
    args.push(id);

    if (fields.length > 1) {
      await db.prepare(`UPDATE finans_gider SET ${fields.join(", ")} WHERE id = ?`).run(...args);
    }

    if (d.kalemler) {
      await db.prepare("DELETE FROM finans_gider_kalem WHERE gider_id = ?").run(id);
      let sortOrder = 0;
      for (const k of d.kalemler) {
        await db.prepare(
          `INSERT INTO finans_gider_kalem (id, gider_id, aciklama, miktar, birim_fiyat, tutar, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(uuidv4(), id, k.aciklama, k.miktar, k.birim_fiyat, k.miktar * k.birim_fiyat, sortOrder++);
      }
    }

    const updated = await db.prepare("SELECT * FROM finans_gider WHERE id = ?").get(id) as any;
    await syncHareket("gider", id, {
      tur: "gider",
      tarih: updated.tarih,
      tutar: Number(updated.tutar),
      kdv_tutari: updated.kdv_tutar ?? undefined,
      para_birimi: updated.para_birimi_kod || "TRY",
      cari_id: updated.cari_id,
      kategori_id: updated.kategori_id,
      department_id: updated.department_id,
      proje_id: updated.proje_id,
      masraf_merkezi_id: updated.masraf_merkezi_id,
      vehicle_id: updated.vehicle_id,
      route_id: updated.route_id,
      company_id: updated.company_id,
      personel_id: updated.created_by,
      durum: updated.durum === "taslak" ? "taslak" : "onaylandi",
      aciklama: updated.aciklama || updated.belge_no,
      created_by: updated.created_by,
    });

    return NextResponse.json({ ok: true, belge_no_uyari: belgeNoUyarisi });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_gider:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const existing = await db.prepare("SELECT id FROM finans_gider WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    await db.prepare("DELETE FROM finans_gider_kalem WHERE gider_id = ?").run(id);
    await db.prepare("DELETE FROM finans_gider WHERE id = ?").run(id);
    await deleteHareket("gider", id);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
