"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ComboboxSearch from "@/components/ComboboxSearch";

export default function GuzergahFiyatlariPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [filter, setFilter] = useState({ company_id: "", route_id: "", plate: "" });
  const [form, setForm] = useState({ price_amount: "", plate: "", valid_from: new Date().toISOString().slice(0, 10), valid_to: "" });

  // Toplu güncelleme
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkForm, setBulkForm] = useState({ mode: "percent" as "percent" | "amount", value: "", valid_from: new Date().toISOString().slice(0, 10) });
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ updated: number; skipped: { id: string; reason: string }[] } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => d.ok ? setUser(d.data) : router.replace("/login"));
    fetch("/api/companies").then(r => r.json()).then(d => d.ok && setCompanies(d.data));
  }, []);

  useEffect(() => {
    setFilter(f => ({ ...f, route_id: "" }));
    if (!filter.company_id) { setRoutes([]); return; }
    fetch(`/api/routes?company_id=${filter.company_id}`).then(r => r.json()).then(d => d.ok && setRoutes(d.data));
  }, [filter.company_id]);

  useEffect(() => { loadPrices(); }, [filter.company_id, filter.route_id, filter.plate]);

  async function loadPrices() {
    const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
    const res = await fetch(`/api/route-prices?${qs}`);
    const json = await res.json();
    if (json.ok) setPrices(json.data);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setBulkResult(null);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setBulkResult(null);
    setSelectedIds(prev => prev.size === prices.length ? new Set() : new Set(prices.map(p => p.id)));
  }

  async function applyBulkUpdate() {
    if (selectedIds.size === 0) return alert("En az bir fiyat kaydı seçin");
    if (!bulkForm.value.trim()) return alert("Artış oranı veya tutarı girin");
    setBulkSaving(true);
    setBulkResult(null);
    try {
      const res = await fetch("/api/route-prices/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          mode: bulkForm.mode,
          value: Number(bulkForm.value),
          valid_from: bulkForm.valid_from,
        }),
      });
      const json = await res.json();
      if (!json.ok) return alert(typeof json.error === "string" ? json.error : "Toplu güncelleme başarısız");
      setBulkResult({ updated: json.data.updated.length, skipped: json.data.skipped });
      setSelectedIds(new Set());
      await loadPrices();
    } finally { setBulkSaving(false); }
  }

  async function createPrice() {
    if (!filter.company_id || !filter.route_id || !form.price_amount || !form.plate.trim()) return alert("Firma, güzergah, plaka ve fiyat zorunlu");
    const res = await fetch("/api/route-prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: filter.company_id, route_id: filter.route_id, plate: form.plate, price_amount: Number(form.price_amount), currency: "TRY", valid_from: form.valid_from, valid_to: form.valid_to || null }) });
    const json = await res.json();
    if (!json.ok) return alert(json.error || "Fiyat kaydedilemedi");
    setForm({ price_amount: "", plate: "", valid_from: new Date().toISOString().slice(0, 10), valid_to: "" });
    await loadPrices();
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Güzergah Fiyatları</h1>
          <p className="mt-1 text-sm text-zinc-500">Fiyatlar firma + güzergah + plaka bazlı girilir.</p>
        </div>

        <section className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:grid-cols-3">
          <ComboboxSearch options={companies.map(c => ({ value: c.id, label: c.name }))} value={filter.company_id} onChange={v => setFilter(f => ({ ...f, company_id: v }))} placeholder="Firma ara" emptyLabel="Firma seç" />
          <ComboboxSearch options={routes.map(r => ({ value: r.id, label: r.name }))} value={filter.route_id} onChange={v => setFilter(f => ({ ...f, route_id: v }))} placeholder="Güzergah ara" emptyLabel="Güzergah seç" />
          <input value={filter.plate} onChange={e => setFilter(f => ({ ...f, plate: e.target.value.toUpperCase() }))} placeholder="Plaka filtresi" className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-[16px] text-white outline-none uppercase" />
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-white">Fiyat geçmişi</h2>
              {selectedIds.size > 0 && <span className="text-xs text-indigo-400">{selectedIds.size} kayıt seçili</span>}
            </div>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="py-2 w-8">
                      <input type="checkbox" checked={prices.length > 0 && selectedIds.size === prices.length} onChange={toggleSelectAll}
                        className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 accent-indigo-500" />
                    </th>
                    <th className="py-2">Firma</th><th>Güzergah</th><th>Plaka</th><th>Fiyat</th><th>Geçerlilik</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-zinc-300">
                  {prices.map(p => (
                    <tr key={p.id} className={selectedIds.has(p.id) ? "bg-indigo-950/30" : undefined}>
                      <td className="py-3">
                        <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelected(p.id)}
                          className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 accent-indigo-500" />
                      </td>
                      <td className="py-3">{p.company_name}</td><td>{p.route_name}</td><td className="font-mono">{p.plate || p.vehicle_plate || "—"}</td><td className="font-semibold text-white">{Number(p.price_amount).toLocaleString("tr-TR")} {p.currency}</td><td>{new Date(p.valid_from).toLocaleDateString("tr-TR")} → {p.valid_to ? new Date(p.valid_to).toLocaleDateString("tr-TR") : "devam"}</td>
                    </tr>
                  ))}
                  {prices.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-zinc-500">Fiyat kaydı yok</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Toplu fiyat güncelleme */}
            {selectedIds.size > 0 && (
              <div className="mt-4 rounded-xl border border-indigo-900 bg-indigo-950/20 p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">Seçili {selectedIds.size} fiyatı toplu güncelle</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">Güncelleme Tipi</span>
                    <select value={bulkForm.mode} onChange={e => setBulkForm(f => ({ ...f, mode: e.target.value as "percent" | "amount" }))}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white">
                      <option value="percent">Yüzde (%) artış</option>
                      <option value="amount">Sabit tutar artış</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">{bulkForm.mode === "percent" ? "Artış Oranı (%)" : "Artış Tutarı (₺)"}</span>
                    <input type="number" step="0.01" value={bulkForm.value} onChange={e => setBulkForm(f => ({ ...f, value: e.target.value }))}
                      placeholder={bulkForm.mode === "percent" ? "örn. 10" : "örn. 250"}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white" />
                  </label>
                  <label className="block">
                    <span className="text-zinc-400 text-xs font-medium mb-1 block">Geçerlilik Başlangıcı</span>
                    <input type="date" value={bulkForm.valid_from} onChange={e => setBulkForm(f => ({ ...f, valid_from: e.target.value }))}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white" />
                  </label>
                  <button onClick={applyBulkUpdate} disabled={bulkSaving}
                    className="self-end rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-50">
                    {bulkSaving ? "Uygulanıyor..." : "Toplu Güncelle"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Negatif değer girerek indirim de uygulayabilirsiniz (örn. -10 = %10 indirim). Yeni fiyat, seçtiğiniz geçerlilik tarihinden itibaren geçerli olur; eski fiyat kaydı o tarihten bir gün öncesine kadar kapatılır.
                </p>
              </div>
            )}

            {bulkResult && (
              <div className="mt-3 rounded-lg border border-emerald-800 bg-emerald-950 px-3 py-2 text-xs text-emerald-300">
                {bulkResult.updated} fiyat güncellendi.
                {bulkResult.skipped.length > 0 && ` ${bulkResult.skipped.length} kayıt atlandı: ${bulkResult.skipped.map(s => s.reason).join(", ")}`}
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-3 font-semibold text-white">Direkt fiyat gir</h2>
            <div className="space-y-3">
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Yeni Fiyat</span>
                <input type="number" value={form.price_amount} onChange={e => setForm(f => ({ ...f, price_amount: e.target.value }))} placeholder="0.00" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-[16px] text-white" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Plaka</span>
                <input value={form.plate} onChange={e => setForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))} placeholder="örn. 34 ABC 123" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-[16px] text-white uppercase" />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Geçerlilik Başlangıcı</span>
                <input type="date" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-[16px] text-white" />
                <span className="text-zinc-600 text-xs mt-1 block">
                  Fiyat yalnızca bu tarihten sonraki çetele kayıtlarına uygulanır. Geçmiş tarihli onaylı çeteleyi de hakedişe dahil etmek için tarihi geriye çekin.
                </span>
              </label>
              <label className="block">
                <span className="text-zinc-400 text-xs font-medium mb-1 block">Geçerlilik Bitişi (opsiyonel)</span>
                <input type="date" value={form.valid_to} onChange={e => setForm(f => ({ ...f, valid_to: e.target.value }))} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-[16px] text-white" />
              </label>
              <button onClick={createPrice} className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950">Fiyatı kaydet</button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
