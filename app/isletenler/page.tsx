"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { isValidTrPhone } from "@/lib/phone";
import { hasPermission } from "@/lib/permissions";

const EMPTY_FORM = {
  unvan: "",
  vergi_no: "",
  tc_no: "",
  vergi_dairesi: "",
  cep_tel: "",
  is_tel: "",
  email: "",
  cari_kod: "",
  tevkifat_durumu: "tum_araclar",
  banka_adi: "",
  banka_sube: "",
  banka_iban: "",
  sozlesme_baslangic: "",
  sozlesme_bitis: "",
  ana_isleten: false,
  surucu_mu: false,
  ruhsat_sahibi_mi: false,
  aciklama: "",
};

const TEVKIFAT_OPTS = [
  { value: "tum_araclar", label: "Tüm Araçlar" },
  { value: "sadece_ozmal", label: "Sadece Öz Mal" },
  { value: "uygulanmasin", label: "Uygulanmasın" },
];

function formatCurrency(v: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);
}

export default function IsletenlerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isletenler, setIsletenler] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showActive, setShowActive] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    }).catch(() => router.replace("/login"));
  }, []);

  useEffect(() => { load(); }, [search, showActive]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      params.set("active", showActive ? "1" : "0");
      params.set("limit", "500");
      const r = await fetch(`/api/isletenler?${params}`);
      const d = await r.json();
      if (d.ok) setIsletenler(d.data);
    } finally { setLoading(false); }
  }

  async function save() {
    if (!form.unvan.trim()) { setSaveError("Ünvan zorunludur"); return; }
    if (!form.cep_tel.trim()) { setSaveError("Cep telefonu zorunludur"); return; }
    if (!isValidTrPhone(form.cep_tel)) { setSaveError("Cep telefonu geçersiz — 05xx xxx xx xx formatında, 11 haneli olmalı"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/isletenler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success("İşleten eklendi");
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      load();
    } finally { setSaving(false); }
  }

  const canEdit = hasPermission(user, "isleten:create");

  const filtered = isletenler.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.unvan?.toLowerCase().includes(q) ||
      i.cari_kod?.toLowerCase().includes(q) ||
      i.cep_tel?.includes(q) ||
      i.vergi_no?.includes(q)
    );
  });

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-7xl mx-auto px-4 py-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">İşletenler</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{filtered.length} işleten</p>
            </div>
            {canEdit && (
              <button
                onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM }); setSaveError(null); }}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap"
              >
                + Yeni İşleten
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 mb-6">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ünvan, cari kod, telefon, vergi no..."
              className="flex-1 bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-zinc-600 placeholder-zinc-600"
            />
            <button
              onClick={() => setShowActive(v => !v)}
              className={`text-sm px-3 py-2 rounded-xl border transition-colors whitespace-nowrap ${
                showActive
                  ? "bg-emerald-950 border-emerald-800 text-emerald-300"
                  : "bg-zinc-900 border-zinc-800 text-zinc-500"
              }`}
            >
              {showActive ? "Aktif" : "Pasif"}
            </button>
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 animate-pulse h-20" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-zinc-500 text-lg">İşleten bulunamadı</p>
              {canEdit && (
                <button
                  onClick={() => { setShowForm(true); setSaveError(null); }}
                  className="mt-4 text-sm text-zinc-400 underline hover:text-white"
                >
                  Yeni işleten ekle
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(item => {
                const bakiye = Number(item.cari_bakiye ?? 0);
                return (
                  <div
                    key={item.id}
                    onClick={() => router.push(`/isletenler/${item.id}`)}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 hover:border-zinc-600 hover:bg-zinc-800/60 cursor-pointer transition-all flex items-center gap-4"
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {item.unvan.trim().charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium text-sm truncate">{item.unvan}</p>
                        <span className="text-zinc-600 font-mono text-xs shrink-0">{item.cari_kod}</span>
                        {item.ana_isleten ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-950 border-amber-800 text-amber-300 shrink-0">Ana</span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {item.cep_tel && <p className="text-zinc-500 text-xs">{item.cep_tel}</p>}
                        {item.vergi_no && <p className="text-zinc-600 text-xs">VN: {item.vergi_no}</p>}
                        <p className="text-zinc-600 text-xs">{item.arac_sayisi ?? 0} araç</p>
                      </div>
                    </div>

                    {/* Bakiye */}
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold ${bakiye >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {formatCurrency(bakiye)}
                      </p>
                      <p className="text-zinc-600 text-xs">bakiye</p>
                    </div>

                    {/* Tevkifat badge */}
                    <div className="shrink-0">
                      {item.tevkifat_durumu === "uygulanmasin" ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-zinc-800 border-zinc-700 text-zinc-500">Tevkifatsız</span>
                      ) : item.tevkifat_durumu === "sadece_ozmal" ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-950 border-blue-800 text-blue-300">Öz Mal</span>
                      ) : null}
                    </div>

                    <span className="text-zinc-700 text-lg shrink-0">›</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Slide-over form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold">Yeni İşleten</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && (
                <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>
              )}

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Ünvan / Ad Soyad *</span>
                <input value={form.unvan} onChange={e => setForm(f => ({ ...f, unvan: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                  placeholder="Ahmet Yılmaz veya Yılmaz Taşımacılık Ltd." />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Cep Tel *</span>
                  <input value={form.cep_tel} onChange={e => setForm(f => ({ ...f, cep_tel: e.target.value }))}
                    type="tel" inputMode="tel" maxLength={17}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                    placeholder="05xx xxx xx xx" />
                  {form.cep_tel.trim() && !isValidTrPhone(form.cep_tel) && (
                    <p className="text-amber-500 text-[11px] mt-1">05xx xxx xx xx formatında, 11 haneli olmalı</p>
                  )}
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Vergi No</span>
                  <input value={form.vergi_no} onChange={e => setForm(f => ({ ...f, vergi_no: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                    maxLength={11} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">TC Kimlik No</span>
                  <input value={form.tc_no} onChange={e => setForm(f => ({ ...f, tc_no: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                    maxLength={11} />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Vergi Dairesi</span>
                  <input value={form.vergi_dairesi} onChange={e => setForm(f => ({ ...f, vergi_dairesi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">E-posta</span>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Cari Kod (oto)</span>
                  <input value={form.cari_kod} onChange={e => setForm(f => ({ ...f, cari_kod: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
                    placeholder="ISL-0001 (otomatik)" />
                </label>
              </div>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Tevkifat Durumu</span>
                <select value={form.tevkifat_durumu} onChange={e => setForm(f => ({ ...f, tevkifat_durumu: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                  {TEVKIFAT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>

              <div className="border-t border-zinc-800 pt-3">
                <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-3">Banka Bilgileri</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-zinc-400 text-xs font-medium mb-1 block">Banka Adı</span>
                      <input value={form.banka_adi} onChange={e => setForm(f => ({ ...f, banka_adi: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                    </label>
                    <label className="block">
                      <span className="text-zinc-400 text-xs font-medium mb-1 block">Şube</span>
                      <input value={form.banka_sube} onChange={e => setForm(f => ({ ...f, banka_sube: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">IBAN</span>
                    <input value={form.banka_iban} onChange={e => setForm(f => ({ ...f, banka_iban: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 font-mono text-xs"
                      placeholder="TR00 0000 0000 0000 0000 0000 00" maxLength={32} />
                  </label>
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-3">
                <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-3">Sözleşme</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">Başlangıç</span>
                    <input type="date" value={form.sozlesme_baslangic} onChange={e => setForm(f => ({ ...f, sozlesme_baslangic: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                  </label>
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">Bitiş</span>
                    <input type="date" value={form.sozlesme_bitis} onChange={e => setForm(f => ({ ...f, sozlesme_bitis: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer" title="Bu işleten, firmanın araçlarını tedarik eden birincil/ana kaynak mı? İşaretlenirse listelerde ve raporlarda öne çıkar.">
                  <input type="checkbox" checked={form.ana_isleten} onChange={e => setForm(f => ({ ...f, ana_isleten: e.target.checked }))}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500" />
                  <span className="text-zinc-400 text-sm">Ana İşleten</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer" title="Bu işleten aracı bizzat kendisi de sürüyor mu? İşaretlenirse şoför olarak da seçilebilir hale gelir.">
                  <input type="checkbox" checked={form.surucu_mu} onChange={e => setForm(f => ({ ...f, surucu_mu: e.target.checked }))}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500" />
                  <span className="text-zinc-400 text-sm">Sürücü de</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer" title="Araçların resmi ruhsatı bu kişi/firma adına mı kayıtlı? İşaretlenirse araç formlarında 'Ruhsat Sahibi' olarak seçilebilir.">
                  <input type="checkbox" checked={form.ruhsat_sahibi_mi} onChange={e => setForm(f => ({ ...f, ruhsat_sahibi_mi: e.target.checked }))}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500" />
                  <span className="text-zinc-400 text-sm">Ruhsat Sahibi</span>
                </label>
              </div>

              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açıklama</span>
                <textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            </div>

            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">
                İptal
              </button>
              <button onClick={save} disabled={saving || !form.unvan.trim() || !form.cep_tel.trim()}
                className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
