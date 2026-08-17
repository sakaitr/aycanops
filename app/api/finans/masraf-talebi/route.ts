import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { finansMasrafTalebiSchema } from "@/lib/schemas";
import { syncHareket } from "@/lib/finans-hareket";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_masraf_talebi:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const canApprove = hasPermission(user, "finans_masraf_talebi:approve") || hasPermission(user, "finans_masraf_talebi:reject");
    const { searchParams } = new URL(req.url);
    const durum = searchParams.get("durum");

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (!canApprove) { conditions.push("mt.talep_eden_user_id = ?"); params.push(user.id); }
    if (durum) { conditions.push("mt.durum = ?"); params.push(durum); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await getDb().prepare(
      `SELECT mt.*, u.full_name AS talep_eden_ad, k.ad AS kategori_ad,
              d.name AS department_ad, p.ad AS proje_ad,
              v.plate AS vehicle_plate, c.name AS company_ad
       FROM finans_masraf_talebi mt
       JOIN users u ON u.id = mt.talep_eden_user_id
       LEFT JOIN finans_kategori k ON k.id = mt.kategori_id
       LEFT JOIN departments d ON d.id = mt.department_id
       LEFT JOIN finans_proje p ON p.id = mt.proje_id
       LEFT JOIN vehicles v ON v.id = mt.vehicle_id
       LEFT JOIN companies c ON c.id = mt.company_id
       ${where}
       ORDER BY mt.created_at DESC`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_masraf_talebi:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = finansMasrafTalebiSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    await db.prepare(
      `INSERT INTO finans_masraf_talebi
         (id, talep_eden_user_id, tarih, baslik, aciklama, tahmini_tutar, para_birimi_kod,
          kategori_id, department_id, proje_id, masraf_merkezi_id, vehicle_id, route_id, company_id,
          durum, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bekliyor', ?, ?)`
    ).run(
      id, user.id, d.tarih, d.baslik, d.aciklama || null, d.tahmini_tutar, d.para_birimi_kod || "TRY",
      d.kategori_id || null, d.department_id || null, d.proje_id || null, d.masraf_merkezi_id || null,
      d.vehicle_id || null, d.route_id || null, d.company_id || null,
      now, now
    );

    // Tek deftere onay bekleyen olarak yaz — patron paneli "onay bekleyen"
    // kırılımında görsün, onaylanınca/reddedilince durum güncellenir.
    await syncHareket("masraf", id, {
      tur: "gider",
      tarih: d.tarih,
      tutar: d.tahmini_tutar,
      para_birimi: d.para_birimi_kod || "TRY",
      kategori_id: d.kategori_id,
      department_id: d.department_id,
      proje_id: d.proje_id,
      masraf_merkezi_id: d.masraf_merkezi_id,
      vehicle_id: d.vehicle_id,
      route_id: d.route_id,
      company_id: d.company_id,
      personel_id: user.id,
      durum: "onay_bekliyor",
      aciklama: d.baslik,
      created_by: user.id,
    });

    // Onay yetkisi olan yönetici/admin rollerine bildirim gönder.
    const approvers = await db.prepare(
      `SELECT DISTINCT u.id FROM users u
       JOIN role_permissions rp ON rp.role_name = u.role
       WHERE rp.permission_key = 'finans_masraf_talebi:approve' AND u.is_active = 1`
    ).all<{ id: string }>();
    for (const approver of approvers) {
      await db.prepare(
        `INSERT INTO notifications (id, user_id, title, body, link, is_read, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
      ).run(uuidv4(), approver.id, `Yeni masraf talebi: ${d.baslik}`,
        `${user.full_name} tarafından ${d.tahmini_tutar} ${d.para_birimi_kod || "TRY"} tutarında talep açıldı.`,
        "/finans/masraf-talebi", user.id, now, now);
    }

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
