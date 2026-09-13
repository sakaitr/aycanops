import { RequestError } from "./request-error";
import { computeHakedisTutarlari } from "./hakedis-calc";

export function financialNumber(value: unknown, label: string, max = 9999999999.99): number {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" ||
      !/^\d+(\.\d{1,2})?$/.test(String(value))) {
    throw new RequestError(`${label} en fazla iki ondalıklı geçerli bir sayı olmalıdır`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new RequestError(`${label} 0–${max} arasında olmalıdır`);
  return n;
}

export function dateOnly(value: unknown): string {
  // mysql2 DATE values are Date objects unless dateStrings is configured.
  const s = value instanceof Date
    ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(value)
    : typeof value === "string" ? value : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) ||
      new Date(s).toISOString().slice(0, 10) !== s || s < "1000-01-01") {
    throw new RequestError("Geçerli bir tarih giriniz");
  }
  return s;
}

export function validatePeriod(start: unknown, end: unknown) {
  const from = dateOnly(start), to = dateOnly(end);
  if (from > to) throw new RequestError("Dönem bitişi başlangıçtan önce olamaz");
  return { from, to };
}

export function validateStoredHakedis(row: Record<string, unknown>) {
  validatePeriod(row.donem_baslangic, row.donem_bitis);
  const gross = financialNumber(row.brut_tutar, "Brüt tutar");
  const vat = financialNumber(row.kdv_orani, "KDV oranı", 100);
  const withheld = financialNumber(row.tevkifat_orani, "Tevkifat oranı", 100);
  const expected = computeHakedisTutarlari(gross, vat, withheld);
  if (Number(row.kdv_tutari) !== expected.kdvTutari || Number(row.tevkifat_tutari) !== expected.tevkifatTutari || Number(row.net_tutar) !== expected.netTutar)
    throw new RequestError("Kaydedilmiş hesap güncel KDV tevkifatı hesabıyla uyuşmuyor. Finansal düzeltme incelemesi gerekli", 409);
}
