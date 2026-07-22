// Türkiye cep telefonu doğrulaması: 05xx xxx xx xx formatı, boşluk/tire serbest, 11 hane, 0 ile başlar.
export function isValidTrPhone(value: string): boolean {
  const digits = value.replace(/[^0-9]/g, "");
  return /^0[0-9]{10}$/.test(digits);
}
