/** Hakediş KDV/tevkifat/net hesaplaması — create route, edit route ve client
 * önizlemesi arasında tek kaynak (önceden 3 yerde ayrı ayrı yazılıyordu). */
export function computeHakedisTutarlari(brut: number, kdvOrani: number, tevkifatOrani: number) {
  const kdvTutari = Math.round(brut * kdvOrani) / 100;
  const tevkifatTutari = Math.round(brut * tevkifatOrani) / 100;
  const netTutar = Math.round((brut + kdvTutari - tevkifatTutari) * 100) / 100;
  return { kdvTutari, tevkifatTutari, netTutar };
}
