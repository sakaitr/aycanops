"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

const TIP_LABELS: Record<string, string> = {
  evet_hayir: "Evet / Hayır",
  metin: "Kısa Metin",
  uzun_metin: "Uzun Metin",
  checklist: "Checklist (çoklu seçim)",
  secim: "Tekli Seçim",
};
const TIPLER = Object.keys(TIP_LABELS);
const OPTION_TIPLER = new Set(["checklist", "secim"]);
const DETAY_TIP_LABELS: Record<string, string> = {
  metin: "Kısa Metin",
  uzun_metin: "Uzun Metin",
  secim: "Tekli Seçim",
};
const DETAY_TIPLER = Object.keys(DETAY_TIP_LABELS);
// Detay (takip sorusu) yalnızca ayrık bir cevap değeri üretebilen tiplerde
// anlamlı — serbest metin cevaplara "hangi cevapta tetiklensin" sorulamaz.
const DETAY_APPLICABLE_TIPLER = new Set(["evet_hayir", "secim", "checklist"]);

const EMPTY_FORM = {
  label: "", tip: "evet_hayir", secenekler: [] as string[], zorunlu: true,
  bolum_baslik: "", detay_label: "", detay_tip: "" as "" | "metin" | "uzun_metin" | "secim",
  detay_secenekler: [] as string[], detay_tetikleyici: "",
};

