import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canViewWorklog, canReviewWorklog, isAtLeast } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";
import { worklogUpdateSchema } from "@/lib/schemas";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Yetkisiz erişim" },
        { status: 401 }
      );
    }

    const { date } = await params;
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get("userId");
    const userId = (requestedUserId && isAtLeast(user.role, "yonetici")) ? requestedUserId : user.id;

    const worklog = await db
      .prepare(`SELECT w.*, u.full_name AS user_name
                FROM worklogs w JOIN users u ON u.id = w.user_id
                WHERE w.user_id = ? AND w.work_date = ?`)
      .get(userId, date) as { id: string; user_id: string } | undefined;

    if (!worklog) {
      return NextResponse.json(
        { ok: false, error: "Günlük bulunamadı" },
        { status: 404 }
      );
    }

    if (!canViewWorklog(user, worklog)) {
      return NextResponse.json(
        { ok: false, error: "Yetersiz yetki" },
        { status: 403 }
      );
    }

    const items = await db
      .prepare("SELECT * FROM worklog_items WHERE worklog_id = ?")
      .all(worklog.id);

    return NextResponse.json({ ok: true, data: { ...worklog, items } });
  } catch (error) {
    console.error("Worklog detail error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Yetkisiz erişim" },
        { status: 401 }
      );
    }

    const { date } = await params;
    if (!date) {
      return NextResponse.json(
        { ok: false, error: "Tarih gerekli" },
        { status: 400 }
      );
    }
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error("Invalid JSON in request:", parseError);
      return NextResponse.json(
        { ok: false, error: "Geçersiz JSON" },
        { status: 400 }
      );
    }
    const wParsed = worklogUpdateSchema.safeParse(body);
    if (!wParsed.success) {
      return NextResponse.json({ ok: false, error: wParsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { summary, status_code } = wParsed.data;
    const manager_note = (body as any).manager_note;
    const db = getDb();

    const { searchParams: putSearchParams } = new URL(request.url);
    const targetUserId = putSearchParams.get("userId");
    const lookupUserId = (targetUserId && isAtLeast(user.role, "yonetici")) ? targetUserId : user.id;

    const worklogRaw = await db
      .prepare("SELECT * FROM worklogs WHERE user_id = ? AND work_date = ?")
      .get(lookupUserId, date);

    if (!worklogRaw) {
      return NextResponse.json(
        { ok: false, error: "Günlük bulunamadı" },
        { status: 404 }
      );
    }

    const worklog = worklogRaw as { id: string; status_code: string; user_id: string };

    if (worklog.user_id !== user.id && !canReviewWorklog(user.role)) {
      return NextResponse.json(
        { ok: false, error: "Yetersiz yetki" },
        { status: 403 }
      );
    }

    // Only block summary/field edits on submitted/approved — allow submit transition by owner
    const isSubmitBySelf = status_code === "submitted" && worklog.user_id === user.id;
    if (
      !isSubmitBySelf &&
      !canReviewWorklog(user.role) &&
      (worklog.status_code === "submitted" || worklog.status_code === "approved")
    ) {
      return NextResponse.json(
        { ok: false, error: "Gönderilmiş veya onaylanmış günlük düzenlenemez" },
        { status: 400 }
      );
    }

    const now = nowIso();
    let updateSql = "UPDATE worklogs SET updated_at = ?";
    const updateParams: unknown[] = [now];

    if (summary) {
      updateSql += ", summary = ?";
      updateParams.push(summary);
    }

    if (status_code === "submitted") {
      updateSql += ", status_code = 'submitted', submitted_at = ?";
      updateParams.push(now);
      await logAudit({
        actorUserId: user.id,
        action: "worklog_submit",
        entityType: "worklog",
        entityId: worklog.id,
      });
    } else if (status_code === "approved" && canReviewWorklog(user.role)) {
      updateSql += ", status_code = 'approved', approved_at = ?";
      updateParams.push(now);
      await logAudit({
        actorUserId: user.id,
        action: "worklog_approve",
        entityType: "worklog",
        entityId: worklog.id,
      });
    } else if (status_code === "returned" && canReviewWorklog(user.role)) {
      if (!manager_note) {
        return NextResponse.json(
          { ok: false, error: "İade notu gerekli" },
          { status: 400 }
        );
      }
      updateSql +=
        ", status_code = 'returned', returned_at = ?, manager_note = ?";
      updateParams.push(now, manager_note);
      await logAudit({
        actorUserId: user.id,
        action: "worklog_return",
        entityType: "worklog",
        entityId: worklog.id,
        details: { manager_note },
      });
    }

    updateSql += " WHERE id = ?";
    updateParams.push(worklog.id);

    await db.prepare(updateSql).run(...updateParams);

    const updated = await db
      .prepare("SELECT * FROM worklogs WHERE id = ?")
      .get(worklog.id);
    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("Worklog update error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const user = await requireUser();
    if (!user)
      return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 401 });

    const { date } = await params;
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");
    const lookupUserId = (targetUserId && isAtLeast(user.role, "yonetici")) ? targetUserId : user.id;

    // Non-managers can only delete their own draft worklogs
    if (lookupUserId !== user.id && !isAtLeast(user.role, "yonetici"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const worklog = await db
      .prepare("SELECT * FROM worklogs WHERE user_id = ? AND work_date = ?")
      .get(lookupUserId, date) as { id: string; status_code: string; user_id: string } | undefined;

    if (!worklog)
      return NextResponse.json({ ok: false, error: "Günlük bulunamadı" }, { status: 404 });

    // Regular users can only delete their own drafts
    if (!isAtLeast(user.role, "yonetici") && worklog.status_code !== "draft")
      return NextResponse.json({ ok: false, error: "Yalnızca taslak günlükler silinebilir" }, { status: 400 });

    await db.prepare("DELETE FROM worklog_items WHERE worklog_id = ?").run(worklog.id);
    await db.prepare("DELETE FROM worklogs WHERE id = ?").run(worklog.id);

    await logAudit({
      actorUserId: user.id,
      action: "worklog_delete",
      entityType: "worklog",
      entityId: worklog.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Worklog delete error:", error);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

