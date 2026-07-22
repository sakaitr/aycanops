"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";

// MySQL DATE sütunları mysql2 tarafından JS Date nesnesi olarak döner ve bu nesne
// JSON.stringify sırasında UTC'ye çevrilir. new Date(...) ile ayrıştırıp tarayıcının
// yerel (Europe/Istanbul, sunucuyla aynı dilim) metotlarıyla okumak UTC kaymasını
// geri alır (bkz. app/finans/odemeler/page.tsx aynı yardımcı).
function toDateInputValue(v: unknown): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v as string);
  if (Number.isNaN(d.getTime())) return typeof v === "string" ? v.slice(0, 10) : "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTutar(v: unknown): string {
  return Number(v || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type CsvRow = { tarih: string; aciklama: string; tutar: number; yon: "gelen" | "giden" };

// Basit virgülle-ayırma parse'ı — brief'in tanımladığı gibi (tarih,aciklama,tutar
// sütun sırası, ilk satır başlık olarak atlanır). Tam bir CSV kütüphanesi bu
// fazda gerekli değil; aciklama içinde virgül olabileceği ihtimaline karşı ilk
// ve son sütun sabit alınıp aradaki her şey aciklama'ya birleştirilir.
function parseBankaCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length <= 1) return [];
  const rows: CsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    if (cols.length < 3) continue;
    const tarih = cols[0].trim();
    const tutarRaw = cols[cols.length - 1].trim();
    const aciklama = cols.slice(1, cols.length - 1).join(",").trim();
    const tutar = Number(tutarRaw);
    if (!tarih || Number.isNaN(tutar)) continue;
    rows.push({ tarih, aciklama, tutar: Math.abs(tutar), yon: tutar >= 0 ? "gelen" : "giden" });
  }
  return rows;
}

const EMPTY_MANUAL_FORM = {
  tarih: todayIstanbul(),
  aciklama: "",
  tutar: "",
  yon: "gelen" as "gelen" | "giden",
};

