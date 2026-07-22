import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const db = getDb();
    const url = new URL(req.url);
    const bekleyenler = url.searchParams.get("bekleyenler") === "1";

    // Onaylayıcı veya yönetici+ → tüm talepleri görür; yoksa sadece kendi
    const isOnaylayici = await canApprove(user.id, user.role);

    let rows;
    if (bekleyenler && isOnaylayici) {
      rows = await db.prepare(`
        SELECT it.*, u.full_name as user_full_name, d.name as department_name,
               tur.ad as tur_ad, ony.full_name as onaylayan_ad
        FROM izin_talepleri it
        JOIN users u ON u.id = it.user_id
        LEFT JOIN departments d ON d.id = u.department_id
        JOIN izin_turleri tur ON tur.id = it.tur_id
        LEFT JOIN users ony ON ony.id = it.onaylayan_id
        WHERE it.durum = 'bekliyor'
        ORDER BY it.created_at DESC
      `).all();
    } else if (isOnaylayici) {
      rows = await db.prepare(`
        SELECT it.*, u.full_name as user_full_name, d.name as department_name,
               tur.ad as tur_ad, ony.full_name as onaylayan_ad
        FROM izin_talepleri it
        JOIN users u ON u.id = it.user_id
        LEFT JOIN departments d ON d.id = u.department_id
        JOIN izin_turleri tur ON tur.id = it.tur_id
        LEFT JOIN users ony ON ony.id = it.onaylayan_id
        ORDER BY it.created_at DESC
      `).all();
    } else {
      rows = await db.prepare(`
        SELECT it.*, u.full_name as user_full_name, d.name as department_name,
               tur.ad as tur_ad, ony.full_name as onaylayan_ad
        FROM izin_talepleri it
        JOIN users u ON u.id = it.user_id
        LEFT JOIN departments d ON d.id = u.department_id
        JOIN izin_turleri tur ON tur.id = it.tur_id
        LEFT JOIN users ony ON ony.id = it.onaylayan_id
        WHERE it.user_id = ?
        ORDER BY it.created_at DESC
      `).all(user.id);
    }

    return NextResponse.json({ ok: true, data: rows, isOnaylayici });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const body = await req.json();
    const { tur_id, baslangic, bitis, aciklama, belge_url } = body;

    if (!tur_id || !baslangic || !bitis) {
      return NextResponse.json({ ok: false, error: "Zorunlu alanlar eksik" }, { status: 400 });
    }

    const bas = new Date(baslangic);
    const bit = new Date(bitis);
    if (isNaN(bas.getTime()) || isNaN(bit.getTime()) || bit < bas) {
      return NextResponse.json({ ok: false, error: "Geçersiz tarih aralığı" }, { status: 400 });
    }

    const gun_sayisi = Math.ceil((bit.getTime() - bas.getTime()) / 86400000) + 1;
    const id = uuidv4();
    const now = nowIso();

    const db = getDb();
    await db.prepare(`
      INSERT INTO izin_talepleri (id, user_id, tur_id, baslangic, bitis, gun_sayisi, aciklama, belge_url, durum, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'bekliyor', ?, ?)
    `).run(id, user.id, tur_id, baslangic, bitis, gun_sayisi, aciklama || null, belge_url || null, now, now);

    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

async function canApprove(userId: string, role: string): Promise<boolean> {
  if (isAtLeast(role as any, "admin")) return true;
  const db = getDb();
  const row = await db.prepare(
    "SELECT izin_onaylayici FROM users WHERE id = ?"
  ).get<{ izin_onaylayici: number }>(userId);
  return (row?.izin_onaylayici ?? 0) === 1;
}
