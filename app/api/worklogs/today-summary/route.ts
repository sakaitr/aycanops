import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";

export async function GET(_request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!isAtLeast(user.role, "yonetici"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const today = new Date().toISOString().split("T")[0];

    // All active non-admin users
    const allUsers = await db.prepare(`
      SELECT id, full_name, role FROM users
      WHERE is_active = 1 AND role != 'admin'
      ORDER BY full_name ASC
    `).all() as { id: string; full_name: string; role: string }[];

    // Today's worklogs
    const todayWorklogs = await db.prepare(`
      SELECT w.*, u.full_name AS user_name
      FROM worklogs w
      JOIN users u ON u.id = w.user_id
      WHERE w.work_date = ?
    `).all(today) as any[];

    const worklogMap = new Map(todayWorklogs.map(w => [w.user_id, w]));

    let submitted = 0, approved = 0, returned = 0, draft = 0, issueCount = 0, lateCount = 0;
    const notSubmittedUsers: { id: string; full_name: string; role: string }[] = [];

    allUsers.forEach(u => {
      const w = worklogMap.get(u.id);
      if (!w) { notSubmittedUsers.push(u); return; }
      switch (w.status_code) {
        case "submitted": submitted++; break;
        case "approved":  approved++;  break;
        case "returned":  returned++;  break;
        case "draft":     draft++;     break;
      }
      if (w.summary?.trim()) issueCount++;
      if (w.submitted_at && new Date(w.submitted_at).getHours() >= 22) lateCount++;
    });

    return NextResponse.json({
      ok: true,
      data: {
        date: today,
        totalUsers: allUsers.length,
        submitted,
        approved,
        returned,
        draft,
        notStarted: notSubmittedUsers.length,
        issueCount,
        lateCount,
        notSubmittedUsers,
        allUsers,
      },
    });
  } catch (error) {
    console.error("Today summary error:", error);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
