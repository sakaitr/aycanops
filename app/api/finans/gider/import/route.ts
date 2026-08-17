import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import ExcelJS from "exceljs";

type PreviewRow = {
  row: number;
  tip: "fis" | "fatura";
  tarih: string | null;
  kategori_id: string | null;
  kategori_raw: string;
  cari_id: string | null;
  cari_raw: string;
  belge_no: string | null;
  tutar: number | null;
  kdv_tutar: number | null;
  aciklama: string | null;
  hata: string | null;
};

function parseTarih(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function parseTutar(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/[^0-9.,\-]/g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // "1.234,56" — nokta binlik, virgül ondalık
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // "120,50" — virgül ondalık
    s = s.replace(",", ".");
  }
  // sadece nokta varsa ("120.50") zaten geçerli ondalık format, dokunma
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "result" in (v as any)) return String((v as any).result ?? "").trim();
  if (typeof v === "object" && "text" in (v as any)) return String((v as any).text ?? "").trim();
  return String(v).trim();
}

// POST /api/finans/gider/import — Excel dosyasını satır satır okuyup önizleme
// döner. Kayıt burada oluşmaz; kullanıcı önizlemeyi onayladıktan sonra
// /api/finans/gider/bulk çağrılır (bkz. app/finans/gider/page.tsx).
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_gider:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const formData = await req.formData();
    const file = formData.get("dosya") as File | null;
    if (!file) return NextResponse.json({ ok: false, error: "Dosya bulunamadı" }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Dosya boyutu 5MB'ı aşamaz" }, { status: 400 });

    const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
    const wb = new ExcelJS.Workbook();
    // @ts-ignore — Buffer generic mismatch between @types/node and exceljs
    await wb.xlsx.load(buffer);
    const sheet = wb.worksheets[0];
    if (!sheet) return NextResponse.json({ ok: false, error: "Excel dosyasında sayfa bulunamadı" }, { status: 400 });

    const db = getDb();
    const kategoriler = await db.prepare("SELECT id, ad FROM finans_kategori WHERE is_active = 1").all() as { id: string; ad: string }[];
    const kategoriByAd = new Map(kategoriler.map(k => [k.ad.toLowerCase().trim(), k.id]));
    const cariler = await db.prepare("SELECT id, unvan FROM cari_tedarikci WHERE is_active = 1").all() as { id: string; unvan: string }[];
    const cariByUnvan = new Map(cariler.map(c => [c.unvan.toLowerCase().trim(), c.id]));

    const rows: PreviewRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // başlık satırı
      const vals = row.values as unknown[];
      const get = (idx: number) => cellText(vals[idx]);
      const tipRaw = get(1).toLowerCase();
      const tarihRaw = vals[2];
      const kategoriRaw = get(3);
      const cariRaw = get(4);
      const belgeNo = get(5);
      const tutarRaw = vals[6];
      const kdvRaw = vals[7];
      const aciklama = get(8);

      // Tamamen boş satırları atla (Excel'de kalan boş satırlar)
      if (!tipRaw && !tarihRaw && !kategoriRaw && !tutarRaw) return;

      const tip: "fis" | "fatura" = tipRaw.includes("fatura") ? "fatura" : "fis";
      const tarih = parseTarih(tarihRaw);
      const tutar = parseTutar(tutarRaw);
      const kdv_tutar = parseTutar(kdvRaw);
      const kategori_id = kategoriRaw ? kategoriByAd.get(kategoriRaw.toLowerCase().trim()) ?? null : null;
      const cari_id = cariRaw ? cariByUnvan.get(cariRaw.toLowerCase().trim()) ?? null : null;

      let hata: string | null = null;
      if (!tarih) hata = "Tarih okunamadı (GG.AA.YYYY girin)";
      else if (tutar === null) hata = "Tutar okunamadı";
      else if (kategoriRaw && !kategori_id) hata = `Kategori bulunamadı: "${kategoriRaw}"`;

      rows.push({
        row: rowNumber, tip, tarih, kategori_id, kategori_raw: kategoriRaw, cari_id, cari_raw: cariRaw,
        belge_no: belgeNo || null, tutar, kdv_tutar, aciklama: aciklama || null, hata,
      });
    });

    return NextResponse.json({ ok: true, data: { rows, gecerli: rows.filter(r => !r.hata).length, hatali: rows.filter(r => r.hata).length } });
  } catch (e) { return apiError(e); }
}
