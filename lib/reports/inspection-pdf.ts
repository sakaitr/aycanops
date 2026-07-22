import { getDb } from "@/lib/db";
import { readInspectionPhotoPath } from "@/lib/uploads";
import sharp from "sharp";
import fs from "node:fs/promises";

type ChecklistItem = { label: string; ok: boolean | null; note?: string };
type PhotoRow = { id: string; filename: string; criterion_index: number | null };
type InspectionRow = {
  id: string;
  inspection_date: string;
  type: string;
  result: string;
  checklist_json: string | null;
  notes: string | null;
  plaka: string;
  firma: string;
};

const RESULT_LABELS: Record<string, { label: string; color: string }> = {
  pass: { label: "Geçti", color: "#34d399" },
  fail: { label: "Kaldı", color: "#f87171" },
  conditional: { label: "Şartlı", color: "#fbbf24" },
  pending: { label: "Bekliyor", color: "#a1a1aa" },
};

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Orijinal fotoğrafı (8MB'a kadar) HTML'e gömmeden önce küçültür — hem PDF
 * üretim belleğini hem çıktı dosya boyutunu makul tutar. */
async function photoToDataUri(filename: string): Promise<string | null> {
  try {
    const filePath = await readInspectionPhotoPath(filename);
    const original = await fs.readFile(filePath);
    const resized = await sharp(original)
      .resize({ width: 400, withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    return `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch {
    return null; // Fotoğraf okunamazsa sayfa yine de üretilir, sadece o görsel atlanır
  }
}

async function fetchInspections(
  companyIds: string[],
  dateFrom?: string,
  dateTo?: string
): Promise<InspectionRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (companyIds.length > 0) {
    conditions.push(`i.company_id IN (${companyIds.map(() => "?").join(",")})`);
    params.push(...companyIds);
  }
  if (dateFrom) { conditions.push("i.inspection_date >= ?"); params.push(dateFrom); }
  if (dateTo) { conditions.push("i.inspection_date <= ?"); params.push(dateTo); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await getDb().prepare(`
    SELECT
      i.id, i.inspection_date, i.type, i.result, i.checklist_json, i.notes,
      COALESCE(i.company_vehicle_plate, cv.plate, '—') AS plaka,
      COALESCE(co.name, '—') AS firma
    FROM inspections i
    LEFT JOIN company_vehicles cv ON cv.id = i.company_vehicle_id
    LEFT JOIN companies co ON co.id = i.company_id
    ${where}
    ORDER BY i.inspection_date DESC
    LIMIT 500
  `).all(...params) as InspectionRow[];

  return rows;
}

async function buildInspectionPageHtml(insp: InspectionRow): Promise<string> {
  let checklist: ChecklistItem[] = [];
  try { checklist = insp.checklist_json ? JSON.parse(insp.checklist_json) : []; } catch { checklist = []; }

  const photos = await getDb().prepare(
    "SELECT id, filename, criterion_index FROM inspection_photos WHERE inspection_id = ? ORDER BY created_at ASC"
  ).all(insp.id) as PhotoRow[];

  const photosByCriterion = new Map<number, PhotoRow[]>();
  const generalPhotos: PhotoRow[] = [];
  for (const p of photos) {
    if (p.criterion_index === null || p.criterion_index === undefined) generalPhotos.push(p);
    else {
      const list = photosByCriterion.get(p.criterion_index) ?? [];
      list.push(p);
      photosByCriterion.set(p.criterion_index, list);
    }
  }

  const rowsHtml = await Promise.all(checklist.map(async (item, idx) => {
    const criterionPhotos = photosByCriterion.get(idx) ?? [];
    const thumbs = (await Promise.all(criterionPhotos.map(p => photoToDataUri(p.filename))))
      .filter((uri): uri is string => !!uri)
      .map(uri => `<img src="${uri}" class="thumb" />`)
      .join("");
    const answerIcon = item.ok === true ? "✓" : item.ok === false ? "✗" : "—";
    const answerClass = item.ok === true ? "ok" : item.ok === false ? "fail" : "pending";
    return `
      <tr>
        <td class="q">${escapeHtml(item.label)}</td>
        <td class="ans ${answerClass}">${answerIcon}</td>
        <td class="note">${escapeHtml(item.note || "")}</td>
        <td class="photos">${thumbs}</td>
      </tr>`;
  }));

  const generalThumbs = (await Promise.all(generalPhotos.map(p => photoToDataUri(p.filename))))
    .filter((uri): uri is string => !!uri)
    .map(uri => `<img src="${uri}" class="thumb-large" />`)
    .join("");

  const resultInfo = RESULT_LABELS[insp.result] ?? RESULT_LABELS.pending;

  return `
    <div class="page">
      <div class="header">
        <div>
          <h1>${escapeHtml(insp.firma)}</h1>
          <p class="plate">${escapeHtml(insp.plaka)}</p>
        </div>
        <div class="header-right">
          <p class="date">${escapeHtml(insp.inspection_date)}</p>
          <p class="type">${escapeHtml(insp.type)}</p>
          <span class="badge" style="background:${resultInfo.color}22;color:${resultInfo.color};border:1px solid ${resultInfo.color}66">${resultInfo.label}</span>
        </div>
      </div>
      ${insp.notes ? `<p class="general-notes">${escapeHtml(insp.notes)}</p>` : ""}
      <table>
        <thead><tr><th>Soru</th><th>Cevap</th><th>Not</th><th>Fotoğraf</th></tr></thead>
        <tbody>${rowsHtml.join("")}</tbody>
      </table>
      ${generalThumbs ? `<div class="general-photos"><p class="section-label">Genel Fotoğraflar</p>${generalThumbs}</div>` : ""}
    </div>`;
}

const STYLES = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #18181b; }
  .page { padding: 28px 32px; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0ea5e9; padding-bottom: 10px; margin-bottom: 12px; }
  .header h1 { font-size: 18px; margin: 0 0 2px 0; }
  .plate { font-size: 14px; color: #52525b; margin: 0; font-weight: bold; }
  .header-right { text-align: right; }
  .date { font-size: 12px; margin: 0; color: #3f3f46; }
  .type { font-size: 11px; margin: 2px 0 6px 0; color: #71717a; }
  .badge { font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 999px; }
  .general-notes { font-size: 11px; color: #52525b; background: #f4f4f5; padding: 8px 10px; border-radius: 6px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { text-align: left; background: #f4f4f5; padding: 6px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; color: #71717a; }
  td { padding: 6px 8px; border-bottom: 1px solid #e4e4e7; vertical-align: top; }
  td.q { width: 32%; }
  td.ans { width: 8%; text-align: center; font-weight: bold; font-size: 13px; }
  td.ans.ok { color: #16a34a; }
  td.ans.fail { color: #dc2626; }
  td.ans.pending { color: #a1a1aa; }
  td.note { width: 30%; color: #52525b; }
  td.photos { width: 30%; }
  .thumb { width: 60px; height: 60px; object-fit: cover; border-radius: 4px; margin: 2px; }
  .thumb-large { width: 140px; height: 140px; object-fit: cover; border-radius: 6px; margin: 4px; }
  .general-photos { margin-top: 16px; }
  .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #71717a; margin-bottom: 6px; }
`;

// VPS bellek sınırlarını zorlamamak için aynı anda tek bir PDF üretimine
// izin veren basit bir kilit — eşzamanlı export istekleri sıraya girer.
let pdfLock: Promise<unknown> = Promise.resolve();

export async function buildInspectionPdf(
  companyIds: string[],
  dateFrom?: string,
  dateTo?: string
): Promise<Buffer> {
  const run = async (): Promise<Buffer> => {
    const inspections = await fetchInspections(companyIds, dateFrom, dateTo);

    const bodyHtml = inspections.length > 0
      ? (await Promise.all(inspections.map(buildInspectionPageHtml))).join("")
      : `<div class="page"><p>Bu filtrelere uyan denetim kaydı bulunamadı.</p></div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${STYLES}</style></head><body>${bodyHtml}</body></html>`;

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdfBuffer = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
      return pdfBuffer;
    } finally {
      await browser.close();
    }
  };

  const result = pdfLock.then(run, run);
  pdfLock = result.catch(() => {});
  return result;
}
