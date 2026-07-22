import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import type { ReportResult, ChartData, ChartSeries } from "./queries";

// ─── XLSX ──────────────────────────────────────────────────────────────────────

export async function buildXlsx(title: string, result: ReportResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Aycan Turizm OPS";
  wb.created = new Date();

  const headerFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0D2C61" },
  };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
  const altFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF2F6FF" },
  };
  const borderStyle: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFCBD5E1" } };
  const cellBorder = { top: borderStyle, left: borderStyle, bottom: borderStyle, right: borderStyle };

  function addDataSheet(ws: ExcelJS.Worksheet, rows: Record<string, unknown>[], sheetTitle: string) {
    if (rows.length === 0) {
      ws.addRow(["Veri bulunamadı"]);
      return;
    }

    // Normalize ISO dates to TR format (DD.MM.YYYY) for display
    function fmtCell(v: unknown): unknown {
      if (typeof v === "string") {
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const [y, m, d] = v.split("-");
          return `${d}.${m}.${y}`;
        }
        if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
          const [y, m, d] = v.split("T")[0].split("-");
          return `${d}.${m}.${y}`;
        }
      }
      return v;
    }

    const keys = Object.keys(rows[0]);
    ws.columns = keys.map((k) => ({
      header: k,
      key: k,
      width: Math.min(Math.max(k.length + 4, 12), 30),
    })) as ExcelJS.Column[];

    // style header row
    const headerRow = ws.getRow(1);
    headerRow.height = 18;
    keys.forEach((_, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.alignment = { vertical: "middle", horizontal: "left" };
      cell.border = cellBorder;
    });

    rows.forEach((row, ri) => {
      const formattedRow = Object.fromEntries(keys.map(k => [k, fmtCell(row[k])]));
      const exRow = ws.addRow(formattedRow);
      exRow.height = 16;
      keys.forEach((_, i) => {
        const cell = exRow.getCell(i + 1);
        cell.font = { size: 9 };
        cell.alignment = { vertical: "middle" };
        cell.border = cellBorder;
        if (ri % 2 === 1) cell.fill = altFill;
      });
    });

    // totals row
    const totalRow = ws.addRow({});
    totalRow.height = 18;
    const firstKey = keys[0];
    totalRow.getCell(1).value = `Toplam: ${rows.length} kayıt`;
    totalRow.getCell(1).font = { bold: true, size: 9 };
    totalRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  }

  // sections → one sheet each
  if (result.sections && result.sections.length > 0) {
    for (const sec of result.sections) {
      const ws = wb.addWorksheet(sec.title.slice(0, 31));
      addDataSheet(ws, sec.rows, sec.title);
    }
  } else {
    const ws = wb.addWorksheet(title.slice(0, 31));
    addDataSheet(ws, result.rows, title);
  }

  // summary sheet if totals exist
  if (result.totals && Object.keys(result.totals).length > 0) {
    const ws = wb.addWorksheet("Özet");
    ws.addRow(["KPI", "Değer"]).eachCell(cell => {
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.border = cellBorder;
    });
    for (const [k, v] of Object.entries(result.totals)) {
      ws.addRow([k, v]);
    }
    ws.columns = [{ width: 30 }, { width: 20 }];
  }

  // chart data sheets
  if (result.charts && result.charts.length > 0) {
    const ws = wb.addWorksheet("Grafik Verileri");
    let col = 1;
    for (const chart of result.charts) {
      ws.getCell(1, col).value = chart.title;
      ws.getCell(1, col).font = { bold: true, size: 9 };
      ws.getCell(2, col).value = "Etiket";
      ws.getCell(2, col + 1).value = "Değer";
      chart.series.forEach((s, i) => {
        ws.getCell(3 + i, col).value = s.label;
        ws.getCell(3 + i, col + 1).value = s.value;
      });
      col += 3;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ─── PDF helpers ───────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const num = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return rgb((num >> 16 & 255) / 255, (num >> 8 & 255) / 255, (num & 255) / 255);
}

const PALETTE = [
  "#1E88E5", "#43A047", "#FB8C00", "#E53935", "#8E24AA",
  "#00ACC1", "#FFD600", "#6D4C41", "#546E7A", "#EC407A",
];

function seriesColor(s: ChartSeries, idx: number) {
  if (s.color) { try { return hexToRgb(s.color); } catch { /* fall through */ } }
  return hexToRgb(PALETTE[idx % PALETTE.length]);
}

function drawBarChart(page: any, chart: ChartData, x: number, y: number, w: number, h: number, fontBold: any, fontRegular: any) {
  const series = chart.series.slice(0, 12);
  if (series.length === 0) return;
  const maxVal = Math.max(...series.map(s => s.value), 1);
  const barW = (w - 2) / series.length;
  const barMaxH = h - 24;

  // title
  page.drawText(safeText(chart.title.length > 35 ? chart.title.slice(0, 34) + "..." : chart.title), {
    x, y: y + h + 4, size: 7, font: fontBold, color: rgb(0.05, 0.17, 0.38),
  });

  // axis line
  page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });

  series.forEach((s, i) => {
    const bh = clamp((s.value / maxVal) * barMaxH, 1, barMaxH);
    const bx = x + i * barW + 1;
    const by = y;
    const color = seriesColor(s, i);
    page.drawRectangle({ x: bx, y: by, width: barW - 2, height: bh, color });
    // value label
    page.drawText(String(s.value), {
      x: bx + 1, y: by + bh + 1, size: 5, font: fontRegular, color: rgb(0.2, 0.2, 0.2),
    });
    // x label
    const lbl = safeText(s.label.length > 6 ? s.label.slice(0, 5) + "..." : s.label);
    page.drawText(lbl, { x: bx, y: by - 9, size: 5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  });
}

function drawDonutChart(page: any, chart: ChartData, cx: number, cy: number, r: number, fontBold: any, fontRegular: any) {
  const series = chart.series.slice(0, 8).filter(s => s.value > 0);
  if (series.length === 0) return;
  const total = series.reduce((a, s) => a + s.value, 0);
  if (total === 0) return;

  page.drawText(safeText(chart.title.length > 25 ? chart.title.slice(0, 24) + "..." : chart.title), {
    x: cx - r, y: cy + r + 6, size: 7, font: fontBold, color: rgb(0.05, 0.17, 0.38),
  });

  // simplified: draw colored rectangles as legend bars (pdf-lib can't draw arcs natively)
  const innerR = r * 0.55;
  const outerR = r;
  const segments = series.length;
  const legendX = cx + outerR + 6;
  let legendY = cy + outerR;

  // draw as stacked horizontal bar
  let startX = cx - outerR;
  const barH = 14;
  series.forEach((s, i) => {
    const segW = (s.value / total) * (outerR * 2);
    const color = seriesColor(s, i);
    page.drawRectangle({ x: startX, y: cy - barH / 2, width: segW, height: barH, color });
    // legend
    page.drawRectangle({ x: legendX, y: legendY - 5, width: 7, height: 7, color });
    const lbl = safeText(s.label.length > 14 ? s.label.slice(0, 13) + "..." : s.label);
    page.drawText(`${lbl}: ${s.value}`, {
      x: legendX + 9, y: legendY - 4, size: 6, font: fontRegular, color: rgb(0.2, 0.2, 0.2),
    });
    legendY -= 11;
    startX += segW;
  });

  // inner white to make "donut"
  page.drawRectangle({ x: cx - innerR * 0.55, y: cy - barH / 2 - 1, width: innerR * 1.1, height: barH + 2, color: rgb(1, 1, 1) });
  // total label
  page.drawText(`${total}`, { x: cx - 8, y: cy - 3, size: 7, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
}

function drawLineChart(page: any, chart: ChartData, x: number, y: number, w: number, h: number, fontBold: any, fontRegular: any) {
  const series = chart.series.slice(0, 20);
  if (series.length < 2) {
    drawBarChart(page, chart, x, y, w, h, fontBold, fontRegular);
    return;
  }
  const maxVal = Math.max(...series.map(s => s.value), 1);

  page.drawText(safeText(chart.title.length > 35 ? chart.title.slice(0, 34) + "..." : chart.title), {
    x, y: y + h + 4, size: 7, font: fontBold, color: rgb(0.05, 0.17, 0.38),
  });

  page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  page.drawLine({ start: { x, y }, end: { x, y: y + h }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });

  const stepX = w / (series.length - 1);
  const color = hexToRgb(PALETTE[0]);

  series.forEach((s, i) => {
    const px = x + i * stepX;
    const py = y + (s.value / maxVal) * (h - 10);
    if (i > 0) {
      const prev = series[i - 1];
      const ppx = x + (i - 1) * stepX;
      const ppy = y + (prev.value / maxVal) * (h - 10);
      page.drawLine({ start: { x: ppx, y: ppy }, end: { x: px, y: py }, thickness: 1, color });
    }
    page.drawRectangle({ x: px - 2, y: py - 2, width: 4, height: 4, color });

    const lbl = safeText(s.label.length > 4 ? s.label.slice(-4) : s.label);
    if (i % Math.ceil(series.length / 8) === 0) {
      page.drawText(lbl, { x: px - 5, y: y - 9, size: 5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
    }
  });
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

/** Replace Turkish chars that WinAnsi (Helvetica) cannot encode, plus non-Latin-1 */
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

const PAGE_MARGIN = 36;
const ROW_HEIGHT = 16;
const TABLE_START_Y = 720;

export async function buildPdf(title: string, result: ReportResult, logoPath: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logoImage: any = null;
  try {
    const logoBytes = await fs.readFile(logoPath);
    logoImage = await pdf.embedPng(logoBytes);
  } catch { /* no logo */ }

  function drawPageHeader(page: any, pageTitle: string) {
    const { width, height } = page.getSize();
    const headerTop = height - 40;

    if (logoImage) {
      const wmSize = Math.min(width, height) * 0.55;
      page.drawImage(logoImage, {
        x: (width - wmSize) / 2, y: (height - wmSize) / 2,
        width: wmSize, height: wmSize, opacity: 0.06,
      });
      page.drawImage(logoImage, {
        x: PAGE_MARGIN, y: headerTop - 18, width: 32, height: 32,
      });
    }

    page.drawText("Aycan Turizm", {
      x: PAGE_MARGIN + 38, y: headerTop + 4, size: 11,
      font: fontBold, color: rgb(0.05, 0.17, 0.38),
    });
    page.drawText(safeText(pageTitle), {
      x: PAGE_MARGIN + 38, y: headerTop - 9, size: 9,
      font: fontRegular, color: rgb(0.25, 0.33, 0.47),
    });
    page.drawText(safeText(new Date().toLocaleString("tr-TR")), {
      x: width - 160, y: headerTop + 4, size: 8,
      font: fontRegular, color: rgb(0.35, 0.45, 0.55),
    });
    page.drawLine({
      start: { x: PAGE_MARGIN, y: headerTop - 18 },
      end: { x: width - PAGE_MARGIN, y: headerTop - 18 },
      thickness: 1, color: rgb(0.01, 0.68, 0.94),
    });
  }

  function drawTable(page: any, rows: Record<string, unknown>[], startY: number, pageTitle: string) {
    const { width } = page.getSize();
    const tableWidth = width - PAGE_MARGIN * 2;

    if (rows.length === 0) {
      page.drawText("Veri bulunamadi", { x: PAGE_MARGIN, y: startY, size: 10, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
      return;
    }

    const columns = Object.keys(rows[0]);
    const colWidth = tableWidth / columns.length;

    // header row
    page.drawRectangle({ x: PAGE_MARGIN, y: startY - ROW_HEIGHT + 2, width: tableWidth, height: ROW_HEIGHT, color: rgb(0.05, 0.17, 0.38) });
    columns.forEach((col, i) => {
      const lbl = safeText(col.length > 18 ? col.slice(0, 17) + "..." : col);
      page.drawText(lbl, {
        x: PAGE_MARGIN + i * colWidth + 3, y: startY - 11,
        size: 7, font: fontBold, color: rgb(1, 1, 1),
      });
    });
    let currentY = startY - ROW_HEIGHT;

    let currentPage = page;
    for (let ri = 0; ri < rows.length; ri++) {
      if (currentY < 60) {
        currentPage = pdf.addPage();
        drawPageHeader(currentPage, pageTitle);
        currentY = TABLE_START_Y;
        // re-draw header
        const { width: w2 } = currentPage.getSize();
        const tw = w2 - PAGE_MARGIN * 2;
        const cw = tw / columns.length;
        currentPage.drawRectangle({ x: PAGE_MARGIN, y: currentY - ROW_HEIGHT + 2, width: tw, height: ROW_HEIGHT, color: rgb(0.05, 0.17, 0.38) });
        columns.forEach((col, i) => {
          const lbl2 = safeText(col.length > 18 ? col.slice(0, 17) + "..." : col);
          currentPage.drawText(lbl2, { x: PAGE_MARGIN + i * cw + 3, y: currentY - 11, size: 7, font: fontBold, color: rgb(1, 1, 1) });
        });
        currentY -= ROW_HEIGHT;
      }
      const row = rows[ri];
      if (ri % 2 === 1) {
        currentPage.drawRectangle({ x: PAGE_MARGIN, y: currentY - ROW_HEIGHT + 2, width: tableWidth, height: ROW_HEIGHT, color: rgb(0.96, 0.98, 1) });
      }
      columns.forEach((col, i) => {
        const raw = row[col];
        const text = raw == null || raw === "" ? "-" : String(raw);
        const cell = safeText(text.length > 22 ? text.slice(0, 21) + "..." : text);
        currentPage.drawText(cell, {
          x: PAGE_MARGIN + i * colWidth + 3, y: currentY - 11,
          size: 7, font: fontRegular, color: rgb(0.18, 0.22, 0.28),
        });
      });
      currentY -= ROW_HEIGHT;
    }
  }

  function drawCharts(page: any, charts: ChartData[], startY: number) {
    const { width } = page.getSize();
    const usableW = width - PAGE_MARGIN * 2;
    const chartH = 80;
    const chartW = Math.floor(usableW / 2) - 8;
    let cx = PAGE_MARGIN;
    let cy = startY - chartH - 20;

    for (const chart of charts.slice(0, 4)) {
      if (cx + chartW > width - PAGE_MARGIN) {
        cx = PAGE_MARGIN;
        cy -= chartH + 28;
      }
      if (chart.type === "bar") {
        drawBarChart(page, chart, cx, cy, chartW, chartH, fontBold, fontRegular);
      } else if (chart.type === "line") {
        drawLineChart(page, chart, cx, cy, chartW, chartH, fontBold, fontRegular);
      } else if (chart.type === "donut") {
        drawDonutChart(page, chart, cx + chartW / 2, cy + chartH / 2, chartH / 2 - 4, fontBold, fontRegular);
      } else {
        drawBarChart(page, chart, cx, cy, chartW, chartH, fontBold, fontRegular);
      }
      cx += chartW + 16;
    }
  }

  // draw sections
  const sections = result.sections && result.sections.length > 0
    ? result.sections
    : [{ title, rows: result.rows, charts: result.charts }];

  for (const section of sections) {
    const page = pdf.addPage();
    drawPageHeader(page, section.title || title);

    const { height } = page.getSize();
    const chartsH = section.charts.length > 0 ? 120 : 0;
    const tableY = height - 70 - chartsH;

    if (section.charts.length > 0) {
      drawCharts(page, section.charts, height - 65);
    }
    drawTable(page, section.rows, tableY, section.title || title);
  }

  // totals page
  if (result.totals && Object.keys(result.totals).length > 0) {
    const page = pdf.addPage();
    drawPageHeader(page, title + " -- Ozet");
    const { height } = page.getSize();
    let ty = height - 80;
    page.drawText("Ozet / KPI", { x: PAGE_MARGIN, y: ty, size: 11, font: fontBold, color: rgb(0.05, 0.17, 0.38) });
    ty -= 20;
    for (const [k, v] of Object.entries(result.totals)) {
      page.drawText(safeText(`${k}:`), { x: PAGE_MARGIN, y: ty, size: 9, font: fontBold, color: rgb(0.2, 0.3, 0.4) });
      page.drawText(safeText(String(v)), { x: PAGE_MARGIN + 180, y: ty, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
      ty -= 16;
    }
  }

  return pdf.save();
}
