"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

export default function AdminAraclarPage() {
  const [user, setUser] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const router = useRouter();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok || d.data?.role !== "admin") { router.replace("/"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/vehicles?limit=9999");
      const d = await r.json();
      if (d.ok) setVehicles(d.data);
    } finally { setLoading(false); }
  }

  async function deleteVehicle(id: string, plate: string) {
    if (!confirm(`"${plate}" plakalı aracı silmek istediğinize emin misiniz?`)) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/vehicles/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) { setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; }); load(); }
      else alert(d.error);
    } finally { setDeletingId(null); }
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`${ids.length} aracı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return;
    setBulkDeleting(true);
    try {
      let failed = 0;
      for (const id of ids) {
        const r = await fetch(`/api/vehicles/${id}`, { method: "DELETE" });
        const d = await r.json();
        if (!d.ok) failed++;
      }
      setSelectedIds(new Set());
      await load();
      if (failed > 0) alert(`${failed} araç silinemedi.`);
    } finally { setBulkDeleting(false); }
  }

  const STATUS_MAP: Record<string, { label: string; cls: string }> = {
    active:       { label: "Aktif",      cls: "text-emerald-400" },
    maintenance:  { label: "Bakımda",    cls: "text-amber-400" },
    inactive:     { label: "Pasif",      cls: "text-zinc-600" },
  };

  const filtered = vehicles.filter(v => {
    if (!search) return true;
    const q = search.toLowerCase();
    return v.plate.toLowerCase().includes(q) ||
      (v.brand || "").toLowerCase().includes(q) ||
      (v.model || "").toLowerCase().includes(q) ||
      (v.driver_name || "").toLowerCase().includes(q);
  });

  const filteredIds = filtered.map(v => v.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id));
  const someSelected = filteredIds.some(id => selectedIds.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(prev => { const s = new Set(prev); filteredIds.forEach(id => s.delete(id)); return s; });
    } else {
      setSelectedIds(prev => { const s = new Set(prev); filteredIds.forEach(id => s.add(id)); return s; });
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  }

  if (!user) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><p className="text-zinc-500">Yükleniyor...</p></div>;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a href="/admin" className="text-zinc-500 hover:text-white text-sm transition-colors">Yönetim</a>
              <span className="text-zinc-700">/</span>
              <span className="text-white text-sm">Araçlar</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Araçlar</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{vehicles.length} araç kayıtlı</p>
          </div>
          <a href="/araclar"
            className="bg-zinc-800 text-zinc-300 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors whitespace-nowrap border border-zinc-700">
            Araç Yönetimine Git →
          </a>
        </div>

        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4 mb-5 flex gap-3 items-start">
          <span className="text-amber-400 text-lg mt-0.5">⚠</span>
          <p className="text-sm text-zinc-400">Bu sayfada yalnızca araç <strong className="text-white">silme</strong> işlemi yapılabilir. Yeni araç eklemek veya düzenlemek için <a href="/araclar" className="text-blue-400 hover:text-blue-300 underline">Araçlar sayfasına</a> gidin.</p>
        </div>

        {/* Search + bulk actions */}
        <div className="flex gap-3 mb-5">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Plaka, marka, model veya şöför ara..."
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm pl-8 pr-4 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600" />
          </div>
          {selectedIds.size > 0 && (
            <button
              onClick={bulkDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-2 bg-red-900/30 border border-red-800 text-red-400 hover:bg-red-900/50 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {bulkDeleting ? "Siliniyor..." : `${selectedIds.size} Aracı Sil`}
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Araç bulunamadı</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-red-500 cursor-pointer"
                    />
                  </th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Plaka</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Marka / Model</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Şöför</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Durum</th>
                  <th className="px-4 py-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => {
                  const st = STATUS_MAP[v.status_code] || { label: v.status_code, cls: "text-zinc-500" };
                  const isSelected = selectedIds.has(v.id);
                  return (
                    <tr key={v.id} className={`border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 ${isSelected ? "bg-red-950/20" : ""}`}>
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(v.id)}
                          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-red-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-white font-semibold text-sm">{v.plate}</span>
                        {v.type && <div className="text-xs text-zinc-500 mt-0.5">{v.type} · {v.capacity} kişi</div>}
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell text-zinc-400 text-sm">
                        {[v.brand, v.model, v.year].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell text-zinc-400 text-sm">{v.driver_name || "—"}</td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-medium ${st.cls}`}>● {st.label}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end">
                          <button onClick={() => deleteVehicle(v.id, v.plate)} disabled={deletingId === v.id || bulkDeleting}
                            className="text-xs text-zinc-600 hover:text-red-400 border border-zinc-700 hover:border-red-800 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40">
                            {deletingId === v.id ? "..." : "Sil"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
