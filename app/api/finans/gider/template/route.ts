import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import ExcelJS from "exceljs";

const HEADERS = ["Tip", "Tarih", "Kategori", "Cari", "Belge No", "Tutar", "KDV Tutar", "Açıklama"];

// GET /api/finans/gider/template — toplu yükleme için boş Excel şablonu.
// İkinci sayfada geçerli kategori adları referans olarak listelenir.
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_gider:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const kategoriler = await db.prepare(
      `SELECT ad, parent_id FROM finans_kategori WHERE is_active = 1 ORDER BY ad ASC`
    ).all() as { ad: string; parent_id: string | null }[];

    const wb = new ExcelJS.Workbook();

    const sheet = wb.addWorksheet("Gider");
    sheet.columns = HEADERS.map(h => ({ header: h, key: h, width: h === "Açıklama" ? 32 : 18 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow(["Fiş", "10.08.2026", kategoriler[0]?.ad || "Yakıt", "Örnek Cari A.Ş.", "", 250.5, "", "Örnek satır — silip kendi verinizi girin"]);

    const katSheet = wb.addWorksheet("Kategoriler");
    katSheet.columns = [{ header: "Geçerli Kategori Adları", key: "ad", width: 32 }];
    katSheet.getRow(1).font = { bold: true };
    for (const k of kategoriler) katSheet.addRow([k.parent_id ? `  ${k.ad}` : k.ad]);

    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="gider_sablonu.xlsx"`,
      },
    });
  } catch (e) { return apiError(e); }
}