export default function BankaHareketleriPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [hesaplar, setHesaplar] = useState<any[]>([]);
  const [selectedHesapId, setSelectedHesapId] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [faturalar, setFaturalar] = useState<any[]>([]);
  const [odemeler, setOdemeler] = useState<any[]>([]);

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState({ ...EMPTY_MANUAL_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [csvUploading, setCsvUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [matchingRow, setMatchingRow] = useState<any | null>(null);
  const [matchTab, setMatchTab] = useState<"fatura" | "odeme">("fatura");
  const [matchSearch, setMatchSearch] = useState("");
  const [matching, setMatching] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    });
    fetch("/api/finans/kasa-banka?is_active=1").then(r => r.json()).then(d => {
      if (d.ok) setHesaplar((d.data || []).filter((h: any) => h.tip === "banka"));
    });
    // Eşleştirme modalı için fatura/ödeme listeleri tek seferde çekilir —
    // "otomatik eşleştirme önerisi" bu fazın kapsamında değil, sadece manuel
    // arama+seç (bkz. brief).
    fetch("/api/finans/fatura").then(r => r.json()).then(d => { if (d.ok) setFaturalar(d.data); });
    fetch("/api/finans/odeme").then(r => r.json()).then(d => { if (d.ok) setOdemeler(d.data); });
  }, []);

  useEffect(() => {
    if (!selectedHesapId) { setRows([]); return; }
    load();
  }, [selectedHesapId]);

  async function load() {
    if (!selectedHesapId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/finans/banka-hareketi?kasa_banka_hesabi_id=${encodeURIComponent(selectedHesapId)}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  function refreshEslesmeListeleri() {
    fetch("/api/finans/fatura").then(r => r.json()).then(d => { if (d.ok) setFaturalar(d.data); });
    fetch("/api/finans/odeme").then(r => r.json()).then(d => { if (d.ok) setOdemeler(d.data); });
  }

  function openManualForm() {
    setManualForm({ ...EMPTY_MANUAL_FORM });
    setSaveError(null);
    setShowManualForm(true);
  }

  async function saveManual() {
    if (!selectedHesapId) { setSaveError("Önce bir hesap seçin"); return; }
    if (!manualForm.tarih) { setSaveError("Tarih zorunludur"); return; }
    if (!manualForm.tutar.trim() || !(Number(manualForm.tutar) > 0)) { setSaveError("Tutar geçerli bir sayı olmalıdır"); return; }

    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/finans/banka-hareketi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kasa_banka_hesabi_id: selectedHesapId,
          tarih: manualForm.tarih,
          aciklama: manualForm.aciklama || null,
          tutar: Number(manualForm.tutar),
          yon: manualForm.yon,
        }),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kayıt hatası"); return; }
      toast.success("Banka hareketi eklendi");
      setShowManualForm(false);
      load();
    } finally { setSaving(false); }
  }

  function handleCsvButtonClick() {
    if (!selectedHesapId) { toast.error("Önce bir hesap seçin"); return; }
    fileInputRef.current?.click();
  }

  function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedHesapId) { toast.error("Önce bir hesap seçin"); return; }

    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || "");
      const parsedRows = parseBankaCsv(text);
      if (parsedRows.length === 0) { toast.error("Geçerli satır bulunamadı"); return; }

      setCsvUploading(true);
      try {
        const res = await fetch("/api/finans/banka-hareketi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kasa_banka_hesabi_id: selectedHesapId, satirlar: parsedRows }),
        });
        const d = await res.json();
        if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Yükleme başarısız"); return; }
        toast.success(`${d.data?.count ?? parsedRows.length} satır eklendi`);
        load();
      } finally {
        setCsvUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  function openMatch(row: any) {
    setMatchingRow(row);
    setMatchTab("fatura");
    setMatchSearch("");
  }

  const filteredFaturalar = useMemo(() => {
    const q = matchSearch.trim().toLowerCase();
    if (!q) return faturalar;
    return faturalar.filter((f: any) =>
      String(f.fatura_no || "").toLowerCase().includes(q) ||
      String(f.genel_toplam ?? "").includes(q) ||
      toDateInputValue(f.tarih).includes(q)
    );
  }, [faturalar, matchSearch]);

  const filteredOdemeler = useMemo(() => {
    const q = matchSearch.trim().toLowerCase();
    if (!q) return odemeler;
    return odemeler.filter((o: any) =>
      String(o.tutar ?? "").includes(q) ||
      toDateInputValue(o.tarih).includes(q) ||
      String(o.cari_tip || "").toLowerCase().includes(q)
    );
  }, [odemeler, matchSearch]);

  async function confirmMatch(tip: "fatura" | "odeme", id: string) {
    if (!matchingRow) return;
    setMatching(true);
    try {
      const res = await fetch(`/api/finans/banka-hareketi/${matchingRow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "eslestir", eslesen_tip: tip, eslesen_id: id }),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Eşleştirme başarısız"); return; }
      toast.success("Eşleştirildi");
      setMatchingRow(null);
      load();
      refreshEslesmeListeleri();
    } finally { setMatching(false); }
  }

  function eslesmeBilgisi(row: any): { label: string; matched: boolean } {
    if (!row.eslesen_tip || !row.eslesen_id) return { label: "Eşleşmedi", matched: false };
    if (row.eslesen_tip === "fatura") {
      const f = faturalar.find((x: any) => x.id === row.eslesen_id);
      return { label: `Fatura: ${f?.fatura_no || toDateInputValue(f?.tarih) || String(row.eslesen_id).slice(0, 8)}`, matched: true };
    }
    return { label: `Ödeme: ${String(row.eslesen_id).slice(0, 8)}`, matched: true };
  }

  const canCreate = hasPermission(user, "finans_banka_hareketi:create");
  const canUpdate = hasPermission(user, "finans_banka_hareketi:update");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Banka Hareketleri</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {selectedHesapId ? `${rows.length} kayıt` : "Devam etmek için bir hesap seçin"}
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4 mb-6 space-y-4">
            <label className="block">
              <span className="text-zinc-400 text-xs font-medium mb-1 block">Banka Hesabı</span>
              <select value={selectedHesapId} onChange={e => setSelectedHesapId(e.target.value)}
                className="w-full sm:w-80 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                <option value="">— Seçilmedi —</option>
                {hesaplar.map(h => <option key={h.id} value={h.id}>{h.ad}</option>)}
              </select>
              {hesaplar.length === 0 && (
                <p className="text-zinc-600 text-xs mt-1.5">Tanımlı banka hesabı bulunamadı.</p>
              )}
            </label>

            {canCreate && (
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleCsvButtonClick}
                  disabled={!selectedHesapId || csvUploading}
                  className="bg-zinc-800 text-zinc-200 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {csvUploading ? "Yükleniyor..." : "CSV Yükle"}
                </button>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFileChange} />
                <button
                  onClick={openManualForm}
                  disabled={!selectedHesapId}
                  className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  + Manuel Ekle
                </button>
                <p className="text-zinc-600 text-xs w-full">
                  CSV format: tarih,açıklama,tutar (ilk satır başlık olarak atlanır; negatif tutar giden hareket sayılır).
                </p>
              </div>
            )}
          </div>

          {!selectedHesapId ? (
            <div className="text-center py-16 text-zinc-600">Listelemek için üstten bir banka hesabı seçin</div>
          ) : loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Bu hesap için henüz banka hareketi yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => {
                const eslesme = eslesmeBilgisi(row);
                return (
                  <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 text-xs">{toDateInputValue(row.tarih)}</span>
                        <span className={`text-sm font-semibold ${row.yon === "gelen" ? "text-emerald-400" : "text-red-400"}`}>
                          {row.yon === "gelen" ? "+" : "-"}{formatTutar(row.tutar)} TRY
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-md font-medium whitespace-nowrap ${eslesme.matched ? "bg-emerald-950 text-emerald-400" : "bg-zinc-800 text-zinc-400"}`}>
                          {eslesme.label}
                        </span>
                        {canUpdate && !eslesme.matched && (
                          <button onClick={() => openMatch(row)}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors whitespace-nowrap">
                            Eşleştir
                          </button>
                        )}
                      </div>
                    </div>
                    {row.aciklama && <p className="text-zinc-500 text-xs mt-1.5">{row.aciklama}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showManualForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setShowManualForm(false)} />
          <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold">Manuel Banka Hareketi</h2>
              <button onClick={() => setShowManualForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Tarih *</span>
                <input type="date" value={manualForm.tarih} onChange={e => setManualForm(f => ({ ...f, tarih: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
              </label>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                <input type="text" value={manualForm.aciklama} onChange={e => setManualForm(f => ({ ...f, aciklama: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Tutar *</span>
                  <input type="number" step="0.01" min="0.01" value={manualForm.tutar}
                    onChange={e => setManualForm(f => ({ ...f, tutar: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Yön *</span>
                  <select value={manualForm.yon} onChange={e => setManualForm(f => ({ ...f, yon: e.target.value as "gelen" | "giden" }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                    <option value="gelen">Gelen</option>
                    <option value="giden">Giden</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowManualForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={saveManual} disabled={saving || !manualForm.tarih || !manualForm.tutar.trim()}
                className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {matchingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMatchingRow(null)} />
          <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col overflow-hidden max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <div>
                <h2 className="text-white font-semibold">Eşleştir</h2>
                <p className="text-zinc-500 text-xs mt-0.5">
                  {toDateInputValue(matchingRow.tarih)} · {formatTutar(matchingRow.tutar)} TRY
                </p>
              </div>
              <button onClick={() => setMatchingRow(null)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="px-5 pt-4 shrink-0">
              <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-1 mb-3">
                <button onClick={() => setMatchTab("fatura")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${matchTab === "fatura" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}>
                  Fatura
                </button>
                <button onClick={() => setMatchTab("odeme")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${matchTab === "odeme" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}>
                  Ödeme
                </button>
              </div>
              <input type="text" value={matchSearch} onChange={e => setMatchSearch(e.target.value)}
                placeholder="Fatura no, tutar veya tarihe göre ara..."
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 mb-3" />
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
              {matchTab === "fatura" ? (
                filteredFaturalar.length === 0 ? (
                  <p className="text-zinc-600 text-sm text-center py-6">Fatura bulunamadı</p>
                ) : filteredFaturalar.map((f: any) => (
                  <div key={f.id} className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-zinc-200 text-sm truncate">{f.fatura_no || "(fatura no yok)"} · {toDateInputValue(f.tarih)}</p>
                      <p className="text-zinc-500 text-xs">{formatTutar(f.genel_toplam)} {f.para_birimi_kod} · {f.tur === "satis" ? "Satış" : "Alış"}</p>
                    </div>
                    <button onClick={() => confirmMatch("fatura", f.id)} disabled={matching}
                      className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                      Seç
                    </button>
                  </div>
                ))
              ) : (
                filteredOdemeler.length === 0 ? (
                  <p className="text-zinc-600 text-sm text-center py-6">Ödeme bulunamadı</p>
                ) : filteredOdemeler.map((o: any) => (
                  <div key={o.id} className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-zinc-200 text-sm truncate">{o.id.slice(0, 8)} · {toDateInputValue(o.tarih)}</p>
                      <p className="text-zinc-500 text-xs">{formatTutar(o.tutar)} TRY · {o.cari_tip === "musteri" ? "Müşteri" : "Tedarikçi"}</p>
                    </div>
                    <button onClick={() => confirmMatch("odeme", o.id)} disabled={matching}
                      className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                      Seç
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
