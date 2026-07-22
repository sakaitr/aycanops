import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import ExcelJS from "exceljs";

// POST /api/yolcular/import  — parse Excel file, return preview rows
// Client then POSTs the rows to /api/yolcular
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "passengers:import")) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 400 });
    }

    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Dosya boyutu 5MB'ı aşamaz" }, { status: 400 });
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));

    // Parse with exceljs
    const workbook = new ExcelJS.Workbook();
    // @ts-ignore — Buffer generic mismatch between @types/node and exceljs
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json({ error: "Excel dosyasında sayfa bulunamadı" }, { status: 400 });
    }

    // The expected columns (case-insensitive matching):
    // Kurum | Adı | Soyadı | Cep Telefonu | Servis Kayıt Numarası | Özel Durum | Ev Adresi | Sicil No
    // Find header row (first non-empty row)
    let headerRow: string[] = [];
    let headerRowIndex = 0;

    sheet.eachRow((row, rowNumber) => {
      if (headerRowIndex > 0) return; // already found
      const values = row.values as (string | number | null | undefined)[];
      const texts = values.slice(1).map(v => String(v ?? "").toLowerCase().trim());
      // Check if this looks like a header row
      if (
        texts.some(t => t.includes("adı") || t.includes("soyad") || t.includes("telefon"))
      ) {
        headerRowIndex = rowNumber;
        headerRow = texts;
      }
    });

    // If no header found, assume first row is header
    if (headerRowIndex === 0) {
      const firstRow = sheet.getRow(1);
      const values = firstRow.values as (string | number | null | undefined)[];
      headerRow = values.slice(1).map(v => String(v ?? "").toLowerCase().trim());
      headerRowIndex = 1;
    }

    // Map column names to indices
    function findCol(keywords: string[]): number {
      for (let i = 0; i < headerRow.length; i++) {
        const h = headerRow[i];
        if (keywords.some(k => h.includes(k))) return i;
      }
      return -1;
    }

    const colKurum    = findCol(["kurum", "şirket", "sirket", "firma"]);
    const colAdi      = findCol(["adı", "adi", "ad", "isim", "first"]);
    const colSoyadi   = findCol(["soyadı", "soyadi", "soyad", "surname", "last"]);
    const colTelefon  = findCol(["telefon", "tel", "gsm", "cep"]);
    const colNot      = findCol(["özel", "ozel", "durum", "not", "açıklama"]);
    const colAdres    = findCol(["adres", "ev adresi", "address"]);
    const colSicilNo  = findCol(["sicil", "kayıt", "kayit"]);

    // Load companies for kurum lookup
    const db = getDb();
    const companiesList = await db.prepare(
      "SELECT id, name FROM companies WHERE status = 'active' OR status = 'aktif' OR status IS NULL LIMIT 1000"
    ).all() as { id: string; name: string }[];

    const companyByName = new Map<string, string>();
    for (const c of companiesList) {
      companyByName.set(c.name.toLowerCase().trim(), c.id);
    }

    function findCompanyId(name: string): string | null {
      if (!name) return null;
      const normalized = name.toLowerCase().trim();
      // Exact match
      if (companyByName.has(normalized)) return companyByName.get(normalized)!;
      // Partial match
      for (const [k, v] of companyByName) {
        if (k.includes(normalized) || normalized.includes(k)) return v;
      }
      return null;
    }

    const rows: Record<string, string | null>[] = [];
    const skipped: number[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowIndex) return; // skip header

      const vals = row.values as (string | number | boolean | null | undefined)[];
      const get = (idx: number): string => {
        if (idx < 0) return "";
        const v = vals[idx + 1]; // ExcelJS uses 1-based index with undefined at [0]
        if (v === null || v === undefined) return "";
        if (typeof v === "object" && "result" in v) return String((v as any).result ?? "");
        return String(v).trim();
      };

      const adi    = get(colAdi);
      const soyadi = get(colSoyadi);
      const kurum  = get(colKurum);
      const tel    = get(colTelefon);
      const not    = get(colNot);
      const adres  = get(colAdres);
      const sicil  = get(colSicilNo);

      // If we have separate Adı and Soyadı columns, combine; else use colAdi alone as full_name
      let fullName = "";
      if (colSoyadi >= 0 && soyadi) {
        fullName = `${adi} ${soyadi}`.trim();
      } else {
        fullName = adi || get(0); // fallback to first column
      }

      if (!fullName) { skipped.push(rowNumber); return; }

      // Normalize phone
      const phoneRaw = tel.replace(/\s+/g, "").replace(/[^0-9+]/g, "");
      let phone: string | null = phoneRaw || null;

      rows.push({
        full_name: fullName,
        phone,
        company_id: findCompanyId(kurum),
        company_name_raw: kurum || null,
        pickup_address: adres || null,
        notes: not || null,
        id_number: sicil || null,
        type: "personel", // default for Excel imports
        status: "aktif",
      });
    });

    return NextResponse.json({
      ok: true,
      rows,
      skipped: skipped.length,
      total: rows.length,
    });
  } catch (e) {
    return apiError(e);
  }
}