export default function GunlukSorulariPage() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  const [sorular, setSorular] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [optionInput, setOptionInput] = useState("");
  const [detayOptionInput, setDetayOptionInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok) { router.replace("/login"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/login"));
  }, [router]);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/gunluk-sorulari");
      const d = await r.json();
      if (d.ok) setSorular(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setOptionInput("");
    setDetayOptionInput("");
    setSaveError(null);
    setShowForm(true);
  }

  function openEdit(s: any) {
    setEditing(s);
    setForm({
      label: s.label, tip: s.tip, secenekler: s.secenekler || [], zorunlu: s.zorunlu,
      bolum_baslik: s.bolum_baslik || "", detay_label: s.detay_label || "",
      detay_tip: s.detay_tip || "", detay_secenekler: s.detay_secenekler || [],
      detay_tetikleyici: s.detay_tetikleyici || "",
    });
    setOptionInput("");
    setDetayOptionInput("");
    setSaveError(null);
    setShowForm(true);
  }

  function addOption() {
    if (!optionInput.trim()) return;
    setForm(f => ({ ...f, secenekler: [...f.secenekler, optionInput.trim()] }));
    setOptionInput("");
  }

  function removeOption(idx: number) {
    setForm(f => ({ ...f, secenekler: f.secenekler.filter((_, i) => i !== idx) }));
  }

  function addDetayOption() {
    if (!detayOptionInput.trim()) return;
    setForm(f => ({ ...f, detay_secenekler: [...f.detay_secenekler, detayOptionInput.trim()] }));
    setDetayOptionInput("");
  }

  function removeDetayOption(idx: number) {
    setForm(f => ({ ...f, detay_secenekler: f.detay_secenekler.filter((_, i) => i !== idx) }));
  }

  async function save() {
    if (!form.label.trim()) { setSaveError("Soru metni zorunlu"); return; }
    if (OPTION_TIPLER.has(form.tip) && form.secenekler.length === 0) {
      setSaveError("Bu tip için en az bir seçenek eklenmeli");
      return;
    }
    const detayVarMi = DETAY_APPLICABLE_TIPLER.has(form.tip) && form.detay_label.trim();
    if (detayVarMi && !form.detay_tetikleyici) {
      setSaveError("Takip sorusu için tetikleyici cevap seçilmeli");
      return;
    }
    if (detayVarMi && !form.detay_tip) {
      setSaveError("Takip sorusu için cevap tipi seçilmeli");
      return;
    }
    if (detayVarMi && form.detay_tip === "secim" && form.detay_secenekler.length === 0) {
      setSaveError("Takip sorusu seçim tipi için en az bir seçenek eklenmeli");
      return;
    }
    setSaving(true); setSaveError(null);
    try {
      const body = {
        label: form.label, tip: form.tip,
        secenekler: OPTION_TIPLER.has(form.tip) ? form.secenekler : null,
        zorunlu: form.zorunlu,
        bolum_baslik: form.bolum_baslik.trim() || null,
        detay_label: detayVarMi ? form.detay_label.trim() : null,
        detay_tip: detayVarMi ? form.detay_tip || null : null,
        detay_secenekler: detayVarMi && form.detay_tip === "secim" ? form.detay_secenekler : null,
        detay_tetikleyici: detayVarMi ? form.detay_tetikleyici : null,
      };
      const url = editing ? `/api/admin/gunluk-sorulari/${editing.id}` : "/api/admin/gunluk-sorulari";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kayıt hatası"); return; }
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Bu soru silinsin mi?")) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/admin/gunluk-sorulari/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) load(); else alert(d.error);
    } finally { setDeletingId(null); }
  }

  if (!user) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">Yükleniyor...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a href="/admin" className="text-zinc-500 hover:text-white text-sm transition-colors">Yönetim</a>
              <span className="text-zinc-700">/</span>
              <span className="text-white text-sm">Günlük Soruları</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Günlük Soruları</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{sorular.length} soru — işe başlama check-in'inde sırayla gösterilir</p>
          </div>
          <button onClick={openCreate}
            className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors whitespace-nowrap">
            + Soru Ekle
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
        ) : sorular.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Henüz soru eklenmedi</div>
        ) : (
          <div className="space-y-2">
            {sorular.map((s, idx) => (
              <div key={s.id} onClick={() => openEdit(s)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4 cursor-pointer hover:border-zinc-700 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-zinc-600 text-xs w-5 shrink-0">{idx + 1}.</span>
                  <span className="text-white text-sm flex-1">{s.label}</span>
                  {s.bolum_baslik && <span className="text-xs text-blue-400 border border-blue-800/60 px-2 py-0.5 rounded-full shrink-0">{s.bolum_baslik}</span>}
                  <span className="text-xs text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded-full shrink-0">{TIP_LABELS[s.tip]}</span>
                  {!s.zorunlu && <span className="text-xs text-zinc-600 shrink-0">opsiyonel</span>}
                  <button onClick={e => { e.stopPropagation(); remove(s.id); }} disabled={deletingId === s.id}
                    className="text-xs text-zinc-700 hover:text-red-400 transition-colors px-1 disabled:opacity-40 shrink-0">
                    {deletingId === s.id ? "..." : "Sil"}
                  </button>
                </div>
                {s.secenekler && s.secenekler.length > 0 && (
                  <p className="text-zinc-600 text-xs mt-1.5 ml-8">{s.secenekler.join(", ")}</p>
                )}
                {s.detay_label && (
                  <p className="text-zinc-600 text-xs mt-1.5 ml-8">↳ takip: {s.detay_label}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md my-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editing ? "Soruyu Düzenle" : "Soru Ekle"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Bölüm Başlığı (opsiyonel)</label>
                <input value={form.bolum_baslik} onChange={e => setForm(f => ({ ...f, bolum_baslik: e.target.value }))}
                  placeholder="Örn: Dünün Değerlendirmesi"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                <p className="text-zinc-600 text-xs mt-1">Aynı başlığa sahip ardışık sorular check-in'de tek başlık altında gruplanır.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Soru Metni *</label>
                <textarea value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} rows={2}
                  placeholder="Örn: Araç kontrolü yapıldı mı?"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Cevap Tipi</label>
                <select value={form.tip} onChange={e => setForm(f => ({ ...f, tip: e.target.value, detay_tetikleyici: "" }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  {TIPLER.map(t => <option key={t} value={t}>{TIP_LABELS[t]}</option>)}
                </select>
              </div>

              {OPTION_TIPLER.has(form.tip) && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Seçenekler *</label>
                  <div className="space-y-1 mb-2">
                    {form.secenekler.map((o, i) => (
                      <div key={i} className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-3 py-1.5">
                        <span className="flex-1 text-zinc-300 text-sm">{o}</span>
                        <button onClick={() => removeOption(i)} className="text-zinc-600 hover:text-red-400 text-xs transition-colors">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={optionInput} onChange={e => setOptionInput(e.target.value)}
                      placeholder="Seçenek yazıp Ekle'ye basın"
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
                      className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                    <button onClick={addOption} disabled={!optionInput.trim()}
                      className="bg-zinc-800 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-zinc-700 disabled:opacity-40 transition-colors">
                      Ekle
                    </button>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 py-1 cursor-pointer">
                <input type="checkbox" checked={form.zorunlu} onChange={e => setForm(f => ({ ...f, zorunlu: e.target.checked }))}
                  className="accent-white" />
                <span className="text-sm text-zinc-300">Zorunlu (cevaplanmadan check-in tamamlanamaz)</span>
              </label>

              {DETAY_APPLICABLE_TIPLER.has(form.tip) && (
                <div className="border-t border-zinc-800 pt-3 mt-1">
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Bağlı Takip Sorusu (opsiyonel)</p>

                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Hangi cevapta gösterilsin?</label>
                  {form.tip === "evet_hayir" ? (
                    <div className="flex gap-2 mb-3">
                      <button onClick={() => setForm(f => ({ ...f, detay_tetikleyici: "true" }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${form.detay_tetikleyici === "true" ? "bg-emerald-700 border-emerald-600 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                        Evet
                      </button>
                      <button onClick={() => setForm(f => ({ ...f, detay_tetikleyici: "false" }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${form.detay_tetikleyici === "false" ? "bg-red-800 border-red-700 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                        Hayır
                      </button>
                    </div>
                  ) : (
                    <select value={form.detay_tetikleyici} onChange={e => setForm(f => ({ ...f, detay_tetikleyici: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 mb-3">
                      <option value="">— Seçenek seçin —</option>
                      {form.secenekler.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  )}

                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Takip Sorusu Metni</label>
                  <textarea value={form.detay_label} onChange={e => setForm(f => ({ ...f, detay_label: e.target.value }))} rows={2}
                    placeholder="Örn: Ne eksik kaldı?"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none mb-3" />

                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Takip Cevap Tipi</label>
                  <select value={form.detay_tip} onChange={e => setForm(f => ({ ...f, detay_tip: e.target.value as any }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                    <option value="">— Seçin —</option>
                    {DETAY_TIPLER.map(t => <option key={t} value={t}>{DETAY_TIP_LABELS[t]}</option>)}
                  </select>

                  {form.detay_tip === "secim" && (
                    <div className="mt-3">
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Takip Seçenekleri *</label>
                      <div className="space-y-1 mb-2">
                        {form.detay_secenekler.map((o, i) => (
                          <div key={i} className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-3 py-1.5">
                            <span className="flex-1 text-zinc-300 text-sm">{o}</span>
                            <button onClick={() => removeDetayOption(i)} className="text-zinc-600 hover:text-red-400 text-xs transition-colors">✕</button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input value={detayOptionInput} onChange={e => setDetayOptionInput(e.target.value)}
                          placeholder="Seçenek yazıp Ekle'ye basın"
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addDetayOption(); } }}
                          className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                        <button onClick={addDetayOption} disabled={!detayOptionInput.trim()}
                          className="bg-zinc-800 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-zinc-700 disabled:opacity-40 transition-colors">
                          Ekle
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving} className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
