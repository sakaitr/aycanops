"use client";
import { useState, useEffect, useRef } from "react";
import Nav from "@/components/Nav";
import { IconCalendar, IconCheck, IconX, IconClock, IconPlus, IconFileText, IconChevronDown } from "@/components/Icons";

const DURUM_META: Record<string, { label: string; color: string; bg: string }> = {
  bekliyor:    { label: "Bekliyor",    color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20" },
  onaylandi:   { label: "Onaylandı",   color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  reddedildi:  { label: "Reddedildi",  color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20" },
};

function fmtDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function IzinTalepleriPage() {
  const [user, setUser] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [isOnaylayici, setIsOnaylayici] = useState(false);
  const [turler, setTurler] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"hepsi" | "bekleyen">("hepsi");
  const [showForm, setShowForm] = useState(false);
  const [onayModal, setOnayModal] = useState<{ talep: any; action: "onayla" | "reddet" } | null>(null);
  const [onayNotu, setOnayNotu] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(false);

  // Form state
  const [form, setForm] = useState({ tur_id: "", baslangic: "", bitis: "", belge_url: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); });
    fetch("/api/izin-turleri").then(r => r.json()).then(d => { if (d.ok) setTurler(d.data); });
    loadItems();
  }, []);

  useEffect(() => {
    loadItems();
  }, [tab]);

  async function loadItems() {
    setLoading(true);
    const url = tab === "bekleyen" ? "/api/izin-talepleri?bekleyenler=1" : "/api/izin-talepleri";
    const d = await fetch(url).then(r => r.json());
    if (d.ok) { setItems(d.data); setIsOnaylayici(d.isOnaylayici); }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.tur_id || !form.baslangic || !form.bitis) return;
    setSaving(true);
    const res = await fetch("/api/izin-talepleri", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    setSaving(false);
    if (d.ok) {
      setShowForm(false);
      setForm({ tur_id: "", baslangic: "", bitis: "", belge_url: "" });
      loadItems();
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadProgress(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", "izin");
    const res = await fetch("/api/belgeler", { method: "POST", body: fd });
    const d = await res.json();
    setUploadProgress(false);
    if (d.ok && d.url) setForm(f => ({ ...f, belge_url: d.url }));
  }

  async function handleOnayAction() {
    if (!onayModal) return;
    setSaving(true);
    await fetch(`/api/izin-talepleri/${onayModal.talep.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: onayModal.action, onay_notu: onayNotu }),
    });
    setSaving(false);
    setOnayModal(null);
    setOnayNotu("");
    loadItems();
  }

  async function handleIptal(id: string) {
    await fetch(`/api/izin-talepleri/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "iptal" }),
    });
    loadItems();
  }

  const bekleyenCount = items.filter(i => i.durum === "bekliyor").length;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="p-4 md:p-6 max-w-4xl mx-auto">

        {/* Başlık */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">İzin Talepleri</h1>
            <p className="text-sm text-zinc-500 mt-0.5">İzin talebi oluştur ve takip et</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--t-accent)] text-zinc-950 text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            <IconPlus size={16} />
            Yeni Talep
          </button>
        </div>

        {/* Sekmeler */}
        {isOnaylayici && (
          <div className="flex gap-1 mb-4 bg-zinc-900 p-1 rounded-xl w-fit">
            <button
              onClick={() => setTab("hepsi")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === "hepsi" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Tümü
            </button>
            <button
              onClick={() => setTab("bekleyen")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === "bekleyen" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Onay Bekleyen
              {bekleyenCount > 0 && (
                <span className="min-w-[18px] h-[18px] flex items-center justify-center bg-amber-500 text-zinc-900 text-[10px] font-bold rounded-full px-1">
                  {bekleyenCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Liste */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-zinc-900 rounded-xl animate-pulse" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center">
              <IconCalendar size={22} className="text-zinc-600" />
            </div>
            <p className="text-zinc-500 text-sm">
              {tab === "bekleyen" ? "Onay bekleyen talep yok" : "Henüz izin talebi yok"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(talep => {
              const meta = DURUM_META[talep.durum] ?? DURUM_META.bekliyor;
              const benimTalep = talep.user_id === user?.id;
              return (
                <div key={talep.id} className="bg-zinc-900 border border-zinc-800/60 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isOnaylayici && !benimTalep && (
                          <span className="text-sm font-semibold text-white">{talep.user_full_name}</span>
                        )}
                        <span className="text-sm font-medium text-zinc-300">{talep.tur_ad}</span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.color} ${meta.bg}`}>
                          {talep.durum === "bekliyor" && <IconClock size={10} />}
                          {talep.durum === "onaylandi" && <IconCheck size={10} />}
                          {talep.durum === "reddedildi" && <IconX size={10} />}
                          {meta.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-zinc-500">
                        <IconCalendar size={12} />
                        <span>{fmtDate(talep.baslangic)} – {fmtDate(talep.bitis)}</span>
                        <span className="text-zinc-700">·</span>
                        <span>{talep.gun_sayisi} gün</span>
                        {talep.department_name && (
                          <>
                            <span className="text-zinc-700">·</span>
                            <span>{talep.department_name}</span>
                          </>
                        )}
                      </div>
                      {talep.onay_notu && (
                        <p className="mt-1.5 text-xs text-zinc-500 italic">"{talep.onay_notu}"</p>
                      )}
                      {talep.onaylayan_ad && (
                        <p className="mt-1 text-xs text-zinc-600">
                          {talep.durum === "onaylandi" ? "Onaylayan" : "Reddeden"}: {talep.onaylayan_ad}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {talep.belge_url && (
                        <a
                          href={talep.belge_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                          title="Belgeyi görüntüle"
                        >
                          <IconFileText size={15} />
                        </a>
                      )}
                      {/* Onaylayıcı aksiyonları */}
                      {isOnaylayici && talep.durum === "bekliyor" && (
                        <>
                          <button
                            onClick={() => setOnayModal({ talep, action: "onayla" })}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                          >
                            <IconCheck size={13} />
                            Onayla
                          </button>
                          <button
                            onClick={() => setOnayModal({ talep, action: "reddet" })}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            <IconX size={13} />
                            Reddet
                          </button>
                        </>
                      )}
                      {/* Kullanıcı kendi talebini iptal edebilir */}
                      {benimTalep && talep.durum === "bekliyor" && (
                        <button
                          onClick={() => handleIptal(talep.id)}
                          className="w-8 h-8 flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="İptal et"
                        >
                          <IconX size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Yeni Talep Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setShowForm(false)}>
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-zinc-900 border border-zinc-700/60 rounded-t-2xl md:rounded-2xl shadow-2xl p-5 md:m-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">Yeni İzin Talebi</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
                <IconX size={17} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* İzin türü */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">İzin Türü *</label>
                <div className="relative">
                  <select
                    required
                    value={form.tur_id}
                    onChange={e => setForm(f => ({ ...f, tur_id: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 pr-8 appearance-none focus:outline-none focus:border-[var(--t-accent)]"
                  >
                    <option value="">Seçiniz</option>
                    {turler.map(t => <option key={t.id} value={t.id}>{t.ad}</option>)}
                  </select>
                  <IconChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>
              </div>

              {/* Tarihler */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Başlangıç *</label>
                  <input
                    type="date"
                    required
                    value={form.baslangic}
                    onChange={e => setForm(f => ({ ...f, baslangic: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[var(--t-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Bitiş *</label>
                  <input
                    type="date"
                    required
                    min={form.baslangic}
                    value={form.bitis}
                    onChange={e => setForm(f => ({ ...f, bitis: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[var(--t-accent)]"
                  />
                </div>
              </div>

              {form.baslangic && form.bitis && new Date(form.bitis) >= new Date(form.baslangic) && (
                <p className="text-xs text-zinc-500">
                  {Math.ceil((new Date(form.bitis).getTime() - new Date(form.baslangic).getTime()) / 86400000) + 1} gün
                </p>
              )}

              {/* Belge */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Belge (opsiyonel)</label>
                {form.belge_url ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
                    <IconFileText size={14} />
                    <span className="flex-1 truncate">Belge yüklendi</span>
                    <button type="button" onClick={() => setForm(f => ({ ...f, belge_url: "" }))} className="text-zinc-500 hover:text-red-400">
                      <IconX size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadProgress}
                    className="w-full flex items-center justify-center gap-2 border border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl px-3 py-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {uploadProgress ? "Yükleniyor..." : <><IconFileText size={15} /> Dosya seç</>}
                  </button>
                )}
                <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 bg-[var(--t-accent)] text-zinc-950 text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? "Gönderiliyor..." : "Talebi Gönder"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Onay/Red Modal */}
      {onayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setOnayModal(null)}>
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl p-5 m-4"
            onClick={e => e.stopPropagation()}
          >
            <h2 className={`text-base font-semibold mb-1 ${onayModal.action === "onayla" ? "text-emerald-400" : "text-red-400"}`}>
              {onayModal.action === "onayla" ? "İzni Onayla" : "İzni Reddet"}
            </h2>
            <p className="text-sm text-zinc-500 mb-4">
              <strong className="text-zinc-300">{onayModal.talep.user_full_name}</strong> — {onayModal.talep.tur_ad}
              <br />
              {fmtDate(onayModal.talep.baslangic)} – {fmtDate(onayModal.talep.bitis)}
            </p>
            <textarea
              placeholder={`${onayModal.action === "onayla" ? "Onay notu" : "Red nedeni"} (opsiyonel)`}
              value={onayNotu}
              onChange={e => setOnayNotu(e.target.value)}
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-[var(--t-accent)] mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setOnayModal(null); setOnayNotu(""); }}
                className="flex-1 py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleOnayAction}
                disabled={saving}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-opacity disabled:opacity-50 ${
                  onayModal.action === "onayla"
                    ? "bg-emerald-500 text-white hover:bg-emerald-400"
                    : "bg-red-500 text-white hover:bg-red-400"
                }`}
              >
                {saving ? "..." : onayModal.action === "onayla" ? "Onayla" : "Reddet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
