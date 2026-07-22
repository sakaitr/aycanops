/**
 * POST /api/cron/cleanup-photos
 *
 * 30 günden eski denetim fotoğraflarını diskten ve DB'den siler.
 * Docker cron container'ı tarafından günlük çağrılır (bkz. docker-compose.yml).
 */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deleteInspectionPhoto } from "@/lib/uploads";

const CRON_SECRET = process.env.CRON_SECRET || "aycan-cron-2026";
const RETENTION_DAYS = 30;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
  }

  const db = getDb();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const stale = await db.prepare(
    "SELECT id, filename FROM inspection_photos WHERE created_at < ?"
  ).all(cutoff) as { id: string; filename: string }[];

  for (const photo of stale) {
    await deleteInspectionPhoto(photo.filename);
  }

  if (stale.length > 0) {
    const ids = stale.map(p => p.id);
    await db.prepare(
      `DELETE FROM inspection_photos WHERE id IN (${ids.map(() => "?").join(",")})`
    ).run(...ids);
  }

  return NextResponse.json({ ok: true, deleted: stale.length });
}
