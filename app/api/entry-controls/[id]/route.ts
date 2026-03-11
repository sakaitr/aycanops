import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowIso } from "@/lib/time";
import { entryControlUpdateSchema } from "@/lib/schemas";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    const { id } = await params;
    const raw = await req.json();
    const parsed = entryControlUpdateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const body = parsed.data;
    const db = getDb();
    const now = nowIso();

    let extra: string[] = [];
    let extraVals: unknown[] = [];
    if (body.actual_time && body.planned_time) {
      const [ph, pm] = body.planned_time.split(":").map(Number);
      const [ah, am] = body.actual_time.split(":").map(Number);
      let delay = (ah * 60 + am) - (ph * 60 + pm);
      if (delay < -12 * 60) delay += 24 * 60; // overnight
      delay = Math.max(0, delay);
      extra.push("delay_minutes = ?");
      extraVals.push(delay);
      if (!body.status_code) {
        extra.push("status_code = ?");
        extraVals.push(delay > 0 ? "delayed" : "on_time");
      }
    }

    const fields = ["actual_time", "passenger_expected", "passenger_actual", "status_code", "notes"] as const;
    const sets = fields.filter(f => body[f] !== undefined).map(f => `${f} = ?`);
    const vals = fields.filter(f => body[f] !== undefined).map(f => body[f]);

    const allSets = [...sets, ...extra];
    const allVals = [...vals, ...extraVals];
    if (allSets.length === 0) return NextResponse.json({ ok: false, error: "Güncellenecek alan yok" }, { status: 400 });
    await db.prepare(`UPDATE entry_controls SET ${allSets.join(", ")}, updated_at = ? WHERE id = ?`).run(...allVals, now, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
