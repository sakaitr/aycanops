"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

const TIP_LABELS: Record<string, string> = {
  kasa: "Kasa", banka: "Banka", kredi_karti: "Kredi Kartı", pos: "POS",
};
const PARA_BIRIMLERI = ["TRY", "USD", "EUR"];
const EMPTY_FORM = {
  ad: "", tip: "kasa", banka_adi: "", iban: "",
  para_birimi_kod: "TRY", acilis_bakiyesi: "0", company_id: "",
};

export default function KasaBankaPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    });
    load();
    fetch("/api/companies").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); });
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/finans/kasa-banka");
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() { setEditing(null); setForm({ ...EMPTY_FORM }); setSaveError(null); setShowForm(true); }
  function openEdit(row: any) {
    setEditing(row);
    setForm({
      ad: row.ad,
      tip: row.tip,
      banka_adi: row.banka_adi || "",
      iban: row.iban || "",
      para_birimi_kod: row.para_birimi_kod || "TRY",
      acilis_bakiyesi: String(row.acilis_bakiyesi ?? 0),
      company_id: row.company_id || "",
    });
    setSaveError(null); setShowForm(true);
  }

  async function save() {
    if (!form.ad.trim()) { setSaveError("Ad zorunludur"); return; }
    setSaving(true); setSaveError(null);
    try {
      const url = editing ? `/api/finans/kasa-banka/${editing.id}` : "/api/finans/kasa-banka";
      const method = editing ? "PUT" : "POST";
      const body = {
        ad: form.ad,
        tip: form.tip,
        banka_adi: form.banka_adi || null,
        iban: form.iban || null,
        para_birimi_kod: form.para_birimi_kod,
        acilis_bakiyesi: Number(form.acilis_bakiyesi) || 0,
        company_id: form.company_id || null,
      };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kayıt hatası"); return; }
      toast.success(editing ? "Hesap güncellendi" : "Hesap eklendi");
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  const canCreate = hasPermission(user, "finans_kasa_banka:create");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Kasa / Banka Hesapları</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} hesap</p>
            </div>
            {canCreate && (
              <button onClick={openCreate} className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Hesap
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz kasa/banka hesabı tanımlanmadı</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => {
                const company = companies.find(c => c.id === row.company_id);
                return (
                  <div key={row.id} onClick={() => openEdit(row)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 cursor-pointer hover:border-zinc-700 transition-colors">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold text-sm">{row.ad}</span>
                      <span className="text-zinc-500 text-xs">{TIP_LABELS[row.tip]}</span>
                      <span className="text-zinc-500 text-xs">{row.para_birimi_kod}</span>
                      {company && <span className="text-zinc-500 text-xs ml-auto">{company.name}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold">{editing ? "Hesabı Düzenle" : "Yeni Hesap"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Ad *</span>
                <input value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))}
                  placeholder="örn. Ana Kasa"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Tip *</span>
                <select value={form.tip} onChange={e => setForm(f => ({ ...f, tip: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  {Object.entries(TIP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Banka Adı</span>
                <input value={form.banka_adi} onChange={e => setForm(f => ({ ...f, banka_adi: e.target.value }))}
                  placeholder="örn. İş Bankası"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">IBAN</span>
                <input value={form.iban} onChange={e => setForm(f => ({ ...f, iban: e.target.value }))}
                  placeholder="TR.. .."
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Para Birimi</span>
                <select value={form.para_birimi_kod} onChange={e => setForm(f => ({ ...f, para_birimi_kod: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  {PARA_BIRIMLERI.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Açılış Bakiyesi</span>
                <input type="number" step="0.01" value={form.acilis_bakiyesi} onChange={e => setForm(f => ({ ...f, acilis_bakiyesi: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Firma</span>
                <select value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none">
                  <option value="">— Genel (firma bağımsız) —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </div>
            <div className="px-5 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-medium text-sm py-2.5 rounded-xl hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving || !form.ad.trim()}
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
