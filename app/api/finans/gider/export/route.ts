import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import ExcelJS from "exceljs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_gider:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const kategori_id = searchParams.get("kategori_id");
    const date_from = searchParams.get("date_from");
    const date_to = searchParams.get("date_to");

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (kategori_id) { conditions.push("g.kategori_id = ?"); params.push(kategori_id); }
    if (date_from) { conditions.push("g.tarih >= ?"); params.push(date_from); }
    if (date_to) { conditions.push("g.tarih <= ?"); params.push(date_to); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const db = getDb();
    const rows = await db.prepare(
      `SELECT g.tarih AS "Tarih", CASE g.tip WHEN 'fis' THEN 'Fiş' ELSE 'Fatura' END AS "Tür",
              k.ad AS "Kategori", c.unvan AS "Cari", g.belge_no AS "Belge No",
              g.tutar AS "Tutar", g.para_birimi_kod AS "Para Birimi", g.aciklama AS "Açıklama",
              u.full_name AS "Kaydeden"
       FROM finans_gider g
       LEFT JOIN finans_kategori k ON k.id = g.kategori_id
       LEFT JOIN cari_tedarikci c ON c.id = g.cari_id
       LEFT JOIN users u ON u.id = g.created_by
       ${where}
       ORDER BY g.tarih DESC`
    ).all<any>(...params);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Giderler");
    if (rows.length > 0) {
      ws.columns = Object.keys(rows[0]).map((key) => ({ header: key, key, width: key === "Açıklama" ? 40 : 16 }));
      rows.forEach((row) => ws.addRow(row));
      ws.getRow(1).font = { bold: true };
    }
    const buf = await wb.xlsx.writeBuffer();

    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="giderler_${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (e) { return apiError(e); }
}
