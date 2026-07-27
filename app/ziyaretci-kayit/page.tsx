"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
}
function fmtSure(girisIso: string, cikisIso: string | null) {
  if (!cikisIso) return null;
  const dk = Math.round((new Date(cikisIso).getTime() - new Date(girisIso).getTime()) / 60000);
  if (dk < 60) return `${dk} dk`;
  const saat = Math.floor(dk / 60);
  const kalanDk = dk % 60;
  return kalanDk > 0 ? `${saat}sa ${kalanDk}dk` : `${saat}sa`;
}

const EMPTY_FORM = { ziyaretci_adi: "", sebep: "", kime_geldi: "" };

export default function ZiyaretciKayitPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [aktifListe, setAktifListe] = useState<any[]>([]);
  const [gecmisListe, setGecmisListe] = useState<any[]>([]);
  const [loadingAktif, setLoadingAktif] = useState(true);
  const [loadingGecmis, setLoadingGecmis] = useState(true);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [cikisYapiliyor, setCikisYapiliyor] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(todayIstanbul());
  const [dateTo, setDateTo] = useState(todayIstanbul());

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    });
  }, []);

  useEffect(() => { loadAktif(); }, []);
  useEffect(() => { loadGecmis(); }, [dateFrom, dateTo]);

  async function loadAktif() {
    setLoadingAktif(true);
    try {
      const r = await fetch("/api/ziyaretci-kayit?aktif=1");
      const d = await r.json();
      if (d.ok) setAktifListe(d.data);
    } finally { setLoadingAktif(false); }
  }

  async function loadGecmis() {
    setLoadingGecmis(true);
    try {
      const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      const r = await fetch(`/api/ziyaretci-kayit?${p.toString()}`);
      const d = await r.json();
      if (d.ok) setGecmisListe(d.data);
    } finally { setLoadingGecmis(false); }
  }

  async function girisKaydet() {
    if (!form.ziyaretci_adi.trim() || !form.sebep.trim() || !form.kime_geldi.trim()) {
      setSaveError("Ad soyad, sebep ve kime geldiği zorunludur");
      return;
    }
    setSaving(true); setSaveError("");
    try {
      const r = await fetch("/api/ziyaretci-kayit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kayıt başarısız"); return; }
      setForm({ ...EMPTY_FORM });
      toast.success("Giriş kaydedildi");
      loadAktif();
      loadGecmis();
    } finally { setSaving(false); }
  }

  async function cikisYap(id: string) {
    setCikisYapiliyor(id);
    try {
      const r = await fetch(`/api/ziyaretci-kayit/${id}`, { method: "PATCH" });
      const d = await r.json();
      if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "İşlem başarısız"); return; }
      toast.success("Çıkış kaydedildi");
      loadAktif();
      loadGecmis();
    } finally { setCikisYapiliyor(null); }
  }

  const canCreate = hasPermission(user, "ziyaretci_kaydi:create");
  const canUpdate = hasPermission(user, "ziyaretci_kaydi:update");

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Ziyaretçi Kayıt</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Lobi giriş-çıkış defteri</p>
        </div>

        {/* Yeni kayıt formu */}
        {canCreate && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Yeni Giriş</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <input
                type="text" value={form.ziyaretci_adi}
                onChange={e => setForm(f => ({ ...f, ziyaretci_adi: e.target.value }))}
                placeholder="Ad Soyad *"
                className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
              />
              <input
                type="text" value={form.kime_geldi}
                onChange={e => setForm(f => ({ ...f, kime_geldi: e.target.value }))}
                placeholder="Kime Geldi *"
                className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
              />
              <input
                type="text" value={form.sebep}
                onChange={e => setForm(f => ({ ...f, sebep: e.target.value }))}
                placeholder="Ziyaret Sebebi *"
                className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
              />
            </div>
            {saveError && <p className="text-red-400 text-sm mb-3">{saveError}</p>}
            <button
              onClick={girisKaydet}
              disabled={saving}
              className="bg-white text-zinc-950 font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors"
            >
              {saving ? "Kaydediliyor..." : "Giriş Kaydet"}
            </button>
          </div>
        )}

        {/* Şu an içeride */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Şu An İçeride</p>
            {aktifListe.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">{aktifListe.length}</span>
            )}
          </div>
          {loadingAktif ? (
            <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-16 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />)}</div>
          ) : aktifListe.length === 0 ? (
            <p className="text-zinc-600 text-sm py-6 text-center bg-zinc-900/50 border border-zinc-800/60 rounded-xl">Şu an içeride ziyaretçi yok</p>
          ) : (
            <div className="space-y-2">
              {aktifListe.map(z => (
                <div key={z.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <p className="text-sm font-semibold text-white">{z.ziyaretci_adi}</p>
                      <span className="text-xs text-zinc-500">→ {z.kime_geldi}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 truncate">{z.sebep}</p>
                    <p className="text-xs text-zinc-600 mt-0.5">Giriş: {fmtTime(z.giris_zamani)} · {z.kaydeden}</p>
                  </div>
                  {canUpdate && (
                    <button
                      onClick={() => cikisYap(z.id)}
                      disabled={cikisYapiliyor === z.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-red-950 hover:text-red-300 text-zinc-300 disabled:opacity-50 transition-colors shrink-0"
                    >
                      {cikisYapiliyor === z.id ? "..." : "Çıkış Yap"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Geçmiş / Rapor */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Geçmiş Kayıtlar</p>
            <div className="flex items-center gap-2">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2.5 py-1.5 rounded-lg focus:outline-none [color-scheme:dark]" />
              <span className="text-zinc-600 text-xs">—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-2.5 py-1.5 rounded-lg focus:outline-none [color-scheme:dark]" />
            </div>
          </div>
          {loadingGecmis ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />)}</div>
          ) : gecmisListe.length === 0 ? (
            <p className="text-zinc-600 text-sm py-6 text-center bg-zinc-900/50 border border-zinc-800/60 rounded-xl">Bu tarih aralığında kayıt yok</p>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              {gecmisListe.map((z, i) => {
                const sure = fmtSure(z.giris_zamani, z.cikis_zamani);
                return (
                  <div key={z.id} className={`px-4 py-3 ${i < gecmisListe.length - 1 ? "border-b border-zinc-800/60" : ""}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-white">{z.ziyaretci_adi}</p>
                      <span className="text-xs text-zinc-500">→ {z.kime_geldi}</span>
                      <span className="text-xs text-zinc-600 ml-auto">{fmtDate(z.giris_zamani)}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">{z.sebep}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      <span className="text-zinc-500">Giriş: <span className="text-zinc-300">{fmtTime(z.giris_zamani)}</span></span>
                      {z.cikis_zamani ? (
                        <>
                          <span className="text-zinc-500">Çıkış: <span className="text-zinc-300">{fmtTime(z.cikis_zamani)}</span></span>
                          <span className="text-zinc-600">({sure})</span>
                        </>
                      ) : (
                        <span className="text-emerald-400 font-medium">İçeride</span>
                      )}
                      <span className="text-zinc-700">· {z.kaydeden}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
