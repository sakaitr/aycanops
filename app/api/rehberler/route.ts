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
    if (!hasPermission(user, "rehberler:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const active = searchParams.get("active") ?? "1";

    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (q) { conditions.push("(ad LIKE ? OR soyad LIKE ? OR cep_tel LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (active !== "") { conditions.push("is_active = ?"); params.push(Number(active)); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.prepare(
      `SELECT * FROM rehberler ${where} ORDER BY ad ASC, soyad ASC`
    ).all(...params);

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "rehberler:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const ad = (body.ad || "").trim();
    const soyad = (body.soyad || "").trim();
    if (!ad || !soyad) return NextResponse.json({ ok: false, error: "Ad ve soyad zorunludur" }, { status: 400 });

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();

    await db.prepare(
      `INSERT INTO rehberler (id, ad, soyad, tc_no, cep_tel, kan_grubu, aciklama, is_active, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id, ad, soyad, body.tc_no || null, body.cep_tel || null, body.kan_grubu || null,
      body.aciklama || null, 1, user.id, now, now,
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
