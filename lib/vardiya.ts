/**
 * Vardiya listesi isim eşleştirme yardımcıları.
 * Ham personel isimlerini passengers kayıtlarına çözer: normalize → exact →
 * alias cache → bulanık aday. Bulanık eşleşme asla otomatik kabul edilmez.
 */

/** Türkçe karakterleri sadeleştir, tek boşluk, küçük harf, trim. */
export function normalizeName(raw: string): string {
  return raw
    .toLocaleLowerCase("tr-TR")
    .replace(/i̇/g, "i")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein mesafesi (küçük stringler için yeterli). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 0; i < a.length; i++) {
    cur[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      cur[j + 1] = Math.min(cur[j] + 1, prev[j + 1] + 1, prev[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/**
 * 0..1 benzerlik. Token bazlı: iki isimdeki kelimeleri eşleştir, her eşleşme
 * için normalize Levenshtein oranı, sırasız (soyad-önad karışıklığına dayanıklı).
 */
export function nameSimilarity(aNorm: string, bNorm: string): number {
  if (aNorm === bNorm) return 1;
  const at = aNorm.split(" ").filter(Boolean);
  const bt = bNorm.split(" ").filter(Boolean);
  if (at.length === 0 || bt.length === 0) return 0;

  const used = new Set<number>();
  let score = 0;
  for (const ta of at) {
    let best = 0;
    let bestIdx = -1;
    for (let i = 0; i < bt.length; i++) {
      if (used.has(i)) continue;
      const d = levenshtein(ta, bt[i]);
      const sim = 1 - d / Math.max(ta.length, bt[i].length);
      if (sim > best) {
        best = sim;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      used.add(bestIdx);
      score += best;
    }
  }
  const denom = Math.max(at.length, bt.length);
  return score / denom;
}

export interface CandidatePassenger {
  id: string;
  full_name: string;
  normalized: string;
  route_id: string | null;
}

export interface MatchResult {
  ham_ad: string;
  durum: "exact" | "alias" | "fuzzy" | "bulunamadi";
  passenger_id: string | null;
  passenger_name: string | null;
  route_id: string | null;
  /** durum === "fuzzy" iken doldurulur, en iyi 5 aday, skor desc. */
  adaylar: Array<{ passenger_id: string; passenger_name: string; route_id: string | null; skor: number }>;
}

/**
 * Tek bir ham ismi çöz.
 * @param aliasMap  company scope'lu vardiya_alias: normalize → passenger_id
 * @param passengers  company'nin aktif yolcuları
 */
export function resolveName(
  ham_ad: string,
  aliasMap: Map<string, string>,
  passengers: CandidatePassenger[],
  passengerById: Map<string, CandidatePassenger>,
  fuzzyThreshold = 0.72,
): MatchResult {
  const norm = normalizeName(ham_ad);

  // 1. Exact
  const exact = passengers.find((p) => p.normalized === norm);
  if (exact) {
    return {
      ham_ad,
      durum: "exact",
      passenger_id: exact.id,
      passenger_name: exact.full_name,
      route_id: exact.route_id,
      adaylar: [],
    };
  }

  // 2. Alias cache
  const aliasId = aliasMap.get(norm);
  if (aliasId) {
    const p = passengerById.get(aliasId);
    if (p) {
      return {
        ham_ad,
        durum: "alias",
        passenger_id: p.id,
        passenger_name: p.full_name,
        route_id: p.route_id,
        adaylar: [],
      };
    }
  }

  // 3. Bulanık adaylar
  const scored = passengers
    .map((p) => ({ p, skor: nameSimilarity(norm, p.normalized) }))
    .filter((x) => x.skor >= fuzzyThreshold)
    .sort((a, b) => b.skor - a.skor)
    .slice(0, 5);

  if (scored.length > 0) {
    return {
      ham_ad,
      durum: "fuzzy",
      passenger_id: null,
      passenger_name: null,
      route_id: null,
      adaylar: scored.map((x) => ({
        passenger_id: x.p.id,
        passenger_name: x.p.full_name,
        route_id: x.p.route_id,
        skor: Math.round(x.skor * 100) / 100,
      })),
    };
  }

  return { ham_ad, durum: "bulunamadi", passenger_id: null, passenger_name: null, route_id: null, adaylar: [] };
}
