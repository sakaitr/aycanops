"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

type Company = { id: string; name: string };

type Aday = { passenger_id: string; passenger_name: string; route_id: string | null; skor: number };
type Kisi = {
  ham_ad: string;
  durum: "exact" | "alias" | "fuzzy" | "bulunamadi";
  passenger_id: string | null;
  passenger_name: string | null;
  route_id: string | null;
  adaylar: Aday[];
};
type Grup = {
  route_id: string;
  route_name: string;
  vehicle_plate: string | null;
  driver_name: string | null;
  kisiler: Kisi[];
};
type MatchData = {
  company_id: string;
  ozet: { toplam: number; exact: number; alias: number; fuzzy: number; bulunamadi: number; tabelasiz: number };
  gruplar: Grup[];
  aksiyon_gerekli: Kisi[];
};

// aksiyon_gerekli satırının kullanıcı kararı
type Karar = {
  ham_ad: string;
  secim: "atla" | string; // "atla" | passenger_id
  route_id: string | null;
};

export default function VardiyaEslestirmePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [routes, setRoutes] = useState<{ id: string; name: string }[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [sekme, setSekme] = useState<"liste" | "arac">("liste");

  const [metin, setMetin] = useState("");
  const [loading, setLoading] = useState(false);
  const [match, setMatch] = useState<MatchData | null>(null);
  const [kararlar, setKararlar] = useState<Record<string, Karar>>({});
  const [saving, setSaving] = useState(false);
  const [sonuc, setSonuc] = useState<string | null>(null);

  // araç listesi
  const [aracMetin, setAracMetin] = useState("");
  const [aracOnizle, setAracOnizle] = useState<any | null>(null);
  const [aracBusy, setAracBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    }).catch(() => router.replace("/login"));
    fetch("/api/companies?limit=9999").then((r) => r.json()).then((d) => { if (d.ok) setCompanies(d.data); }).catch(() => {});
  }, [router]);

  useEffect(() => {
    if (!companyId) { setRoutes([]); return; }
    fetch(`/api/routes?company_id=${companyId}`).then((r) => r.json()).then((d) => {
      if (d.ok) setRoutes(d.data.map((r: any) => ({ id: r.id, name: r.name })));
    }).catch(() => {});
    setMatch(null);
    setKararlar({});
    setSonuc(null);
  }, [companyId]);

  async function eslestir() {
    if (!companyId) return alert("Firma seçin");
    const isimler = metin.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (isimler.length === 0) return alert("İsim listesi boş");
    setLoading(true);
    setSonuc(null);
    try {
      const d = await fetch("/api/vardiya-eslestirme/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, isimler }),
      }).then((r) => r.json());
      if (!d.ok) return alert(typeof d.error === "string" ? d.error : "Eşleştirme hatası");
      setMatch(d.data);
      // varsayılan kararlar
      const k: Record<string, Karar> = {};
      for (const kisi of d.data.aksiyon_gerekli as Kisi[]) {
        if (kisi.durum === "fuzzy" && kisi.adaylar[0]) {
          k[kisi.ham_ad] = { ham_ad: kisi.ham_ad, secim: kisi.adaylar[0].passenger_id, route_id: kisi.adaylar[0].route_id };
        } else if ((kisi.durum === "exact" || kisi.durum === "alias") && kisi.passenger_id) {
          k[kisi.ham_ad] = { ham_ad: kisi.ham_ad, secim: kisi.passenger_id, route_id: kisi.route_id };
        } else {
          k[kisi.ham_ad] = { ham_ad: kisi.ham_ad, secim: "atla", route_id: null };
        }
      }
      setKararlar(k);
    } finally {
      setLoading(false);
    }
  }

  function setKarar(ham_ad: string, patch: Partial<Karar>) {
    setKararlar((prev) => ({ ...prev, [ham_ad]: { ...prev[ham_ad], ham_ad, ...patch } }));
  }

  const kaydedilebilir = useMemo(() => {
    if (!match) return 0;
    let n = 0;
    for (const g of match.gruplar) n += g.kisiler.length;
    for (const kisi of match.aksiyon_gerekli) {
      const k = kararlar[kisi.ham_ad];
      if (k && k.secim !== "atla" && k.route_id) n += 1;
    }
    return n;
  }, [match, kararlar]);

  async function kaydet() {
    if (!match) return;
    const kayitlar: any[] = [];
    for (const g of match.gruplar) {
      for (const kisi of g.kisiler) {
        kayitlar.push({ ham_ad: kisi.ham_ad, passenger_id: kisi.passenger_id, route_id: kisi.route_id, durum: kisi.durum });
      }
    }
    for (const kisi of match.aksiyon_gerekli) {
      const k = kararlar[kisi.ham_ad];
      if (!k || k.secim === "atla") {
        kayitlar.push({ ham_ad: kisi.ham_ad, passenger_id: null, route_id: null, durum: "atlandi" });
        continue;
      }
      const wasFuzzy = kisi.durum === "fuzzy";
      kayitlar.push({
        ham_ad: kisi.ham_ad,
        passenger_id: k.secim,
        route_id: k.route_id,
        durum: wasFuzzy ? "fuzzy_onaylandi" : "exact",
        alias_kaydet: wasFuzzy || kisi.passenger_id !== k.secim,
      });
    }
    setSaving(true);
    try {
      const d = await fetch("/api/vardiya-eslestirme/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, kayitlar }),
      }).then((r) => r.json());
      if (!d.ok) return alert(typeof d.error === "string" ? d.error : "Kaydetme hatası");
      setSonuc(`${d.data.atanan_yolcu} yolcu tabelaya atandı, ${d.data.yeni_alias} yeni isim öğrenildi.`);
      setMatch(null);
      setMetin("");
    } finally {
      setSaving(false);
    }
  }

  // --- araç listesi ---
  function parseArac(): { tabela: string; plaka: string; sofor?: string }[] {
    return aracMetin
      .split(/\r?\n/)
      .map((l) => l.split(/\t|;|,|\s{2,}/).map((x) => x.trim()).filter(Boolean))
      .filter((parts) => parts.length >= 2)
      .map((parts) => ({ tabela: parts[0], plaka: parts[1], sofor: parts[2] }));
  }

  async function aracOnizleGetir() {
    if (!companyId) return alert("Firma seçin");
    const satirlar = parseArac();
    if (satirlar.length === 0) return alert("En az bir satır: tabela + plaka");
    setAracBusy(true);
    try {
      const d = await fetch("/api/vardiya-eslestirme/arac-listesi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, satirlar, apply: false }),
      }).then((r) => r.json());
      if (!d.ok) return alert(typeof d.error === "string" ? d.error : "Hata");
      setAracOnizle(d.data);
    } finally {
      setAracBusy(false);
    }
  }

  async function aracUygula() {
    const satirlar = parseArac();
    setAracBusy(true);
    try {
      const d = await fetch("/api/vardiya-eslestirme/arac-listesi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, satirlar, apply: true }),
      }).then((r) => r.json());
      if (!d.ok) return alert(typeof d.error === "string" ? d.error : "Hata");
      setAracOnizle(d.data);
      alert(`${d.data.uygulanan} tabela-araç ataması yazıldı.`);
    } finally {
      setAracBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-white">Vardiya Eşleştirme</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Firmadan gelen haftalık personel listesini tabelalara böl. Onaylanan her isim kalıcı öğrenilir.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none"
          >
            <option value="">— Firma seç —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-lg border border-zinc-700">
            <button
              onClick={() => setSekme("liste")}
              className={`px-4 py-2.5 text-sm ${sekme === "liste" ? "bg-white text-zinc-950" : "bg-zinc-800 text-zinc-400"}`}
            >
              Personel Listesi
            </button>
            <button
              onClick={() => setSekme("arac")}
              className={`px-4 py-2.5 text-sm ${sekme === "arac" ? "bg-white text-zinc-950" : "bg-zinc-800 text-zinc-400"}`}
            >
              Araç Listesi (Faz 0)
            </button>
          </div>
        </div>

        {sekme === "liste" && (
          <div className="mt-5 space-y-5">
            {!match && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  İsim listesi (her satır bir kişi)
                </label>
                <textarea
                  value={metin}
                  onChange={(e) => setMetin(e.target.value)}
                  rows={12}
                  placeholder={"Ahmet Yılmaz\nMehmet Demir\n..."}
                  className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-[15px] text-white outline-none"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={eslestir}
                    disabled={loading || !companyId}
                    className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-50"
                  >
                    {loading ? "Eşleştiriliyor..." : "Eşleştir"}
                  </button>
                </div>
              </div>
            )}

            {sonuc && (
              <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">
                {sonuc}
              </div>
            )}

            {match && (
              <>
                <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
                  {[
                    ["Toplam", match.ozet.toplam],
                    ["Tam", match.ozet.exact],
                    ["Öğrenilmiş", match.ozet.alias],
                    ["Bulanık", match.ozet.fuzzy],
                    ["Bulunamadı", match.ozet.bulunamadi],
                    ["Tabelasız", match.ozet.tabelasiz],
                  ].map(([l, v]) => (
                    <div key={l as string} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
                      <div className="text-lg font-bold text-white">{v as number}</div>
                      <div className="text-zinc-500">{l as string}</div>
                    </div>
                  ))}
                </div>

                {match.aksiyon_gerekli.length > 0 && (
                  <div className="rounded-2xl border border-amber-900/50 bg-amber-950/10 p-4">
                    <h2 className="mb-3 text-sm font-bold text-amber-300">
                      Aksiyon Gerekli ({match.aksiyon_gerekli.length})
                    </h2>
                    <div className="space-y-2">
                      {match.aksiyon_gerekli.map((kisi) => {
                        const k = kararlar[kisi.ham_ad];
                        return (
                          <div key={kisi.ham_ad} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-white">{kisi.ham_ad}</span>
                              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
                                {kisi.durum === "fuzzy" ? "bulanık" : kisi.durum === "bulunamadi" ? "bulunamadı" : "tabelasız"}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <select
                                value={k?.secim ?? "atla"}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const aday = kisi.adaylar.find((a) => a.passenger_id === val);
                                  setKarar(kisi.ham_ad, {
                                    secim: val,
                                    route_id: val === "atla" ? null : (aday?.route_id ?? kisi.route_id ?? null),
                                  });
                                }}
                                className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-sm text-white outline-none"
                              >
                                <option value="atla">— Atla —</option>
                                {kisi.passenger_id && (
                                  <option value={kisi.passenger_id}>{kisi.passenger_name} (eşleşen)</option>
                                )}
                                {kisi.adaylar.map((a) => (
                                  <option key={a.passenger_id} value={a.passenger_id}>
                                    {a.passenger_name} · %{Math.round(a.skor * 100)}
                                  </option>
                                ))}
                              </select>
                              {k && k.secim !== "atla" && (
                                <select
                                  value={k.route_id ?? ""}
                                  onChange={(e) => setKarar(kisi.ham_ad, { route_id: e.target.value || null })}
                                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-sm text-white outline-none"
                                >
                                  <option value="">— Tabela seç —</option>
                                  {routes.map((r) => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {match.gruplar.map((g) => (
                    <div key={g.route_id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-bold text-white">{g.route_name}</h3>
                        <div className="flex gap-2 text-xs">
                          {g.vehicle_plate && (
                            <span className="rounded bg-zinc-800 px-2 py-1 font-mono text-zinc-200">{g.vehicle_plate}</span>
                          )}
                          {g.driver_name && <span className="rounded bg-zinc-800 px-2 py-1 text-zinc-300">{g.driver_name}</span>}
                          <span className="rounded bg-zinc-800 px-2 py-1 text-zinc-300">{g.kisiler.length} kişi</span>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {g.kisiler.map((kisi) => (
                          <span
                            key={kisi.ham_ad}
                            className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-zinc-300"
                            title={kisi.durum === "alias" ? "önceden öğrenildi" : "tam eşleşme"}
                          >
                            {kisi.passenger_name || kisi.ham_ad}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <button onClick={() => { setMatch(null); setKararlar({}); }} className="text-sm text-zinc-500 underline">
                    Vazgeç
                  </button>
                  <button
                    onClick={kaydet}
                    disabled={saving}
                    className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-50"
                  >
                    {saving ? "Kaydediliyor..." : `Kaydet (${kaydedilebilir} atama)`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {sekme === "arac" && (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Araç listesi — her satır: tabela [tab/virgül] plaka [tab/virgül] şoför (opsiyonel)
              </label>
              <textarea
                value={aracMetin}
                onChange={(e) => setAracMetin(e.target.value)}
                rows={10}
                placeholder={"ATAŞEHİR 1\t34 ABC 123\tMehmet Yılmaz\nKADIKÖY 2\t34 XYZ 987"}
                className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 font-mono text-sm text-white outline-none"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={aracOnizleGetir}
                  disabled={aracBusy || !companyId}
                  className="rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Önizle
                </button>
                <button
                  onClick={aracUygula}
                  disabled={aracBusy || !aracOnizle}
                  className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-50"
                >
                  Uygula
                </button>
              </div>
            </div>

            {aracOnizle && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="mb-3 flex gap-3 text-xs">
                  <span className="text-emerald-400">{aracOnizle.ozet.eslesti} eşleşti</span>
                  <span className="text-amber-400">{aracOnizle.ozet.tabela_yok} tabela yok</span>
                  <span className="text-red-400">{aracOnizle.ozet.arac_yok} araç yok</span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-zinc-500">
                        <th className="py-1">Tabela</th>
                        <th className="py-1">Plaka</th>
                        <th className="py-1">Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aracOnizle.sonuc.map((s: any, i: number) => (
                        <tr key={i} className="border-t border-zinc-800/50">
                          <td className="py-1.5 text-zinc-200">{s.tabela}</td>
                          <td className="py-1.5 font-mono text-zinc-300">{s.plaka}</td>
                          <td className="py-1.5">
                            <span
                              className={
                                s.durum === "eslesti"
                                  ? "text-emerald-400"
                                  : s.durum === "tabela_yok"
                                    ? "text-amber-400"
                                    : "text-red-400"
                              }
                            >
                              {s.durum === "eslesti" ? "eşleşti" : s.durum === "tabela_yok" ? "tabela yok" : "araç yok"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
