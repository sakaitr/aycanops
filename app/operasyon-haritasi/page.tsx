"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import OperationMap from "@/components/OperationMap";

export default function OperasyonHaritasiPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [data, setData] = useState<any>({ summary: {}, routes: [] });
  const [loading, setLoading] = useState(true);
  const [maxWalkMeters, setMaxWalkMeters] = useState(500);
  const [suggesting, setSuggesting] = useState(false);
  const [applyingSuggestions, setApplyingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<any | null>(null);
  const [selectedPassengerIds, setSelectedPassengerIds] = useState<string[]>([]);
  const [suggestionPassengerIds, setSuggestionPassengerIds] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => router.replace("/login"));
    fetch("/api/companies?limit=9999").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); }).catch(() => {});
  }, [router]);

  useEffect(() => {
    if (!companyId) {
      setData({ summary: {}, routes: [], passengers: [], unassigned_passengers: [] });
      setSuggestions(null);
      setSelectedPassengerIds([]);
      setSuggestionPassengerIds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    params.set("company_id", companyId);
    if (selectedRouteId) params.set("route_id", selectedRouteId);
    fetch(`/api/map/live?${params}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d.data); })
      .finally(() => setLoading(false));
  }, [companyId, selectedRouteId]);

  const routes = data.routes || [];
  const selectedRoute = useMemo(() => routes.find((r: any) => r.id === selectedRouteId), [routes, selectedRouteId]);
  const selectedPassengerCount = selectedPassengerIds.length;

  function togglePassengerSelection(id: string) {
    setSelectedPassengerIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    setSuggestions(null);
    setSuggestionPassengerIds([]);
  }

  function selectPassengers(ids: string[]) {
    if (ids.length === 0) {
      alert("Seçilen alan içinde personel pini bulunamadı.");
      return;
    }
    setSelectedPassengerIds(prev => Array.from(new Set([...prev, ...ids])));
    setSuggestions(null);
    setSuggestionPassengerIds([]);
  }

  async function suggestStops() {
    if (!companyId) return;
    if (selectedPassengerIds.length === 0) return alert("Durak önerisi için haritadaki personel pinlerinden en az birini seçin.");
    setSuggesting(true);
    try {
      const d = await fetch("/api/route-plans/suggest-stops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, max_walk_meters: maxWalkMeters, passenger_ids: selectedPassengerIds }),
      }).then(r => r.json());
      if (d.ok) {
        setSuggestions(d.data);
        setSuggestionPassengerIds([...selectedPassengerIds]);
      }
      else alert(d.error || "Durak önerisi üretilemedi");
    } finally {
      setSuggesting(false);
    }
  }

  async function applySuggestions() {
    if (!companyId || !suggestions) return;
    if (suggestionPassengerIds.length === 0) return alert("Atama yapmak için önce haritadan personel pinleri seçip durak önerisi üretin.");
    if (!confirm(selectedRouteId ? "Önerilen duraklar seçili güzergaha yazılsın ve personeller bu güzergaha atansın mı?" : "Önerilen duraklardan yeni bir güzergah oluşturulsun ve personeller atansın mı?")) return;
    setApplyingSuggestions(true);
    try {
      const d = await fetch("/api/route-plans/suggest-stops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, max_walk_meters: maxWalkMeters, apply: true, route_id: selectedRouteId || undefined, passenger_ids: suggestionPassengerIds }),
      }).then(r => r.json());
      if (!d.ok) return alert(d.error || "Durak önerisi uygulanamadı");
      setSuggestions(null);
      setSuggestionPassengerIds([]);
      setSelectedPassengerIds([]);
      setSelectedRouteId(d.data?.applied?.route_id || selectedRouteId);
      const params = new URLSearchParams({ company_id: companyId });
      if (d.data?.applied?.route_id || selectedRouteId) params.set("route_id", d.data?.applied?.route_id || selectedRouteId);
      const live = await fetch(`/api/map/live?${params}`).then(r => r.json());
      if (live.ok) setData(live.data);
      alert(`${d.data?.applied?.assigned_passenger_count ?? 0} personel güzergaha atandı.`);
    } finally {
      setApplyingSuggestions(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">MVP-3</p>
            <h1 className="mt-1 text-2xl font-bold text-white">Operasyon Haritası</h1>
            <p className="mt-1 text-sm text-zinc-500">Araç, güzergah, durak ve personel konumlarını tek operasyon ekranında görün.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <select value={companyId} onChange={e => { setCompanyId(e.target.value); setSelectedRouteId(""); setSelectedPassengerIds([]); setSuggestionPassengerIds([]); setSuggestions(null); }} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-600">
              <option value="">Firma seçin</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={selectedRouteId} onChange={e => setSelectedRouteId(e.target.value)} disabled={!companyId} className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-600 disabled:cursor-not-allowed disabled:opacity-50">
              <option value="">{companyId ? "Tüm güzergahlar" : "Önce firma seçin"}</option>
              {routes.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>

        {companyId && (
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-orange-900/60 bg-orange-950/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-orange-200">Otomatik durak önerisi v1</p>
              <p className="text-xs text-orange-200/70">Pinlere tek tek tıklayabilir veya haritadaki “Çokgen seçim” ile alan çizip toplu seçebilirsiniz. Sadece seçili personeller güzergaha atanır.</p>
              <p className="mt-1 text-xs font-semibold text-yellow-200">Seçili pin: {selectedPassengerCount}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={maxWalkMeters} onChange={e => setMaxWalkMeters(Number(e.target.value))} className="rounded-xl border border-orange-900 bg-zinc-950 px-3 py-2 text-sm text-white outline-none">
                <option value={300}>300 m</option>
                <option value={500}>500 m</option>
                <option value={750}>750 m</option>
                <option value={1000}>1000 m</option>
              </select>
              <button onClick={suggestStops} disabled={suggesting || selectedPassengerCount === 0} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50">
                {suggesting ? "Hesaplanıyor..." : "Seçili pinlerden durak öner"}
              </button>
              <button onClick={() => { setSelectedPassengerIds([]); setSuggestionPassengerIds([]); setSuggestions(null); }} disabled={selectedPassengerCount === 0} className="rounded-xl border border-yellow-900 px-3 py-2 text-xs font-semibold text-yellow-200 hover:bg-yellow-950/30 disabled:cursor-not-allowed disabled:opacity-40">Seçimi temizle</button>
              {suggestions && <button onClick={() => { setSuggestions(null); setSuggestionPassengerIds([]); }} className="rounded-xl border border-orange-900 px-3 py-2 text-xs font-semibold text-orange-200 hover:bg-orange-950">Öneriyi temizle</button>}
            </div>
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Güzergah", data.summary?.routeCount ?? 0],
            ["Durak", data.summary?.stopCount ?? 0],
            ["Personel pini", data.summary?.passengerCount ?? 0],
            ["Canlı GPS", data.summary?.liveVehicleCount ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-white">{String(value)}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="relative">
            {!companyId && <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-zinc-950/70 p-6 text-center text-sm text-zinc-300 backdrop-blur-sm">Harita karmaşasını önlemek için önce firma seçin. Güzergahlar ve personel pinleri sadece seçili firmaya göre yüklenecek.</div>}
            {loading && <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-zinc-950/60 text-sm text-zinc-300 backdrop-blur-sm">Harita yükleniyor...</div>}
            <OperationMap routes={routes} selectedRouteId={selectedRouteId} onRouteSelect={setSelectedRouteId} suggestedStops={suggestions?.stops ?? []} unassignedPassengers={data.unassigned_passengers ?? []} selectedPassengerIds={selectedPassengerIds} onPassengerToggle={togglePassengerSelection} onPassengerSelectMany={selectPassengers} />
          </div>
          <aside className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <h2 className="font-semibold text-white">Seçili güzergah</h2>
            {selectedRoute ? (
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <p className="font-medium text-white">{selectedRoute.name}</p>
                  <p className="text-xs text-zinc-500">{selectedRoute.company_name || "Firma yok"}</p>
                </div>
                <div className="rounded-xl bg-zinc-950 p-3 text-xs text-zinc-400">
                  <p>Araç: <span className="text-zinc-200">{selectedRoute.vehicle_plate || "—"}</span></p>
                  <p>Sürücü: <span className="text-zinc-200">{selectedRoute.driver_name || "—"}</span></p>
                  <p>GPS: <span className="text-zinc-200">{selectedRoute.vehicle_location ? "Canlı veri var" : "—"}</span></p>
                  {selectedRoute.vehicle_location && <p>Hız: <span className="text-zinc-200">{selectedRoute.vehicle_location.speed == null ? "—" : `${Math.round(Number(selectedRoute.vehicle_location.speed))} km/s`}</span></p>}
                  <p>Durak: <span className="text-zinc-200">{selectedRoute.stops?.length || 0}</span></p>
                  <p>Personel pini: <span className="text-zinc-200">{selectedRoute.passengers?.length || 0}</span></p>
                </div>
                <button onClick={() => setSelectedRouteId("")} className="w-full rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800">Tümünü göster</button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">{companyId ? "Haritadaki bir rota veya durak seçilince detay burada açılır." : "Önce firma seçin; ardından sadece o firmaya ait güzergahlar listelenir."}</p>
            )}
            {suggestions && (
              <div className="border-t border-zinc-800 pt-4">
                <h3 className="text-sm font-semibold text-orange-200">Önerilen duraklar</h3>
                <p className="mt-1 text-xs text-zinc-500">{suggestions.passenger_count} seçili personel → {suggestions.stop_count} durak · maksimum {suggestions.max_walk_meters} m</p>
                <button onClick={applySuggestions} disabled={applyingSuggestions || suggestions.stop_count === 0 || suggestionPassengerIds.length === 0} className="mt-3 w-full rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">
                  {applyingSuggestions ? "Atanıyor..." : selectedRouteId ? "Seçili güzergaha ata" : "Yeni güzergah oluştur ve ata"}
                </button>
                <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1">
                  {suggestions.stops.map((stop: any) => (
                    <div key={stop.id} className="rounded-xl bg-zinc-950 p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-white">{stop.name}</p>
                        <span className="rounded-full bg-orange-500 px-2 py-0.5 font-bold text-zinc-950">{stop.passenger_count}</span>
                      </div>
                      <p className="mt-1 text-zinc-500">Ort. {stop.avg_walking_distance_m} m · Maks. {stop.max_walking_distance_m} m</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
