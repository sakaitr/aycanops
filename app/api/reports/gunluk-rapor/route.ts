import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";

/** Turkish char → WinAnsi safe */
function safeT(s: string): string {
  return String(s ?? "")
    .replace(/İ/g, "I").replace(/ı/g, "i")
    .replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g")
    .replace(/Ü/g, "U").replace(/ü/g, "u")
    .replace(/Ö/g, "O").replace(/ö/g, "o")
    .replace(/Ç/g, "C").replace(/ç/g, "c")
    .replace(/[^\x00-\xFF]/g, "?");
}

async function buildGunlukPdf(date: string, data: {
  summary: any; by_company: any[]; by_hour: any[]; detail: any[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fR = await pdf.embedFont(StandardFonts.Helvetica);
  const fB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoPath = path.join(process.cwd(), "public", "branding", "aycan-logo.png");
  let logoImage: any = null;
  try { logoImage = await pdf.embedPng(await fs.readFile(logoPath)); } catch {}

  const M = 36; // margin
  const pageW = 595; const pageH = 842;
  const [blue, lightBlue, headerBg, rowAlt] = [
    rgb(0.05, 0.17, 0.38), rgb(0.01, 0.68, 0.94),
    rgb(0.92, 0.95, 1), rgb(0.98, 0.99, 1),
  ];

  function newPage() {
    const pg = pdf.addPage([pageW, pageH]);
    // Watermark
    if (logoImage) {
      const sz = pageW * 0.5;
      pg.drawImage(logoImage, { x: (pageW - sz) / 2, y: (pageH - sz) / 2, width: sz, height: sz, opacity: 0.06 });
      pg.drawImage(logoImage, { x: M, y: pageH - M - 36, width: 36, height: 36 });
    }
    pg.drawText("Aycan Turizm", { x: M + 42, y: pageH - M - 14, size: 12, font: fB, color: blue });
    pg.drawText(`Gunluk Giris Kontrol Raporu — ${date}`, { x: M + 42, y: pageH - M - 28, size: 9, font: fR, color: blue });
    pg.drawText(safeT(new Date().toLocaleString("tr-TR")), { x: pageW - 185, y: pageH - M - 14, size: 8, font: fR, color: blue });
    pg.drawLine({ start: { x: M, y: pageH - M - 42 }, end: { x: pageW - M, y: pageH - M - 42 }, thickness: 1, color: lightBlue });
    return pg;
  }

  // ── Page 1 ─────────────────────────────────────────────────────────────
  let pg = newPage();
  let y = pageH - M - 62;

  // Summary boxes
  const s = data.summary;
  const boxes = [
    { label: "Toplam Giris", value: String(s.total_arrivals) },
    { label: "Firma Sayisi", value: String(s.company_count) },
    { label: "Arac Sayisi", value: String(s.vehicle_count) },
    { label: "Yogun Saat", value: s.peak_hour != null ? `${String(s.peak_hour).padStart(2, "0")}:00` : "-" },
  ];
  const bW = (pageW - M * 2 - 12) / 4;
  boxes.forEach((b, i) => {
    const bx = M + i * (bW + 4);
    pg.drawRectangle({ x: bx, y: y - 44, width: bW, height: 46, color: headerBg, borderColor: lightBlue, borderWidth: 1 });
    pg.drawText(safeT(b.label), { x: bx + 6, y: y - 14, size: 7, font: fR, color: blue });
    pg.drawText(safeT(b.value), { x: bx + 6, y: y - 30, size: 14, font: fB, color: blue });
  });
  y -= 56;

  // Dun karsilastirma
  if (s.prev_total > 0) {
    const trend = Math.round(((s.total_arrivals - s.prev_total) / s.prev_total) * 100);
    pg.drawText(safeT(`Onceki gun (${s.prev_date}): ${s.prev_total}  |  Degisim: ${trend >= 0 ? "+" : ""}${trend}%`), {
      x: M, y, size: 8, font: fR, color: blue,
    });
    y -= 14;
  }

  y -= 10;

  // ── Firma tablosu ──────────────────────────────────────────────────────
  pg.drawText("Firma Bazli Detay", { x: M, y, size: 10, font: fB, color: blue }); y -= 16;
  const cCols = ["Firma", "Toplam", "Arac", "Ilk Giris", "Son Giris", "Guzergahlar"];
  const cWidths = [130, 42, 40, 52, 52, 162];
  const rH = 16;

  function drawTableHeader(page: any, yPos: number, cols: string[], widths: number[]) {
    let cx = M;
    page.drawRectangle({ x: M, y: yPos - rH + 3, width: pageW - M*2, height: rH, color: headerBg });
    cols.forEach((c, i) => {
      page.drawText(safeT(c), { x: cx + 3, y: yPos - 11, size: 7, font: fB, color: blue });
      cx += widths[i];
    });
  }

  function drawRow(page: any, yPos: number, vals: string[], widths: number[], alt: boolean) {
    if (alt) page.drawRectangle({ x: M, y: yPos - rH + 3, width: pageW - M*2, height: rH, color: rowAlt });
    let cx = M;
    vals.forEach((v, i) => {
      const maxC = Math.floor(widths[i] / 5.5);
      const cell = safeT(v.length > maxC ? v.slice(0, maxC - 1) + "…" : v);
      page.drawText(cell, { x: cx + 3, y: yPos - 11, size: 7, font: fR, color: rgb(0.1, 0.1, 0.1) });
      cx += widths[i];
    });
  }

  drawTableHeader(pg, y, cCols, cWidths); y -= rH;
  data.by_company.forEach((row: any, idx: number) => {
    if (y < M + 30) { pg = newPage(); y = pageH - M - 62; drawTableHeader(pg, y, cCols, cWidths); y -= rH; }
    drawRow(pg, y, [
      row.firma, String(row.toplam_giris), String(row.farkli_arac),
      row.ilk_giris ?? "-", row.son_giris ?? "-",
      row.guzergahlar || "-",
    ], cWidths, idx % 2 === 1);
    y -= rH;
  });

  y -= 14;

  // ── Detay tablosu ──────────────────────────────────────────────────────
  if (y < M + 60) { pg = newPage(); y = pageH - M - 62; }
  pg.drawText("Tum Giris Kayitlari", { x: M, y, size: 10, font: fB, color: blue }); y -= 16;
  const dCols = ["Saat", "Firma", "Plaka", "Guzergah", "Not"];
  const dWidths = [40, 150, 70, 130, 133];
  drawTableHeader(pg, y, dCols, dWidths); y -= rH;
  data.detail.forEach((row: any, idx: number) => {
    if (y < M + 30) { pg = newPage(); y = pageH - M - 62; drawTableHeader(pg, y, dCols, dWidths); y -= rH; }
    drawRow(pg, y, [
      row.giris_saati ?? "-", row.firma, row.plaka,
      row.guzergah || "-", row.not_ || "-",
    ], dWidths, idx % 2 === 1);
    y -= rH;
  });

  return pdf.save();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user)
      return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 401 });
    if (!hasPermission(user, "reports:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || todayIstanbul();

    const db = getDb();

    // ── 1. Genel özet ──────────────────────────────────────────────────────────
    const summaryRow = await db.prepare(`
      SELECT
        COUNT(*)                                                          AS total_arrivals,
        COUNT(DISTINCT va.company_id)                                     AS company_count,
        COUNT(DISTINCT va.vehicle_id)                                     AS vehicle_count,
        HOUR(DATE_ADD(STR_TO_DATE(SUBSTRING(va.arrived_at,1,19),'%Y-%m-%dT%H:%i:%s'), INTERVAL 3 HOUR)) AS peak_hour_raw
      FROM vehicle_arrivals va
      WHERE va.arrival_date = ?
    `).get(date) as any;

    // Peak hour ayrı hesaplanıyor (GROUP BY ile)
    const peakHourRow = await db.prepare(`
      SELECT
        HOUR(DATE_ADD(STR_TO_DATE(SUBSTRING(va.arrived_at,1,19),'%Y-%m-%dT%H:%i:%s'), INTERVAL 3 HOUR)) AS saat,
        COUNT(*) AS adet
      FROM vehicle_arrivals va
      WHERE va.arrival_date = ?
      GROUP BY saat
      ORDER BY adet DESC
      LIMIT 1
    `).get(date) as any;

    // ── 2. Firma bazlı detay ───────────────────────────────────────────────────
    const byCompany = await db.prepare(`
      SELECT
        c.name                                                            AS firma,
        c.id                                                              AS company_id,
        COUNT(*)                                                          AS toplam_giris,
        COUNT(DISTINCT va.vehicle_id)                                     AS farkli_arac,
        MIN(DATE_FORMAT(DATE_ADD(STR_TO_DATE(SUBSTRING(va.arrived_at,1,19),'%Y-%m-%dT%H:%i:%s'), INTERVAL 3 HOUR),'%H:%i')) AS ilk_giris,
        MAX(DATE_FORMAT(DATE_ADD(STR_TO_DATE(SUBSTRING(va.arrived_at,1,19),'%Y-%m-%dT%H:%i:%s'), INTERVAL 3 HOUR),'%H:%i')) AS son_giris,
        GROUP_CONCAT(DISTINCT COALESCE(cv.route_name,'') ORDER BY cv.route_name SEPARATOR ', ') AS guzergahlar
      FROM vehicle_arrivals va
      JOIN companies c ON c.id = va.company_id
      LEFT JOIN company_vehicles cv ON cv.id = va.vehicle_id
      WHERE va.arrival_date = ?
      GROUP BY c.id, c.name
      ORDER BY toplam_giris DESC
    `).all(date) as any[];

    // ── 3. Saat bazlı dağılım ─────────────────────────────────────────────────
    const byHour = await db.prepare(`
      SELECT
        HOUR(DATE_ADD(STR_TO_DATE(SUBSTRING(va.arrived_at,1,19),'%Y-%m-%dT%H:%i:%s'), INTERVAL 3 HOUR)) AS saat,
        COUNT(*) AS adet
      FROM vehicle_arrivals va
      WHERE va.arrival_date = ?
      GROUP BY saat
      ORDER BY saat ASC
    `).all(date) as any[];

    // ── 4. Tüm kayıtlar (detay) ────────────────────────────────────────────────
    const detail = await db.prepare(`
      SELECT
        c.name                                                                 AS firma,
        cv.plate                                                               AS plaka,
        COALESCE(cv.route_name,'')                                             AS guzergah,
        DATE_FORMAT(DATE_ADD(STR_TO_DATE(SUBSTRING(va.arrived_at,1,19),'%Y-%m-%dT%H:%i:%s'), INTERVAL 3 HOUR),'%H:%i') AS giris_saati,
        va.note                                                                AS not_
      FROM vehicle_arrivals va
      JOIN companies c ON c.id = va.company_id
      JOIN company_vehicles cv ON cv.id = va.vehicle_id
      WHERE va.arrival_date = ?
      ORDER BY va.arrived_at ASC
    `).all(date) as any[];

    // ── 5. Geçen gün karşılaştırmalı (dün) ───────────────────────────────────
    const yesterday = new Date(date + "T00:00:00");
    yesterday.setDate(yesterday.getDate() - 1);
    const prevDate = yesterday.toISOString().split("T")[0];

    const prevRow = await db.prepare(`
      SELECT COUNT(*) AS total FROM vehicle_arrivals WHERE arrival_date = ?
    `).get(prevDate) as any;

    // Tam saatlik grid (06-20 arası)
    const hourGrid: { saat: number; adet: number }[] = [];
    for (let h = 6; h <= 20; h++) {
      const found = byHour.find((x: any) => Number(x.saat) === h);
      hourGrid.push({ saat: h, adet: found ? Number(found.adet) : 0 });
    }

    const format = searchParams.get("format");

    if (format === "pdf") {
      // collect all data first then build PDF
      const byHourGrid: { saat: number; adet: number }[] = [];
      for (let h = 6; h <= 20; h++) {
        const found = byHour.find((x: any) => Number(x.saat) === h);
        byHourGrid.push({ saat: h, adet: found ? Number(found.adet) : 0 });
      }
      const pdfData = {
        summary: {
          total_arrivals: Number(summaryRow?.total_arrivals ?? 0),
          company_count: Number(summaryRow?.company_count ?? 0),
          vehicle_count: Number(summaryRow?.vehicle_count ?? 0),
          peak_hour: peakHourRow ? Number(peakHourRow.saat) : null,
          prev_total: Number(prevRow?.total ?? 0),
          prev_date: prevDate,
        },
        by_company: byCompany,
        by_hour: byHourGrid,
        detail,
      };
      const pdfBytes = await buildGunlukPdf(date, pdfData);
      const safeDate = date.replace(/-/g, "");
      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="gunluk-giris-raporu_${safeDate}.pdf"`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        date,
        summary: {
          total_arrivals: Number(summaryRow?.total_arrivals ?? 0),
          company_count: Number(summaryRow?.company_count ?? 0),
          vehicle_count: Number(summaryRow?.vehicle_count ?? 0),
          peak_hour: peakHourRow ? Number(peakHourRow.saat) : null,
          prev_total: Number(prevRow?.total ?? 0),
          prev_date: prevDate,
        },
        by_company: byCompany,
        by_hour: hourGrid,
        detail,
      },
    });
  } catch (error) {
    console.error("gunluk-rapor error:", error);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
