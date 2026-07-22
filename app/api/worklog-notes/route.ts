import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const db = getDb();
    const worklog_id = new URL(req.url).searchParams.get("worklog_id");
    if (!worklog_id) return NextResponse.json({ ok: false, error: "worklog_id gerekli" }, { status: 400 });

    const visits = await db.prepare(
      `SELECT wv.*, c.name AS company_name
       FROM worklog_visits wv
       LEFT JOIN companies c ON c.id = wv.company_id
       WHERE wv.worklog_id = ?
       ORDER BY wv.created_at ASC`
    ).all(worklog_id);

    const issues = await db.prepare(
      `SELECT * FROM worklog_issues WHERE worklog_id = ? ORDER BY created_at ASC`
    ).all(worklog_id);

    return NextResponse.json({ ok: true, visits, issues });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const body = await req.json();
    const { type, worklog_id, company_id, note, description } = body;
    if (!worklog_id) return NextResponse.json({ ok: false, error: "worklog_id gerekli" }, { status: 400 });

    const db = getDb();

    if (type === "visit") {
      if (!company_id) return NextResponse.json({ ok: false, error: "company_id gerekli" }, { status: 400 });
      const result = await db.prepare(
        `INSERT INTO worklog_visits (worklog_id, company_id, note) VALUES (?, ?, ?)`
      ).run(worklog_id, company_id, note || null);
      return NextResponse.json({ ok: true, id: result.insertId });
    } else if (type === "issue") {
      if (!description?.trim()) return NextResponse.json({ ok: false, error: "Açıklama gerekli" }, { status: 400 });
      const result = await db.prepare(
        `INSERT INTO worklog_issues (worklog_id, description) VALUES (?, ?)`
      ).run(worklog_id, description.trim());
      return NextResponse.json({ ok: true, id: result.insertId });
    }

    return NextResponse.json({ ok: false, error: "Geçersiz tip" }, { status: 400 });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!["yonetici", "admin"].includes(user.role))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const visitId = searchParams.get("visit_id");
    const issueId = searchParams.get("issue_id");

    const db = getDb();
    if (visitId) await db.prepare("DELETE FROM worklog_visits WHERE id = ?").run(visitId);
    if (issueId) await db.prepare("DELETE FROM worklog_issues WHERE id = ?").run(issueId);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const body = await req.json();
    const { issue_id, resolved } = body;
    if (!issue_id) return NextResponse.json({ ok: false, error: "issue_id gerekli" }, { status: 400 });

    const db = getDb();
    await db.prepare("UPDATE worklog_issues SET resolved = ? WHERE id = ?").run(resolved ? 1 : 0, issue_id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
