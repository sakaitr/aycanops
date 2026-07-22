"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR").format(new Date(d));
}

const EMPTY_FORM = { baslik: "", hedef_grup: "", baslangic_tarihi: new Date().toISOString().slice(0, 10), bitis_tarihi: "" };

export default function AnketlerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [sorular, setSorular] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [respondAnket, setRespondAnket] = useState<any>(null);
  const [respondAnswers, setRespondAnswers] = useState<string[]>([]);
  const [responding, setResponding] = useState(false);

  const [detailAnket, setDetailAnket] = useState<any>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    });
  }, []);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/anketler");
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  async function save() {
    const temizSorular = sorular.map(s => s.trim()).filter(Boolean);
    if (!form.baslik.trim()) { setSaveError("Başlık zorunludur"); return; }
    if (temizSorular.length === 0) { setSaveError("En az bir soru ekleyin"); return; }
    if (!form.bitis_tarihi) { setSaveError("Bitiş tarihi zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/admin/anketler", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sorular: temizSorular }),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success("Anket oluşturuldu");
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      setSorular([""]);
      load();
    } finally { setSaving(false); }
  }

  async function toggleActive(row: any) {
    const res = await fetch(`/api/admin/anketler/${row.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !row.is_active }),
    });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success(row.is_active ? "Anket kapatıldı" : "Anket yeniden açıldı");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Bu anket ve yanıtları silinsin mi?")) return;
    const res = await fetch(`/api/admin/anketler/${id}`, { method: "DELETE" });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success("Anket silindi");
    load();
  }

  function openRespond(row: any) {
    const sorular = JSON.parse(row.sorular);
    setRespondAnket({ ...row, sorularParsed: sorular });
    setRespondAnswers(sorular.map(() => ""));
  }

  async function submitRespond() {
    if (respondAnswers.some(a => !a.trim())) { toast.error("Tüm soruları yanıtlayın"); return; }
    setResponding(true);
    try {
      const res = await fetch(`/api/admin/anketler/${respondAnket.id}/yanit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yanitlar: respondAnswers }),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(d.error || "Hata"); return; }
      toast.success("Yanıtınız kaydedildi");
      setRespondAnket(null);
      load();
    } finally { setResponding(false); }
  }

  async function openDetail(row: any) {
    const r = await fetch(`/api/admin/anketler/${row.id}`);
    const d = await r.json();
    if (d.ok) setDetailAnket(d.data);
  }

  const canCreate = hasPermission(user, "anketler:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Anketler</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} anket</p>
            </div>
            {canCreate && (
              <button onClick={() => { setShowForm(true); setSaveError(null); }}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Anket
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-20 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz anket yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm">{row.baslik}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      row.is_active ? "bg-emerald-950 border-emerald-800 text-emerald-300" : "bg-zinc-800 border-zinc-700 text-zinc-500"
                    }`}>
                      {row.is_active ? "Aktif" : "Kapalı"}
                    </span>
                    {row.ben_yanitladim > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border bg-indigo-950 border-indigo-800 text-indigo-300">Yanıtladınız</span>
                    )}
                  </div>
                  <p className="text-zinc-600 text-xs mt-1">
                    {formatDate(row.baslangic_tarihi)} — {formatDate(row.bitis_tarihi)}
                    {canCreate ? ` · ${row.yanit_sayisi} yanıt` : ""}
                  </p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {!canCreate && row.is_active && !row.ben_yanitladim && (
                      <button onClick={() => openRespond(row)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-indigo-800 bg-indigo-950 text-indigo-300 hover:bg-indigo-900 transition-colors">
                        Yanıtla
                      </button>
                    )}
                    {canCreate && (
                      <>
                        <button onClick={() => openDetail(row)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
                          Yanıtları Gör
                        </button>
                        <button onClick={() => toggleActive(row)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
                          {row.is_active ? "Kapat" : "Yeniden Aç"}
                        </button>
                        <button onClick={() => remove(row.id)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-800 bg-red-950 text-red-300 hover:bg-red-900 transition-colors">
                          Sil
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Yeni anket formu */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold">Yeni Anket</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Başlık *</span>
                <input value={form.baslik} onChange={e => setForm(f => ({ ...f, baslik: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <div>
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Sorular *</span>
                <div className="space-y-2">
                  {sorular.map((s, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={s} onChange={e => setSorular(prev => prev.map((p, idx) => idx === i ? e.target.value : p))}
                        placeholder={`Soru ${i + 1}`}
                        className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                      {sorular.length > 1 && (
                        <button onClick={() => setSorular(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-zinc-500 hover:text-red-400 px-2">×</button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => setSorular(prev => [...prev, ""])}
                  className="text-xs text-indigo-400 hover:text-indigo-300 mt-2">+ Soru ekle</button>
              </div>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Hedef Grup (opsiyonel)</span>
                <input value={form.hedef_grup} onChange={e => setForm(f => ({ ...f, hedef_grup: e.target.value }))}
                  placeholder="örn. Tüm sürücüler"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Başlangıç *</span>
                  <input type="date" value={form.baslangic_tarihi} onChange={e => setForm(f => ({ ...f, baslangic_tarihi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
                <label className="block">
                  <span className="text-zinc-400 text-xs font-medium mb-1 block">Bitiş *</span>
                  <input type="date" value={form.bitis_tarihi} onChange={e => setForm(f => ({ ...f, bitis_tarihi: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
                </label>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving}
                className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {saving ? "Oluşturuluyor..." : "Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yanıtlama modalı */}
      {respondAnket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => !responding && setRespondAnket(null)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-white font-semibold">{respondAnket.baslik}</h3>
            {respondAnket.sorularParsed.map((soru: string, i: number) => (
              <label key={i} className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">{i + 1}. {soru}</span>
                <textarea value={respondAnswers[i]} onChange={e => setRespondAnswers(prev => prev.map((p, idx) => idx === i ? e.target.value : p))}
                  rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </label>
            ))}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setRespondAnket(null)} disabled={responding} className="flex-1 bg-zinc-800 text-zinc-300 text-sm py-2.5 rounded-xl disabled:opacity-50">Vazgeç</button>
              <button onClick={submitRespond} disabled={responding}
                className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl disabled:opacity-50">
                {responding ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yanıtları görüntüleme modalı */}
      {detailAnket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetailAnket(null)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg mx-4 space-y-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-white font-semibold">{detailAnket.baslik} — Yanıtlar ({detailAnket.yanitlar.length})</h3>
            {detailAnket.yanitlar.length === 0 ? (
              <p className="text-zinc-600 text-sm">Henüz yanıt yok</p>
            ) : (
              <div className="space-y-3">
                {detailAnket.yanitlar.map((y: any) => (
                  <div key={y.id} className="bg-zinc-800/50 rounded-lg p-3 space-y-1.5">
                    <p className="text-zinc-400 text-xs font-medium">{y.yanit_veren_adi}</p>
                    {JSON.parse(detailAnket.sorular).map((soru: string, i: number) => (
                      <div key={i} className="text-sm">
                        <p className="text-zinc-500 text-xs">{soru}</p>
                        <p className="text-zinc-200">{JSON.parse(y.yanitlar)[i]}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setDetailAnket(null)} className="w-full bg-zinc-800 text-zinc-300 text-sm py-2.5 rounded-xl">Kapat</button>
          </div>
        </div>
      )}
    </>
  );
}
