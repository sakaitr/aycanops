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
    if (!hasPermission(user, "kara_liste:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const tur = searchParams.get("tur") || "";
    const durum = searchParams.get("durum") ?? "aktif";
    const q = searchParams.get("q") || "";

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (tur) { conditions.push("tur = ?"); params.push(tur); }
    if (durum) { conditions.push("durum = ?"); params.push(durum); }
    if (q) { conditions.push("(isim LIKE ? OR tc_no LIKE ? OR telefon LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.prepare(
      `SELECT * FROM kara_liste ${where} ORDER BY created_at DESC`
    ).all(...params);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "kara_liste:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const isim = (body.isim || "").trim();
    if (!isim) return NextResponse.json({ ok: false, error: "İsim zorunludur" }, { status: 400 });
    if (!body.tur) return NextResponse.json({ ok: false, error: "Tür zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    await db.prepare(
      `INSERT INTO kara_liste (id, isim, tur, tc_no, telefon, ekleme_nedeni, aciklama, durum, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, isim, body.tur, body.tc_no || null, body.telefon || null,
      body.ekleme_nedeni || null, body.aciklama || null, "aktif",
      user.id, now, now,
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
