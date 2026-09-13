/** Hakediş KDV/tevkifat/net hesaplaması — create route, edit route ve client
 * önizlemesi arasında tek kaynak (önceden 3 yerde ayrı ayrı yazılıyordu). */
export function computeHakedisTutarlari(brut: number, kdvOrani: number, tevkifatOrani: number) {
  // Keep cents/rate basis points integral, including exact half-cent rounding.
  const grossCents = Math.round(brut * 100), vatRate = Math.round(kdvOrani * 100), withholdingRate = Math.round(tevkifatOrani * 100);
  if (![grossCents, vatRate, withholdingRate].every(n => Number.isSafeInteger(n) && n >= 0))
    return { kdvTutari: NaN, tevkifatTutari: NaN, netTutar: NaN };
  const portion = (cents: bigint, rate: number) => (cents * BigInt(rate) + BigInt(5000)) / BigInt(10000);
  const gross = BigInt(grossCents);
  const vat = portion(gross, vatRate);
  const withheld = portion(vat, withholdingRate);
  return { kdvTutari: Number(vat) / 100, tevkifatTutari: Number(withheld) / 100, netTutar: Number(gross + vat - withheld) / 100 };
}
