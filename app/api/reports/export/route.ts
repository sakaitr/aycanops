import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasReportPermission } from "@/lib/permissions";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import { getReport } from "@/lib/reports/catalog";
import { runReport } from "@/lib/reports/queries";
import { buildXlsx, buildPdf } from "@/lib/reports/engine";
// Dinamik import: inspection-pdf.ts modül seviyesinde "sharp" yüklüyor, native
// binding bu container'da (linuxmusl-x64) yüklenemiyor. Statik import olsaydı
// bu modülün sadece var olması, arac-denetim'le ilgisi olmayan TÜM rapor
// export'larını (örn. giriş kontrol) çökertiyordu.

type ReportRow = Record<string, unknown>;

/** Replace Turkish chars that WinAnsi (Helvetica) cannot encode */
function safeText(s: string): string {
  return String(s)
    .replace(/İ/g, "I").replace(/ı/g, "i")
    .replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g")
    .replace(/Ü/g, "U").replace(/ü/g, "u")
    .replace(/Ö/g, "O").replace(/ö/g, "o")
    .replace(/Ç/g, "C").replace(/ç/g, "c")
    .replace(/[^\x00-\xFF]/g, "?");
}

// Uzun serbest metin taşıyan kolonlar (güzergah adı, not, açıklama vb.) diğer
// kolonlarla eşit genişlik alınca kesiliyordu — bunlara orantılı olarak daha
// fazla yer ayrılır, kısa/sabit-format kolonlar (tarih, saat, plaka) daralır.
const WIDE_COLUMNS = ["güzergah", "not", "notlar", "açıklama", "aciklama", "summary", "title", "özet", "ozet"];
const NARROW_COLUMNS = ["tarih", "saat", "giriş saati", "plaka", "no", "ticket_no", "status_code", "priority_code"];

function columnWeight(name: string): number {
  const n = name.toLowerCase();
  if (WIDE_COLUMNS.some(w => n.includes(w))) return 1.7;
  if (NARROW_COLUMNS.some(w => n.includes(w))) return 0.85;
  return 1;
}

