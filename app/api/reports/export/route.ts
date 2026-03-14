import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";

type ReportRow = Record<string, unknown>;

async function buildPdfReport(
  title: string,
  rows: ReportRow[],
  logoPath: string
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logoImage: any = null;
  try {
    const logoBytes = await fs.readFile(logoPath);
    logoImage = await pdf.embedPng(logoBytes);
  } catch {
    logoImage = null;
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : ["Kayıt"];
  const pageMargin = 36;
  const rowHeight = 18;
  const headerTop = 805;
  const tableStartY = 730;

  function drawPageHeader(page: any) {
    const { width, height } = page.getSize();

    if (logoImage) {
      const wmSize = Math.min(width, height) * 0.58;
      page.drawImage(logoImage, {
        x: (width - wmSize) / 2,
        y: (height - wmSize) / 2,
        width: wmSize,
        height: wmSize,
        opacity: 0.08,
      });

      page.drawImage(logoImage, {
        x: pageMargin,
        y: headerTop - 20,
        width: 36,
        height: 36,
      });
    }

    page.drawText("Aycan Turizm", {
      x: pageMargin + 44,
      y: headerTop,
      size: 12,
      font: fontBold,
      color: rgb(0.05, 0.17, 0.38),
    });

    page.drawText(title, {
      x: pageMargin,
      y: headerTop - 28,
      size: 11,
      font: fontBold,
      color: rgb(0.05, 0.17, 0.38),
    });

    page.drawText(new Date().toLocaleString("tr-TR"), {
      x: width - 185,
      y: headerTop,
      size: 9,
      font: fontRegular,
      color: rgb(0.23, 0.33, 0.47),
    });

    page.drawLine({
      start: { x: pageMargin, y: headerTop - 36 },
      end: { x: width - pageMargin, y: headerTop - 36 },
      thickness: 1,
      color: rgb(0.01, 0.68, 0.94),
    });
  }

  function drawTableHeader(page: any, y: number) {
    const { width } = page.getSize();
    const tableWidth = width - pageMargin * 2;
    const colWidth = tableWidth / columns.length;

    page.drawRectangle({
      x: pageMargin,
      y: y - rowHeight + 2,
      width: tableWidth,
      height: rowHeight,
      color: rgb(0.94, 0.97, 1),
    });

    columns.forEach((col, i) => {
      const label = String(col);
      page.drawText(label.length > 20 ? `${label.slice(0, 19)}...` : label, {
        x: pageMargin + i * colWidth + 4,
        y: y - 12,
        size: 8,
        font: fontBold,
        color: rgb(0.05, 0.17, 0.38),
      });
    });

    return { colWidth, tableWidth };
  }

  if (rows.length === 0) {
    const page = pdf.addPage();
    drawPageHeader(page);
    page.drawText("Veri bulunamadı", {
      x: pageMargin,
      y: tableStartY,
      size: 11,
      font: fontRegular,
      color: rgb(0.25, 0.25, 0.25),
    });
    return pdf.save();
  }

  let page = pdf.addPage();
  drawPageHeader(page);
  let currentY = tableStartY;
  let { colWidth } = drawTableHeader(page, currentY);
  currentY -= rowHeight;

  for (let index = 0; index < rows.length; index++) {
    if (currentY < 62) {
      page = pdf.addPage();
      drawPageHeader(page);
      currentY = tableStartY;
      ({ colWidth } = drawTableHeader(page, currentY));
      currentY -= rowHeight;
    }

    const row = rows[index];
    if (index % 2 === 1) {
      page.drawRectangle({
        x: pageMargin,
        y: currentY - rowHeight + 2,
        width: colWidth * columns.length,
        height: rowHeight,
        color: rgb(0.98, 0.99, 1),
      });
    }

    columns.forEach((col, i) => {
      const raw = row[col];
      const text = raw == null || raw === "" ? "-" : String(raw);
      const cell = text.length > 24 ? `${text.slice(0, 23)}...` : text;
      page.drawText(cell, {
        x: pageMargin + i * colWidth + 4,
        y: currentY - 12,
        size: 7,
        font: fontRegular,
        color: rgb(0.18, 0.21, 0.26),
      });
    });

    currentY -= rowHeight;
  }

  return pdf.save();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Yetkisiz erişim" },
        { status: 401 }
      );
    }

    if (!isAtLeast(user.role, "yonetici")) {
      return NextResponse.json(
        { ok: false, error: "Yetersiz yetki" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const format = (searchParams.get("format") || "xlsx").toLowerCase();

    if (!type) {
      return NextResponse.json(
        { ok: false, error: "Rapor tipi gerekli (worklog, todo, ticket, giris-kontrol)" },
        { status: 400 }
      );
    }

    const db = getDb();
    let rows: ReportRow[] = [];
    let filenameBase = "export";
    let sheetTitle = "Rapor";

    if (type === "worklog") {
      rows = await db
        .prepare(
          `SELECT 
             worklogs.work_date,
             users.full_name as user_name,
             worklogs.status_code,
             worklogs.summary
           FROM worklogs
           JOIN users ON users.id = worklogs.user_id
           ORDER BY worklogs.work_date DESC`
        )
        .all() as ReportRow[];
      filenameBase = "worklog_export";
      sheetTitle = "Günlük Raporu";
    } else if (type === "todo") {
      rows = await db
        .prepare(
          `SELECT 
             todos.title,
             todos.status_code,
             todos.priority_code,
             users.full_name as assigned_name,
             todos.due_date,
             todos.created_at
           FROM todos
           LEFT JOIN users ON users.id = todos.assigned_to
           ORDER BY todos.created_at DESC`
        )
        .all() as ReportRow[];
      filenameBase = "todo_export";
      sheetTitle = "Görev Raporu";
    } else if (type === "ticket") {
      rows = await db
        .prepare(
          `SELECT 
             tickets.ticket_no,
             tickets.title,
             tickets.status_code,
             tickets.priority_code,
             users.full_name as assigned_name,
             tickets.sla_due_at,
             tickets.created_at,
             tickets.closed_at
           FROM tickets
           LEFT JOIN users ON users.id = tickets.assigned_to
           ORDER BY tickets.created_at DESC`
        )
        .all() as ReportRow[];
      filenameBase = "ticket_export";
      sheetTitle = "Sorun Raporu";
    } else if (type === "giris-kontrol") {
      const company_ids = searchParams.getAll("company_id");
      const date_from = searchParams.get("date_from");
      const date_to = searchParams.get("date_to");

      const params: string[] = [];
      let where = "";
      if (company_ids.length > 0) {
        where += ` AND va.company_id IN (${company_ids.map(() => "?").join(",")})`;
        params.push(...company_ids);
      }
      if (date_from)  { where += " AND va.arrival_date >= ?"; params.push(date_from); }
      if (date_to)    { where += " AND va.arrival_date <= ?"; params.push(date_to); }

      const gcRows = await db.prepare(`
        SELECT
          c.name                              AS "Firma",
          cv.plate                            AS "Plaka",
          COALESCE(cv.route_name, '')         AS "Güzergah",
          COALESCE(cv.driver_name, '')        AS "Şöför",
          COALESCE(cv.notes, '')              AS "Notlar",
          va.arrival_date                     AS "Tarih",
          DATE_FORMAT(DATE_ADD(STR_TO_DATE(SUBSTRING(va.arrived_at, 1, 19), '%Y-%m-%dT%H:%i:%s'), INTERVAL 3 HOUR), '%H:%i') AS "Giriş Saati",
          u.full_name                         AS "Kaydeden",
          ROUND(COALESCE(va.latitude, 0), 6)  AS "Enlem",
          ROUND(COALESCE(va.longitude, 0), 6) AS "Boylam"
        FROM vehicle_arrivals va
        JOIN company_vehicles cv ON cv.id = va.vehicle_id
        JOIN companies c         ON c.id  = va.company_id
        LEFT JOIN users u        ON u.id  = va.recorded_by
        WHERE 1=1 ${where}
        ORDER BY va.arrived_at DESC
      `).all(...params) as ReportRow[];
      rows = gcRows;
      sheetTitle = "Giriş Kontrol Raporu";

      const safeName = company_ids.length === 1
        ? ((await db.prepare("SELECT name FROM companies WHERE id = ?").get(company_ids[0]) as any)?.name || "firma").replace(/[^a-zA-Z0-9_\-]/g, "_")
        : company_ids.length > 1 ? "secili_firmalar" : "tum_firmalar";
      const fileDate  = date_from || new Date().toISOString().split("T")[0];
      filenameBase = `giris_kontrol_${safeName}_${fileDate}`;
    } else {
      return NextResponse.json(
        { ok: false, error: "Geçersiz rapor tipi" },
        { status: 400 }
      );
    }

    if (format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(sheetTitle.slice(0, 31));
      if (rows.length > 0) {
        ws.columns = Object.keys(rows[0]).map((key) => ({ header: key, key })) as ExcelJS.Column[];
        rows.forEach((row) => ws.addRow(row));
      }
      const buf = await wb.xlsx.writeBuffer();

      return new NextResponse(buf as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
        },
      });
    }

    if (format === "pdf") {
      const logoPath = path.join(process.cwd(), "public", "branding", "aycan-logo.png");
      const pdfBytes = await buildPdfReport(sheetTitle, rows, logoPath);

      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
        },
      });
    }

    return NextResponse.json(
      { ok: false, error: "Geçersiz format. Desteklenen: xlsx, pdf" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

