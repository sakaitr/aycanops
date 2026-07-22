import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "documents:read")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }
    const { id } = await params;
    const db = getDb();
    const data = await db.prepare(
      "SELECT vd.*, u.full_name as uploaded_by_name FROM vehicle_documents vd LEFT JOIN users u ON u.id = vd.created_by WHERE vd.vehicle_id = ? ORDER BY vd.doc_type ASC, vd.created_at DESC"
    ).all(id);
    return NextResponse.json({ ok: true, data });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "documents:create")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();
    const { doc_type, doc_label, expiry_date, notes } = body;
    if (!doc_type) return NextResponse.json({ ok: false, error: "doc_type zorunlu" }, { status: 400 });

    const ALLOWED_TYPES = ["muayene", "sigorta", "ruhsat", "fotograf", "bakim", "ehliyet", "src", "psikoteknik", "saglik"];
    if (!ALLOWED_TYPES.includes(doc_type)) {
      return NextResponse.json({ ok: false, error: "Geçersiz belge türü" }, { status: 400 });
    }

    const db = getDb();
    const result = await db.prepare(
      "INSERT INTO vehicle_documents (vehicle_id, doc_type, doc_label, expiry_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, doc_type, doc_label || null, expiry_date || null, notes || null, user.id);

    const created = await db.prepare("SELECT * FROM vehicle_documents WHERE id = ?").get(result.insertId);
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "documents:delete")) {
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    }
    const url = new URL(req.url);
    const docId = url.searchParams.get("doc_id");
    if (!docId) return NextResponse.json({ ok: false, error: "doc_id gerekli" }, { status: 400 });

    const db = getDb();
    await db.prepare("DELETE FROM vehicle_documents WHERE id = ? AND vehicle_id = ?").run(docId, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
