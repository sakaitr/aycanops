import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { musteriCreateSchema } from "@/lib/schemas";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "musteriler:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const is_active = searchParams.get("is_active");
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (is_active !== null && is_active !== "") { conditions.push("is_active = ?"); params.push(is_active === "1" ? 1 : 0); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await getDb().prepare(
      `SELECT * FROM musteriler ${where} ORDER BY unvan ASC`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "musteriler:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const parsed = musteriCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO musteriler (id, unvan, vergi_no, vergi_dairesi, telefon, email, adres, banka_adi, banka_iban, ilgili_firma_id, notlar, is_active, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`
    ).run(id, d.unvan, d.vergi_no || null, d.vergi_dairesi || null, d.telefon || null, d.email || null, d.adres || null,
      d.banka_adi || null, d.banka_iban || null, d.ilgili_firma_id || null, d.notlar || null, user.id, now, now);

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
