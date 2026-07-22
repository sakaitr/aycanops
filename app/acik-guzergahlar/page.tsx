"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ComboboxSearch from "@/components/ComboboxSearch";

type OpenRoute = {
  id: string;
  company_id: string;
  company_name?: string | null;
  route_id?: string | null;
  route_name?: string | null;
  vehicle_id?: string | null;
  vehicle_plate?: string | null;
  vehicle_assignment_status?: "fixed" | "temporary" | "searching" | string;
  name: string;
  price?: number | string | null;
  plate_note?: string | null;
  notes?: string | null;
  status: string;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = { fixed: "Sabit", temporary: "Geçici", searching: "Araç aranıyor" };
const STATUS_CLASSES: Record<string, string> = {
  fixed: "bg-emerald-950 text-emerald-300",
  temporary: "bg-amber-950 text-amber-300",
  searching: "bg-red-950 text-red-300",
};

export default function AcikGuzergahlarPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<OpenRoute[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selected, setSelected] = useState<OpenRoute | null>(null);
  const [filter, setFilter] = useState({ status: "open", company_id: "", vehicle_status: "" });
  const [form, setForm] = useState({ vehicle_id: "", vehicle_assignment_status: "fixed", plate_note: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => d.ok ? setUser(d.data) : router.replace("/login"));
    fetch("/api/companies").then(r => r.json()).then(d => d.ok && setCompanies(d.data));
    fetch("/api/vehicles?limit=9999").then(r => r.json()).then(d => d.ok && setVehicles(d.data.filter((v: any) => v.status_code === "active")));
    load();
  }, []);

  useEffect(() => {
    if (!selected?.company_id) { setRoutes([]); return; }
    fetch(`/api/routes?company_id=${selected.company_id}`).then(r => r.json()).then(d => d.ok && setRoutes(d.data));
  }, [selected?.company_id]);

  async function load(status = filter.status) {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    const res = await fetch(`/api/open-routes?${qs}`);
    const json = await res.json();
    if (json.ok) setRows(json.data);
  }

  function open(row: OpenRoute) {
    setSelected(row);
    setForm({
      vehicle_id: row.vehicle_id || "",
      vehicle_assignment_status: row.vehicle_assignment_status === "fixed" ? "fixed" : row.vehicle_assignment_status || "searching",
      plate_note: row.plate_note || "",
      notes: row.notes || "",
    });
  }

  async function save(action: "assign" | "temporary" | "searching" | "close") {
    if (!selected) return;
    setSaving(true);
    try {
      const vehicleStatus = action === "assign" || action === "close" ? "fixed" : action;
      const status = action === "assign" || action === "close" ? "closed" : "open";
      if (action === "assign" && !form.vehicle_id) return alert("Sabit kapatmak için araç seçin");
      const res = await fetch(`/api/open-routes/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: form.vehicle_id || null,
          vehicle_assignment_status: vehicleStatus,
          plate_note: form.plate_note || null,
          notes: form.notes || null,
          status,
        }),
      });
      const json = await res.json();
      if (!json.ok) return alert(json.error || "İşlem başarısız");
      setSelected(null);
      await load();
    } finally { setSaving(false); }
  }

  const visibleRows = useMemo(() => rows.filter(row => {
    if (filter.company_id && row.company_id !== filter.company_id) return false;
    if (filter.vehicle_status && row.vehicle_assignment_status !== filter.vehicle_status) return false;
    return true;
  }), [rows, filter.company_id, filter.vehicle_status]);

  const counts = useMemo(() => ({
    open: rows.length,
    temporary: rows.filter(r => r.vehicle_assignment_status === "temporary").length,
    searching: rows.filter(r => (r.vehicle_assignment_status || "searching") === "searching").length,
  }), [rows]);

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Açık Güzergahlar</h1>
            <p className="mt-1 text-sm text-zinc-500">Geçici araç ve araç aranıyor ihtiyaçlarını operasyon ekranından kapatın.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"><div className="text-lg font-bold text-white">{counts.open}</div><div className="text-zinc-500">Açık</div></div>
            <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 px-4 py-3"><div className="text-lg font-bold text-amber-300">{counts.temporary}</div><div className="text-amber-500">Geçici</div></div>
            <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3"><div className="text-lg font-bold text-red-300">{counts.searching}</div><div className="text-red-500">Acil</div></div>
          </div>
        </div>

        <section className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:grid-cols-3">
          <select value={filter.status} onChange={e => { setFilter(f => ({ ...f, status: e.target.value })); load(e.target.value); }} className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none">
            <option value="open">Açık kayıtlar</option>
            <option value="closed">Kapalı kayıtlar</option>
            <option value="">Tümü</option>
          </select>
          <ComboboxSearch options={companies.map(c => ({ value: c.id, label: c.name }))} value={filter.company_id} onChange={v => setFilter(f => ({ ...f, company_id: v }))} emptyLabel="Tüm firmalar" placeholder="Firma ara" />
          <select value={filter.vehicle_status} onChange={e => setFilter(f => ({ ...f, vehicle_status: e.target.value }))} className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none">
            <option value="">Tüm araç durumları</option>
            <option value="temporary">Geçici</option>
            <option value="searching">Araç aranıyor</option>
            <option value="fixed">Sabit</option>
          </select>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">
          <div className="space-y-3">
            {visibleRows.map(row => {
              const vehicleStatus = row.vehicle_assignment_status || "searching";
              return (
                <article key={row.id} onClick={() => open(row)} className={`cursor-pointer rounded-2xl border p-4 transition-colors hover:bg-zinc-900 ${selected?.id === row.id ? "border-white bg-zinc-900" : "border-zinc-800 bg-zinc-900/70"}`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${STATUS_CLASSES[vehicleStatus] || "bg-zinc-800 text-zinc-300"}`}>{STATUS_LABELS[vehicleStatus] || vehicleStatus}</span>
                        {vehicleStatus === "searching" && <span className="rounded-lg bg-red-600 px-2 py-1 text-xs font-bold text-white">Acil</span>}
                        <span className="text-xs text-zinc-500">{new Date(row.created_at).toLocaleString("tr-TR")}</span>
                      </div>
                      <h2 className="truncate text-base font-bold text-white">{row.route_name || row.name}</h2>
                      <p className="mt-1 text-sm text-zinc-500">{row.company_name || "Firma yok"}</p>
                      {row.notes && <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{row.notes}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {(row.vehicle_plate || row.plate_note) && <span className="rounded-lg bg-zinc-800 px-3 py-2 font-mono text-xs text-zinc-200">{row.vehicle_plate || row.plate_note}</span>}
                      {row.price != null && <span className="rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-200">{Number(row.price).toLocaleString("tr-TR")} TRY</span>}
                    </div>
                  </div>
                </article>
              );
            })}
            {visibleRows.length === 0 && <div className="rounded-2xl border border-zinc-800 bg-zinc-900 py-14 text-center text-sm text-zinc-500">Kayıt bulunamadı</div>}
          </div>

          <aside className="h-fit rounded-2xl border border-zinc-800 bg-zinc-900 p-4 lg:sticky lg:top-20">
            {!selected ? (
              <div className="py-10 text-center text-sm text-zinc-500">İşlem yapmak için soldan kayıt seçin.</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="font-bold text-white">{selected.route_name || selected.name}</h2>
                  <p className="text-xs text-zinc-500">{selected.company_name}</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Araç</label>
                  <ComboboxSearch options={vehicles.map(v => ({ value: v.id, label: `${v.plate}${v.driver_name ? ` · ${v.driver_name}` : ""}` }))} value={form.vehicle_id} onChange={v => setForm(f => ({ ...f, vehicle_id: v }))} emptyLabel="Araç seç" placeholder="Plaka ara" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Araç durumu</label>
                  <select value={form.vehicle_assignment_status} onChange={e => setForm(f => ({ ...f, vehicle_assignment_status: e.target.value }))} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white outline-none">
                    <option value="fixed">Sabit</option>
                    <option value="temporary">Geçici</option>
                    <option value="searching">Araç aranıyor</option>
                  </select>
                </div>
                <input value={form.plate_note} onChange={e => setForm(f => ({ ...f, plate_note: e.target.value }))} placeholder="Plaka notu" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-[16px] text-white outline-none" />
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Operasyon notu" className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-[16px] text-white outline-none" />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button disabled={saving} onClick={() => save("assign")} className="rounded-lg bg-emerald-950 px-3 py-2.5 text-sm font-semibold text-emerald-300 disabled:opacity-50">Araç ata ve sabitle</button>
                  <button disabled={saving} onClick={() => save("temporary")} className="rounded-lg bg-amber-950 px-3 py-2.5 text-sm font-semibold text-amber-300 disabled:opacity-50">Geçici yap</button>
                  <button disabled={saving} onClick={() => save("searching")} className="rounded-lg bg-red-950 px-3 py-2.5 text-sm font-semibold text-red-300 disabled:opacity-50">Araç aranıyor</button>
                  <button disabled={saving} onClick={() => save("close")} className="rounded-lg bg-zinc-800 px-3 py-2.5 text-sm font-semibold text-zinc-200 disabled:opacity-50">Kapat</button>
                </div>
              </div>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}
