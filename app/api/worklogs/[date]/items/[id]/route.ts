import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { worklogItemUpdateSchema } from "@/lib/schemas";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string; id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { date, id } = await params;
    const db = getDb();

    // Ensure item belongs to this user's worklog for this date
    const item = await db.prepare(
      `SELECT wi.id FROM worklog_items wi
       JOIN worklogs w ON w.id = wi.worklog_id
       WHERE wi.id = ? AND w.work_date = ? AND w.user_id = ?`
    ).get(id, date, user.id);

    if (!item) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı" }, { status: 404 });

    await db.prepare("DELETE FROM worklog_items WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ date: string; id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { date, id } = await params;
    const body = await req.json();
    const parsed = worklogItemUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { title } = parsed.data;

    const db = getDb();
    const item = await db.prepare(
      `SELECT wi.id FROM worklog_items wi
       JOIN worklogs w ON w.id = wi.worklog_id
       WHERE wi.id = ? AND w.work_date = ? AND w.user_id = ?`
    ).get(id, date, user.id);

    if (!item) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı" }, { status: 404 });

    await db.prepare("UPDATE worklog_items SET title = ?, updated_at = NOW() WHERE id = ?").run(title.trim(), id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
