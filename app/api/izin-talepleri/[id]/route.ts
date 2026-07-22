import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import { nowIso } from "@/lib/time";

async function canApprove(userId: string, role: string): Promise<boolean> {
  if (isAtLeast(role as any, "admin")) return true;
  const db = getDb();
  const row = await db.prepare(
    "SELECT izin_onaylayici FROM users WHERE id = ?"
  ).get<{ izin_onaylayici: number }>(userId);
  return (row?.izin_onaylayici ?? 0) === 1;
}

// PATCH: onay/red veya iptal
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { action, onay_notu } = body; // action: 'onayla' | 'reddet' | 'iptal'

    const db = getDb();
    const talep = await db.prepare(
      "SELECT * FROM izin_talepleri WHERE id = ?"
    ).get<any>(id);

    if (!talep) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    if (action === "iptal") {
      // Sadece talebi oluşturan kişi, durum bekliyor iken iptal edebilir
      if (talep.user_id !== user.id) {
        return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 403 });
      }
      if (talep.durum !== "bekliyor") {
        return NextResponse.json({ ok: false, error: "Sadece bekleyen talepler iptal edilebilir" }, { status: 400 });
      }
      await db.prepare(
        "DELETE FROM izin_talepleri WHERE id = ?"
      ).run(id);
      return NextResponse.json({ ok: true });
    }

    if (action === "onayla" || action === "reddet") {
      const approved = await canApprove(user.id, user.role);
      if (!approved) return NextResponse.json({ ok: false, error: "İzin onaylama yetkiniz yok" }, { status: 403 });

      if (talep.durum !== "bekliyor") {
        return NextResponse.json({ ok: false, error: "Bu talep zaten işleme alınmış" }, { status: 400 });
      }

      const durum = action === "onayla" ? "onaylandi" : "reddedildi";
      await db.prepare(`
        UPDATE izin_talepleri
        SET durum = ?, onaylayan_id = ?, onay_notu = ?, onay_tarihi = ?, updated_at = ?
        WHERE id = ?
      `).run(durum, user.id, onay_notu || null, nowIso(), nowIso(), id);

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Geçersiz işlem" }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    const talep = await db.prepare("SELECT * FROM izin_talepleri WHERE id = ?").get<any>(id);
    if (!talep) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    const approved = await canApprove(user.id, user.role);
    if (!approved && talep.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 403 });
    }

    await db.prepare("DELETE FROM izin_talepleri WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
