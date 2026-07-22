"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ComboboxSearch from "@/components/ComboboxSearch";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

function formatCurrency(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n);
}

function formatDonem(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(new Date(d));
}

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const DURUM_BADGE: Record<string, { label: string; cls: string }> = {
  bekliyor: { label: "Bekliyor", cls: "bg-amber-950 border-amber-800 text-amber-300" },
  onaylandi: { label: "Onaylandı", cls: "bg-emerald-950 border-emerald-800 text-emerald-300" },
  itiraz: { label: "İtiraz", cls: "bg-red-950 border-red-800 text-red-300" },
};

export default function MutabakatPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<any[]>([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [durumFilter, setDurumFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [formCompany, setFormCompany] = useState("");
  const [formDonem, setFormDonem] = useState(currentMonthStr());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    });
    fetch("/api/companies?limit=500").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); });
  }, []);

  useEffect(() => { load(); }, [companyFilter, durumFilter]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (companyFilter) params.set("company_id", companyFilter);
      if (durumFilter) params.set("durum", durumFilter);
      const r = await fetch(`/api/firma-mutabakat?${params}`);
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  async function save() {
    if (!formCompany) { setSaveError("Firma seçiniz"); return; }
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/firma-mutabakat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: formCompany, donem: formDonem }),
      });
      const d = await res.json();
      if (!d.ok) { setSaveError(d.error || "Kayıt hatası"); return; }
      toast.success(`Mutabakat oluşturuldu — ${formatCurrency(d.data.tutar)}`);
      setShowForm(false);
      setFormCompany("");
      load();
    } finally { setSaving(false); }
  }

  async function doAction(id: string, action: string, extra?: any) {
    const res = await fetch(`/api/firma-mutabakat/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const d = await res.json();
    if (!d.ok) { toast.error(d.error || "Hata"); return; }
    toast.success("İşlem tamamlandı");
    load();
  }

  function itirazEt(id: string) {
    const reason = prompt("İtiraz açıklaması:");
    if (reason === null) return;
    doAction(id, "itiraz", { itiraz_aciklamasi: reason });
  }

  const canCreate = hasPermission(user, "firma_mutabakat:create");
  const canApprove = hasPermission(user, "firma_mutabakat:approve");
  const toplamTutar = rows.reduce((sum, r) => sum + Number(r.tutar || 0), 0);

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Firma Mutabakat</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{rows.length} kayıt · Toplam {formatCurrency(toplamTutar)}</p>
            </div>
            {canCreate && (
              <button onClick={() => { setShowForm(true); setSaveError(null); }}
                className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 transition-colors whitespace-nowrap">
                + Yeni Mutabakat
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mb-6">
            <ComboboxSearch
              options={companies.map((c: any) => ({ value: c.id, label: c.name }))}
              value={companyFilter}
              onChange={setCompanyFilter}
              placeholder="Firmaya göre filtrele..."
              emptyLabel="— Tüm Firmalar —"
            />
            <select value={durumFilter} onChange={e => setDurumFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-zinc-600">
              <option value="">Tüm Durumlar</option>
              {Object.entries(DURUM_BADGE).map(([v, l]) => <option key={v} value={v}>{l.label}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Mutabakat kaydı yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => {
                const badge = DURUM_BADGE[row.durum] || DURUM_BADGE.bekliyor;
                return (
                  <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-white font-medium text-sm">{row.company_name}</span>
                      <span className="text-zinc-500 text-xs capitalize">{formatDonem(row.donem)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
                      <span className="text-white font-semibold text-sm ml-auto">{formatCurrency(row.tutar)}</span>
                    </div>
                    {row.itiraz_aciklamasi && (
                      <p className="text-red-400 text-xs mt-1.5">İtiraz: {row.itiraz_aciklamasi}</p>
                    )}
                    {canApprove && row.durum === "bekliyor" && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => doAction(row.id, "onayla")}
                          className="text-xs px-3 py-1.5 rounded-lg border border-emerald-800 bg-emerald-950 text-emerald-300 hover:bg-emerald-900 transition-colors">
                          Onayla
                        </button>
                        <button onClick={() => itirazEt(row.id)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-800 bg-red-950 text-red-300 hover:bg-red-900 transition-colors">
                          İtiraz Et
                        </button>
                      </div>
                    )}
                    {canApprove && row.durum === "itiraz" && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => doAction(row.id, "yeniden-hesapla")}
                          className="text-xs px-3 py-1.5 rounded-lg border border-sky-800 bg-sky-950 text-sky-300 hover:bg-sky-900 transition-colors">
                          Yeniden Hesapla
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowForm(false)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4">
            <h3 className="text-white font-semibold">Yeni Mutabakat</h3>
            {saveError && (
              <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>
            )}
            <label className="block">
              <span className="text-zinc-400 text-xs font-medium mb-1 block">Firma *</span>
              <ComboboxSearch
                options={companies.map((c: any) => ({ value: c.id, label: c.name }))}
                value={formCompany}
                onChange={setFormCompany}
                placeholder="Firma seç..."
                emptyLabel="— Firma Yok —"
              />
            </label>
            <label className="block">
              <span className="text-zinc-400 text-xs font-medium mb-1 block">Dönem (Ay) *</span>
              <input type="month" value={formDonem.slice(0, 7)} onChange={e => setFormDonem(`${e.target.value}-01`)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
            </label>
            <p className="text-zinc-600 text-xs">Tutar, bu firmanın güzergahlarında o ay onaylanan çetele kayıtlarının güzergah fiyatından otomatik hesaplanır.</p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm py-2.5 rounded-xl">İptal</button>
              <button onClick={save} disabled={saving || !formCompany}
                className="flex-1 bg-white text-zinc-950 font-semibold text-sm py-2.5 rounded-xl disabled:opacity-50">
                {saving ? "Hesaplanıyor..." : "Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
