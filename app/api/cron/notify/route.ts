/**
 * POST /api/cron/notify
 *
 * Daily notification trigger. Called by:
 *  - A docker cron container: `0 7 * * * curl -X POST http://aycanops_app:3000/api/cron/notify -H "x-cron-secret: $CRON_SECRET"`
 *  - Or manually from admin panel via "Şimdi Çalıştır" button.
 *
 * Checks all active notification_rules and creates in-app notifications
 * (and optionally WhatsApp messages) for matching entities.
 */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";

const CRON_SECRET = process.env.CRON_SECRET || "aycan-cron-2026";

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

// mysql2, DATE kolonlarını JS Date nesnesi olarak döndürür — ham haliyle
// string'e gömmek "Fri Jul 10 2026 00:00:00 GMT+0300..." gibi çirkin çıktı verir.
function fmtDate(v: unknown): string {
  if (!v) return "—";
  return new Date(v as string).toISOString().split("T")[0];
}

export async function POST(req: NextRequest) {
  // Validate cron secret
  const secret = req.headers.get("x-cron-secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
  }

  try {
    const db = getDb();
    const todayStr = today();
    let totalSent = 0;
    const errors: string[] = [];

    // Get all active rules
    const rules = await db.prepare(`
      SELECT r.*, d.name AS dept_name
      FROM notification_rules r
      LEFT JOIN departments d ON d.id = r.department_id
      WHERE r.is_active = 1
    `).all() as any[];

    for (const rule of rules) {
      try {
        // Determine target date threshold
        const thresholdDate = rule.days_before > 0
          ? addDays(todayStr, rule.days_before)
          : todayStr; // for overdue: anything before today

        let targets: { entity_id: string; entity_type: string; label: string; user_ids: string[] }[] = [];

        if (rule.event_type === "belge_bitiyor") {
          // Araç belgesi bitiyor: vehicle_documents tablosundan min expiry
          const rows = await db.prepare(`
            SELECT v.id AS entity_id, v.plate,
                   MIN(d.expiry_date) AS min_expiry
            FROM vehicle_documents d
            JOIN vehicles v ON v.id = d.vehicle_id
            WHERE v.status_code = 'active'
              AND d.expiry_date IS NOT NULL
              AND d.expiry_date <= ?
              AND d.expiry_date >= ?
            GROUP BY v.id, v.plate
          `).all(thresholdDate, todayStr) as any[];

          for (const r of rows) {
            const sent = await db.prepare(`
              SELECT id FROM notification_log
              WHERE rule_id = ? AND entity_id = ? AND DATE(sent_at) = ?
            `).get(rule.id, r.entity_id, todayStr);
            if (sent) continue;

            targets.push({
              entity_id: r.entity_id,
              entity_type: "vehicle",
              label: `Araç belgesi yaklaşıyor: ${r.plate} (${fmtDate(r.min_expiry)})`,
              user_ids: await getUsersForRule(db, rule),
            });
          }
        }

        else if (rule.event_type === "sozlesme_bitiyor") {
          // Firma sözleşmesi bitiyor
          const rows = await db.prepare(`
            SELECT id AS entity_id, name, contract_end
            FROM companies
            WHERE is_active = 1
              AND contract_end IS NOT NULL
              AND contract_end <= ?
              AND contract_end >= ?
          `).all(thresholdDate, todayStr) as any[];

          for (const r of rows) {
            const sent = await db.prepare(`
              SELECT id FROM notification_log
              WHERE rule_id = ? AND entity_id = ? AND DATE(sent_at) = ?
            `).get(rule.id, r.entity_id, todayStr);
            if (sent) continue;

            targets.push({
              entity_id: r.entity_id,
              entity_type: "company",
              label: `Firma sözleşmesi yaklaşıyor: ${r.name} (${fmtDate(r.contract_end)})`,
              user_ids: await getUsersForRule(db, rule),
            });
          }
        }

        else if (rule.event_type === "bakim_gecikti") {
          // Bakım tarihi geçti
          const rows = await db.prepare(`
            SELECT DISTINCT v.id AS entity_id, v.plate
            FROM vehicle_maintenance m
            JOIN vehicles v ON v.id = m.vehicle_id
            WHERE v.status_code = 'active'
              AND m.next_service_date IS NOT NULL
              AND m.next_service_date < ?
          `).all(todayStr) as any[];

          for (const r of rows) {
            const sent = await db.prepare(`
              SELECT id FROM notification_log
              WHERE rule_id = ? AND entity_id = ? AND DATE(sent_at) = ?
            `).get(rule.id, r.entity_id, todayStr);
            if (sent) continue;

            targets.push({
              entity_id: r.entity_id,
              entity_type: "vehicle",
              label: `Bakım tarihi geçmiş araç: ${r.plate}`,
              user_ids: await getUsersForRule(db, rule),
            });
          }
        }

        else if (rule.event_type === "surucu_belge_bitiyor") {
          // Sürücü belgesi bitiyor
          const rows = await db.prepare(`
            SELECT id AS entity_id, name,
                   LEAST(
                     COALESCE(license_expiry, '9999-12-31'),
                     COALESCE(src_expiry, '9999-12-31'),
                     COALESCE(psiko_expiry, '9999-12-31'),
                     COALESCE(health_expiry, '9999-12-31')
                   ) AS min_expiry
            FROM drivers
            WHERE status = 'aktif'
              AND LEAST(
                    COALESCE(license_expiry, '9999-12-31'),
                    COALESCE(src_expiry, '9999-12-31'),
                    COALESCE(psiko_expiry, '9999-12-31'),
                    COALESCE(health_expiry, '9999-12-31')
                  ) <= ?
          `).all(thresholdDate) as any[];

          for (const r of rows) {
            const sent = await db.prepare(`
              SELECT id FROM notification_log
              WHERE rule_id = ? AND entity_id = ? AND DATE(sent_at) = ?
            `).get(rule.id, r.entity_id, todayStr);
            if (sent) continue;

            targets.push({
              entity_id: r.entity_id,
              entity_type: "driver",
              label: `Sürücü belgesi yaklaşıyor: ${r.name} (${fmtDate(r.min_expiry)})`,
              user_ids: await getUsersForRule(db, rule),
            });
          }
        }

        else if (rule.event_type === "sigorta_bitiyor") {
          // Araç sigortası bitiyor
          const rows = await db.prepare(`
            SELECT v.id AS entity_id, v.plate, MIN(i.bitis_tarihi) AS min_expiry
            FROM vehicle_insurances i
            JOIN vehicles v ON v.id = i.vehicle_id
            WHERE v.status_code = 'active'
              AND i.bitis_tarihi <= ?
              AND i.bitis_tarihi >= ?
            GROUP BY v.id, v.plate
          `).all(thresholdDate, todayStr) as any[];

          for (const r of rows) {
            const sent = await db.prepare(`
              SELECT id FROM notification_log
              WHERE rule_id = ? AND entity_id = ? AND DATE(sent_at) = ?
            `).get(rule.id, r.entity_id, todayStr);
            if (sent) continue;

            targets.push({
              entity_id: r.entity_id,
              entity_type: "vehicle",
              label: `Araç sigortası yaklaşıyor: ${r.plate} (${fmtDate(r.min_expiry)})`,
              user_ids: await getUsersForRule(db, rule),
            });
          }
        }

        else if (rule.event_type === "lastik_km_asimi") {
          // Son bilinen km (bakım kayıtlarından) ile son lastik değişim km'si arasındaki
          // fark, eşiği (km_esigi) aştıysa bildirim üretir.
          const kmEsigi = rule.km_esigi || 40000;
          const rows = await db.prepare(`
            SELECT v.id AS entity_id, v.plate, cur.cur_km, t.last_km, (cur.cur_km - t.last_km) AS asim_km
            FROM vehicles v
            JOIN (
              SELECT vehicle_id, MAX(km_at_service) AS cur_km
              FROM vehicle_maintenance
              WHERE km_at_service IS NOT NULL
              GROUP BY vehicle_id
            ) cur ON cur.vehicle_id = v.id
            JOIN (
              SELECT t1.vehicle_id, t1.arac_km AS last_km
              FROM vehicle_tires t1
              WHERE t1.degisim_tarihi = (
                SELECT MAX(t2.degisim_tarihi) FROM vehicle_tires t2 WHERE t2.vehicle_id = t1.vehicle_id
              )
            ) t ON t.vehicle_id = v.id
            WHERE v.status_code = 'active'
              AND t.last_km IS NOT NULL
              AND (cur.cur_km - t.last_km) >= ?
          `).all(kmEsigi) as any[];

          for (const r of rows) {
            const sent = await db.prepare(`
              SELECT id FROM notification_log
              WHERE rule_id = ? AND entity_id = ? AND DATE(sent_at) = ?
            `).get(rule.id, r.entity_id, todayStr);
            if (sent) continue;

            targets.push({
              entity_id: r.entity_id,
              entity_type: "vehicle",
              label: `Lastik değişim km eşiği aşıldı: ${r.plate} (+${r.asim_km} km)`,
              user_ids: await getUsersForRule(db, rule),
            });
          }
        }

        // Create notifications
        const now = nowIso();
        for (const t of targets) {
          for (const uid of t.user_ids) {
            const nid = uuidv4();
            try {
              await db.prepare(`
                INSERT INTO notifications (id, user_id, title, body, link, is_read, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 0, ?, ?)
              `).run(
                nid, uid,
                "⚠️ " + t.label,
                t.label,
                t.entity_type === "vehicle" ? `/araclar/${t.entity_id}` :
                  t.entity_type === "company" ? `/firmalar/${t.entity_id}` :
                    `/suruculer/${t.entity_id}`,
                now, now
              );
              totalSent++;
            } catch { /* duplicate or other --- ignore per user */ }
          }

          // Log to avoid re-sending today
          await db.prepare(`
            INSERT IGNORE INTO notification_log (id, rule_id, entity_id, entity_type, sent_at, channel)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(uuidv4(), rule.id, t.entity_id, t.entity_type, now, rule.channel);
        }
      } catch (e: any) {
        errors.push(`Rule ${rule.id}: ${e.message}`);
      }
    }

    return NextResponse.json({ ok: true, sent: totalSent, errors });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

async function getUsersForRule(db: any, rule: any): Promise<string[]> {
  if (rule.department_id) {
    // Send to all active users in this department
    const rows = await db.prepare(`
      SELECT id FROM users WHERE department_id = ? AND is_active = 1
    `).all(rule.department_id) as any[];
    return rows.map((r: any) => r.id);
  } else {
    // Send to all active admins/managers
    const rows = await db.prepare(`
      SELECT id FROM users WHERE role IN ('admin', 'yonetici') AND is_active = 1
    `).all() as any[];
    return rows.map((r: any) => r.id);
  }
}