/** Metni verilen genişliğe (pt) sığana kadar keser, gerekirse "..." ekler. */
function truncateToWidth(text: string, font: any, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${text.slice(0, mid)}...`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) lo = mid; else hi = mid - 1;
  }
  return lo <= 0 ? text.slice(0, 1) : `${text.slice(0, lo)}...`;
}

async function buildPdfReport(
  title: string,
  rows: ReportRow[],
  logoPath: string,
  orientation: "portrait" | "landscape" = "portrait"
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

  const columns = rows.length > 0 ? Object.keys(rows[0]) : ["Kayit"];
  const weights = columns.map(columnWeight);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const pageSize: [number, number] = orientation === "landscape" ? [841.89, 595.28] : [595.28, 841.89];
  const pageMargin = 36;
  const rowHeight = 18;
  const headerTop = pageSize[1] - 37;
  const tableStartY = headerTop - 75;

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

    page.drawText(safeText(title), {
      x: pageMargin,
      y: headerTop - 28,
      size: 11,
      font: fontBold,
      color: rgb(0.05, 0.17, 0.38),
    });

    page.drawText(safeText(new Date().toLocaleString("tr-TR")), {
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
    const colWidths = weights.map(w => (w / weightSum) * tableWidth);
    const colX: number[] = [];
    colWidths.reduce((acc, w, i) => { colX[i] = acc; return acc + w; }, pageMargin);

    page.drawRectangle({
      x: pageMargin,
      y: y - rowHeight + 2,
      width: tableWidth,
      height: rowHeight,
      color: rgb(0.94, 0.97, 1),
    });

    columns.forEach((col, i) => {
      const label = truncateToWidth(safeText(String(col)), fontBold, 8, colWidths[i] - 8);
      page.drawText(label, {
        x: colX[i] + 4,
        y: y - 12,
        size: 8,
        font: fontBold,
        color: rgb(0.05, 0.17, 0.38),
      });
    });

    return { colWidths, colX, tableWidth };
  }

  if (rows.length === 0) {
    const page = pdf.addPage(pageSize);
    drawPageHeader(page);
    page.drawText("Veri bulunamadi", {
      x: pageMargin,
      y: tableStartY,
      size: 11,
      font: fontRegular,
      color: rgb(0.25, 0.25, 0.25),
    });
    return pdf.save();
  }

  let page = pdf.addPage(pageSize);
  drawPageHeader(page);
  let currentY = tableStartY;
  let { colWidths, colX, tableWidth } = drawTableHeader(page, currentY);
  currentY -= rowHeight;

  for (let index = 0; index < rows.length; index++) {
    if (currentY < 62) {
      page = pdf.addPage(pageSize);
      drawPageHeader(page);
      currentY = tableStartY;
      ({ colWidths, colX, tableWidth } = drawTableHeader(page, currentY));
      currentY -= rowHeight;
    }

    const row = rows[index];
    if (index % 2 === 1) {
      page.drawRectangle({
        x: pageMargin,
        y: currentY - rowHeight + 2,
        width: tableWidth,
        height: rowHeight,
        color: rgb(0.98, 0.99, 1),
      });
    }

    columns.forEach((col, i) => {
      const raw = row[col];
      const text = raw == null || raw === "" ? "-" : String(raw);
      const cell = truncateToWidth(safeText(text), fontRegular, 7, colWidths[i] - 8);
      page.drawText(cell, {
        x: colX[i] + 4,
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

    if (!hasReportPermission(user, "export")) {
      return NextResponse.json(
        { ok: false, error: "Yetersiz yetki" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const format = (searchParams.get("format") || "xlsx").toLowerCase();
    const logoPath = path.join(process.cwd(), "public", "branding", "aycan-logo.png");

    // ── New catalog-based 20-report path ──────────────────────────────────────
    const reportParam = searchParams.get("report");
    if (reportParam) {
      const def = getReport(reportParam);
      if (!def) return NextResponse.json({ ok: false, error: "Geçersiz rapor ID" }, { status: 400 });
      if (!hasReportPermission(user, "export", def.roleMin)) return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

      const companyIds = searchParams.getAll("company_id");
      const dateFrom = searchParams.get("date_from") ?? undefined;
      const dateTo = searchParams.get("date_to") ?? undefined;

      const result = await runReport(def.id, companyIds, dateFrom, dateTo);
      const safeSlug = def.slug.replace(/[^a-zA-Z0-9_-]/g, "_");
      const fileDate = dateFrom ?? new Date().toISOString().split("T")[0];

      if (format === "xlsx") {
        const buf = await buildXlsx(def.name, result);
        return new NextResponse(buf as unknown as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${safeSlug}_${fileDate}.xlsx"`,
          },
        });
      }

      if (format === "pdf") {
        // Araç Denetim Raporu'nun PDF çıktısı, jenerik tablo yerine her
        // denetim için 1 sayfa (checklist + fotoğraflar) gösteren zengin
        // bir belge — XLSX çıktısı hâlâ jenerik tablo (yukarıdaki akış).
        if (def.slug === "arac-denetim") {
          const { buildInspectionPdf } = await import("@/lib/reports/inspection-pdf");
          const pdfBuffer = await buildInspectionPdf(companyIds, dateFrom, dateTo);
          return new NextResponse(pdfBuffer as unknown as BodyInit, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="${safeSlug}_${fileDate}.pdf"`,
            },
          });
        }

        const pdfBytes = await buildPdf(def.name, result, logoPath);
        return new NextResponse(Buffer.from(pdfBytes), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${safeSlug}_${fileDate}.pdf"`,
          },
        });
      }

      return NextResponse.json({ ok: false, error: "Geçersiz format" }, { status: 400 });
    }
    // ── End catalog path ──────────────────────────────────────────────────────

    if (!type) {
      return NextResponse.json(
        { ok: false, error: "Rapor tipi gerekli (worklog, todo, ticket, giris-kontrol) ya da report= parametresi" },
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
          va.arrival_date                     AS "Tarih",
          DATE_FORMAT(DATE_ADD(STR_TO_DATE(SUBSTRING(va.arrived_at, 1, 19), '%Y-%m-%dT%H:%i:%s'), INTERVAL 3 HOUR), '%H:%i') AS "Giriş Saati",
          u.full_name                         AS "Kaydeden",
          va.note                             AS "Not"
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
        rows.forEach((row) => {
          const formatted = Object.fromEntries(
            Object.entries(row).map(([k, v]) => {
              if (typeof v === "string") {
                if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
                  const [y, m, d] = v.split("-"); return [k, `${d}.${m}.${y}`];
                }
                if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
                  const [y, m, d] = v.split("T")[0].split("-"); return [k, `${d}.${m}.${y}`];
                }
              }
              return [k, v];
            })
          );
          ws.addRow(formatted);
        });
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
      const orientation = type === "giris-kontrol" ? "landscape" : "portrait";
      const pdfBytes = await buildPdfReport(sheetTitle, rows, logoPath, orientation);

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

