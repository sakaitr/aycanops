import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "duyurular:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const includeExpired = searchParams.get("all") === "1" && hasPermission(user, "duyurular:create");

    const conditions: string[] = ["(hedef_rol = 'hepsi' OR hedef_rol = ?)"];
    const params: unknown[] = [user.role];
    if (!includeExpired) {
      conditions.push("(bitis_tarihi IS NULL OR bitis_tarihi >= CURDATE())");
    }

    const rows = await getDb().prepare(
      `SELECT d.*, u.full_name AS creator_name
       FROM duyurular d
       LEFT JOIN users u ON u.id = d.created_by
       WHERE ${conditions.join(" AND ")}
       ORDER BY d.yayinlanma_tarihi DESC, d.created_at DESC`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "duyurular:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    if (!body.baslik?.trim()) return NextResponse.json({ ok: false, error: "Başlık zorunludur" }, { status: 400 });
    const hedefRoller = ["hepsi", "personel", "yetkili", "yonetici", "admin"];
    if (body.hedef_rol && !hedefRoller.includes(body.hedef_rol))
      return NextResponse.json({ ok: false, error: "Geçersiz hedef rol" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO duyurular (id, baslik, icerik, hedef_rol, yayinlanma_tarihi, bitis_tarihi, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(id, body.baslik.trim(), body.icerik || null, body.hedef_rol || "hepsi", now, body.bitis_tarihi || null, user.id, now);

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
