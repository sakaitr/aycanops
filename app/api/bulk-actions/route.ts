import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { logAudit } from "@/lib/audit";

type BulkModule = "vehicles" | "drivers" | "companies" | "passengers" | "routes";
type BulkAction = "set_status" | "deactivate" | "activate" | "assign_company" | "assign_route";

const MODULE_TABLE: Record<BulkModule, { table: string; statusColumn?: string; activeColumn?: string; permission: string }> = {
  vehicles: { table: "vehicles", statusColumn: "status_code", permission: "vehicles:bulk" },
  drivers: { table: "drivers", statusColumn: "status", permission: "drivers:update" },
  companies: { table: "companies", activeColumn: "is_active", permission: "companies:update" },
  passengers: { table: "passengers", statusColumn: "status", permission: "passengers:update" },
  routes: { table: "routes", activeColumn: "is_active", permission: "routes:update" },
};

function isBulkModule(value: unknown): value is BulkModule {
  return value === "vehicles" || value === "drivers" || value === "companies" || value === "passengers" || value === "routes";
}

function isBulkAction(value: unknown): value is BulkAction {
  return value === "set_status" || value === "deactivate" || value === "activate" || value === "assign_company" || value === "assign_route";
}

function selectedIds(body: any) {
  return Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 1000) : [];
}

async function fetchRecords(module: BulkModule, ids: string[]) {
  if (ids.length === 0) return [];
  const db = getDb();
  const table = MODULE_TABLE[module].table;
  return db.prepare(`SELECT * FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as Promise<any[]>;
}

function nextValues(module: BulkModule, action: BulkAction, payload: any) {
  const cfg = MODULE_TABLE[module];
  if (action === "set_status") {
    if (!cfg.statusColumn) throw new Error("Bu modülde status alanı yok");
    const status = String(payload?.status || payload?.status_code || "").trim();
    if (!status) throw new Error("Durum değeri zorunludur");
    return { column: cfg.statusColumn, value: status };
  }
  if (action === "deactivate" || action === "activate") {
    if (cfg.activeColumn) return { column: cfg.activeColumn, value: action === "activate" ? 1 : 0 };
    if (cfg.statusColumn) return { column: cfg.statusColumn, value: action === "activate" ? (module === "vehicles" ? "active" : "aktif") : (module === "vehicles" ? "inactive" : "pasif") };
  }
  if (action === "assign_company") return { column: "company_id", value: payload?.company_id || null };
  if (action === "assign_route") return { column: "route_id", value: payload?.route_id || null };
  throw new Error("Desteklenmeyen toplu işlem");
}

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "bulk_actions:preview")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });
    const db = getDb();
    const rows = await db.prepare(
      `SELECT b.*, u.full_name AS created_by_name
       FROM bulk_action_jobs b
       LEFT JOIN users u ON u.id = b.created_by
       ORDER BY b.created_at DESC
       LIMIT 50`
    ).all();
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "bulk_actions:preview")) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const body = await req.json();
    const module = body.module;
    const action = body.action;
    const execute = body.execute === true;
    if (!isBulkModule(module) || !isBulkAction(action)) return NextResponse.json({ ok: false, error: "Geçersiz toplu işlem" }, { status: 400 });
    if (!hasPermission(user, MODULE_TABLE[module].permission)) return NextResponse.json({ ok: false, error: "Modül işlem yetkiniz yok" }, { status: 403 });
    if (execute && !hasPermission(user, "bulk_actions:execute")) return NextResponse.json({ ok: false, error: "Toplu işlem çalıştırma yetkiniz yok" }, { status: 403 });

    const ids = selectedIds(body);
    if (ids.length === 0) return NextResponse.json({ ok: false, error: "En az bir kayıt seçilmelidir" }, { status: 400 });

    const records = await fetchRecords(module, ids);
    const change = nextValues(module, action, body.payload || {});
    const now = nowIso();
    const db = getDb();
    const jobId = uuidv4();

    await db.prepare(
      `INSERT INTO bulk_action_jobs (id, module, action, status, selected_ids, payload_json, total_items, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(jobId, module, action, execute ? "processing" : "preview", JSON.stringify(ids), JSON.stringify(body.payload || {}), records.length, user.id, now, now);

    let success = 0;
    let error = 0;
    for (const record of records) {
      const itemId = uuidv4();
      const after = { ...record, [change.column]: change.value, updated_at: now };
      if (!execute) {
        await db.prepare(`INSERT INTO bulk_action_items (id, job_id, record_id, status, before_json, after_json, created_at, updated_at) VALUES (?, ?, ?, 'preview', ?, ?, ?, ?)`)
          .run(itemId, jobId, record.id, JSON.stringify(record), JSON.stringify(after), now, now);
        continue;
      }
      try {
        await db.prepare(`UPDATE ${MODULE_TABLE[module].table} SET ${change.column} = ?, updated_at = ? WHERE id = ?`).run(change.value, now, record.id);
        success++;
        await db.prepare(`INSERT INTO bulk_action_items (id, job_id, record_id, status, before_json, after_json, created_at, updated_at) VALUES (?, ?, ?, 'success', ?, ?, ?, ?)`)
          .run(itemId, jobId, record.id, JSON.stringify(record), JSON.stringify(after), now, now);
      } catch (e) {
        error++;
        await db.prepare(`INSERT INTO bulk_action_items (id, job_id, record_id, status, before_json, error_message, created_at, updated_at) VALUES (?, ?, ?, 'error', ?, ?, ?, ?)`)
          .run(itemId, jobId, record.id, JSON.stringify(record), e instanceof Error ? e.message : "İşlenemedi", now, now);
      }
    }

    if (execute) {
      await db.prepare(`UPDATE bulk_action_jobs SET status=?, success_items=?, error_items=?, approved_by=?, executed_at=?, updated_at=? WHERE id=?`)
        .run(error > 0 ? "partial" : "completed", success, error, user.id, now, now, jobId);
      await logAudit({ actorUserId: user.id, action: "bulk.execute", entityType: "bulk_action_job", entityId: jobId, details: { module, action, total: records.length, success, error } });
    }

    return NextResponse.json({ ok: true, data: { id: jobId, module, action, execute, total: records.length, success, error, preview: records.slice(0, 20).map(r => ({ id: r.id, before: r, after: { ...r, [change.column]: change.value } })) } });
  } catch (e) { return apiError(e); }
}
