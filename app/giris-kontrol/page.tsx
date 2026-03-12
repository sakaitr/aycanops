"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Nav from "@/components/Nav";

function todayStr() { return new Date().toISOString().split("T")[0]; }

function formatTime(isoStr: string | null) {
  if (!isoStr) return "—";
  try { return new Date(isoStr).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

// ─── Tab 1: Araç Gelişleri ───────────────────────────────────────────────

function normalizePlate(s: string) {
  return s.replace(/[\s\-]/g, "").toUpperCase();
}

function suggestFullPlate(input: string): string {
  const clean = input.replace(/[\s\-]/g, "").toUpperCase();
  // 3 harf + 3 rakam → 34 LLL 123
  if (/^[A-Z]{3}\d{3}$/.test(clean)) {
    return `34 ${clean.slice(0, 3)} ${clean.slice(3)}`;
  }
  // 4 rakam → 41 P 1234
  if (/^\d{4}$/.test(clean)) {
    return `41 P ${clean}`;
  }
  return clean;
}

function AracGelis({ user }: { user: any }) {
  const [date, setDate] = useState(todayStr());
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [bulkMarking, setBulkMarking] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Sort mode
  const [isSorting, setIsSorting] = useState(false);
  const [sortList, setSortList] = useState<any[]>([]);
  const [savingSortOrder, setSavingSortOrder] = useState(false);

  // Plaka hızlı giriş
  const [plateInput, setPlateInput] = useState("");
  const [plateMsg, setPlateMsg] = useState<{ type: "success" | "error" | "warn"; text: string } | null>(null);
  const [multiMatches, setMultiMatches] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [suggestedPlate, setSuggestedPlate] = useState("");
  const [newPlate, setNewPlate] = useState("");
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const plateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoadingCompanies(true);
    fetch("/api/companies")
      .then(r => r.json())
      .then(d => { if (d.ok) setCompanies(d.data); })
      .finally(() => setLoadingCompanies(false));
  }, []);

  const loadVehicles = useCallback(async () => {
    if (!selectedCompany) { setVehicles([]); return; }
    setLoading(true);
    setFetchError(null);
    try {
      const r = await fetch("/api/arrivals?company_id=" + selectedCompany + "&date=" + date);
      const d = await r.json();
      if (d.ok) setVehicles(d.data);
      else setFetchError(d.error || "Yükleme hatası");
    } catch {
      setFetchError("Sunucuya bağlanılamadı. Yenile butonuna basın.");
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, date]);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  // Reset plaka input when company/date changes
  useEffect(() => {
    setPlateInput("");
    setPlateMsg(null);
    setMultiMatches([]);
  }, [selectedCompany, date]);

  const canRecordLocation = user?.role === "admin" || user?.role === "yonetici" || user?.role === "yetkili";
  const canUndo = user?.role === "admin" || user?.role === "yonetici";
  const canAddVehicle = !!user;

  async function getCoords(): Promise<{ latitude: number; longitude: number } | null> {
    if (!canRecordLocation) return null;
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => { setLocError("Konum alınamadı, kayıt yine de yapılacak"); resolve(null); },
        { timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  async function markAllArrived() {
    const pending = vehicles.filter(v => !v.arrived_at);
    if (pending.length === 0) return;
    if (!confirm(`${pending.length} araç için giriş kaydı yapılsın mı?`)) return;
    setBulkMarking(true);
    setLocError(null);
    let coords: { latitude: number; longitude: number } | null = null;
    if (canRecordLocation) coords = await getCoords();
    for (const veh of pending) {
      const body: any = { vehicle_id: veh.id, company_id: selectedCompany, date };
      if (coords) { body.latitude = coords.latitude; body.longitude = coords.longitude; }
      try {
        const r = await fetch("/api/arrivals", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        const d = await r.json();
        if (d.ok) {
          setVehicles(vs => vs.map(v => v.id === veh.id
            ? { ...v, arrival_id: d.data.id, arrived_at: d.data.arrived_at, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null }
            : v
          ));
        }
      } catch { /* continue for other vehicles */ }
    }
    setBulkMarking(false);
  }

  async function markArrived(vehicleId: string): Promise<boolean> {
    if (marking) return false;
    setLocError(null);
    setMarking(vehicleId);
    try {
      let coords: { latitude: number; longitude: number } | null = null;
      if (canRecordLocation) coords = await getCoords();
      const body: any = { vehicle_id: vehicleId, company_id: selectedCompany, date };
      if (coords) { body.latitude = coords.latitude; body.longitude = coords.longitude; }
      const r = await fetch("/api/arrivals", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.ok) {
        setVehicles(vs => vs.map(v => v.id === vehicleId
          ? { ...v, arrival_id: d.data.id, arrived_at: d.data.arrived_at, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null }
          : v
        ));
        return true;
      } else {
        alert(d.error);
        return false;
      }
    } finally { setMarking(null); }
  }

  async function handlePlateSubmit() {
    if (!plateInput.trim() || !selectedCompany) return;
    setPlateMsg(null);
    setMultiMatches([]);

    const q = normalizePlate(plateInput);
    const found = vehicles.filter(v => normalizePlate(v.plate).endsWith(q));

    if (found.length === 1) {
      const veh = found[0];
      if (veh.arrived_at) {
        setPlateMsg({ type: "warn", text: `${veh.plate} zaten geldi (${formatTime(veh.arrived_at)})` });
        return;
      }
      const ok = await markArrived(veh.id);
      if (ok) {
        setPlateMsg({ type: "success", text: `✓ ${veh.plate} geldi olarak işaretlendi` });
        setPlateInput("");
        setTimeout(() => setPlateMsg(null), 4000);
      }
    } else if (found.length > 1) {
      setMultiMatches(found);
      setPlateMsg({ type: "warn", text: `${found.length} araç eşleşti, birini seçin` });
    } else {
      // Eşleşme yok — plaka tamamla ve ekleme modal'ı aç
      const suggested = suggestFullPlate(plateInput);
      setSuggestedPlate(suggested);
      setNewPlate(suggested);
      setAddError(null);
      setShowAddModal(true);
    }
  }

  async function handleAddAndMark() {
    if (!newPlate.trim()) { setAddError("Plaka zorunlu"); return; }
    setAddingVehicle(true);
    setAddError(null);
    try {
      // 1. Araca ekle
      const r1 = await fetch(`/api/companies/${selectedCompany}/vehicles`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: newPlate.trim().toUpperCase() }),
      });
      const d1 = await r1.json();
      if (!d1.ok) { setAddError(d1.error || "Araç eklenemedi"); return; }

      const vehicleId = d1.data.id;

      // 2. Varış işaretle
      let coords: { latitude: number; longitude: number } | null = null;
      if (canRecordLocation) coords = await getCoords();
      const body: any = { vehicle_id: vehicleId, company_id: selectedCompany, date };
      if (coords) { body.latitude = coords.latitude; body.longitude = coords.longitude; }
      await fetch("/api/arrivals", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });

      // 3. Listeyi yenile
      await loadVehicles();
      setShowAddModal(false);
      const plate = newPlate.trim().toUpperCase();
      setPlateInput("");
      setPlateMsg({ type: "success", text: `✓ ${plate} sisteme eklendi ve geldi olarak işaretlendi` });
      setTimeout(() => setPlateMsg(null), 5000);
    } finally {
      setAddingVehicle(false);
    }
  }

  async function undoArrival(vehicle: any) {
    if (!vehicle.arrival_id || removing) return;
    if (!confirm(vehicle.plate + " için varış kaydı silinsin mi?")) return;
    setRemoving(vehicle.arrival_id);
    try {
      const r = await fetch("/api/arrivals?id=" + vehicle.arrival_id, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) {
        setVehicles(vs => vs.map(v => v.id === vehicle.id
          ? { ...v, arrival_id: null, arrived_at: null, latitude: null, longitude: null, recorded_by_name: null }
          : v
        ));
      } else { alert(d.error || "Silme başarısız"); }
    } finally { setRemoving(null); }
  }

  const arrivedCount = vehicles.filter(v => v.arrived_at).length;
  const multiMatchIds = new Set(multiMatches.map((v: any) => v.id));

  function enterSortMode() {
    setSortList([...vehicles]);
    setIsSorting(true);
  }

  function moveSortItem(index: number, direction: -1 | 1) {
    setSortList(prev => {
      const arr = [...prev];
      const target = index + direction;
      if (target < 0 || target >= arr.length) return arr;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  }

  async function saveSortOrder() {
    setSavingSortOrder(true);
    try {
      const payload = sortList.map((v, i) => ({ id: v.id, sort_order: i }));
      const r = await fetch(`/api/companies/${selectedCompany}/vehicles`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.ok) {
        setIsSorting(false);
        await loadVehicles();
      } else {
        alert(d.error || "Sıralama kaydedilemedi");
      }
    } finally {
      setSavingSortOrder(false);
    }
  }

  return (
    <div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Firma</label>
            {loadingCompanies ? (
              <div className="bg-zinc-800 rounded-lg px-3 py-2.5 text-zinc-600 text-sm">Yükleniyor...</div>
            ) : (
              <select value={selectedCompany} onChange={e => { setSelectedCompany(e.target.value); }}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                <option value="">— Firma seçin —</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
          <div className="sm:w-44">
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Tarih</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
          </div>
        </div>
        {selectedCompany && (
          <div className="mt-3">
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Plaka ile Hızlı Giriş</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  ref={plateInputRef}
                  type="text"
                  value={plateInput}
                  onChange={e => { setPlateInput(e.target.value); setPlateMsg(null); setMultiMatches([]); }}
                  onKeyDown={e => { if (e.key === "Enter") handlePlateSubmit(); }}
                  placeholder="Plaka sonu girin... (örn: llu344 veya 2345)"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600 font-mono uppercase"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {plateInput && (
                  <button
                    onClick={() => { setPlateInput(""); setPlateMsg(null); setMultiMatches([]); plateInputRef.current?.focus(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-lg leading-none"
                  >×</button>
                )}
              </div>
              <button
                onClick={handlePlateSubmit}
                disabled={!plateInput.trim() || !!marking}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap"
              >
                {marking ? "..." : "Geldi"}
              </button>
            </div>

            {/* Durum mesajı */}
            {plateMsg && (
              <div className={`mt-2 px-3 py-2 rounded-lg text-sm flex items-center justify-between ${
                plateMsg.type === "success" ? "bg-emerald-950 border border-emerald-800 text-emerald-300" :
                plateMsg.type === "error" ? "bg-red-950 border border-red-800 text-red-300" :
                "bg-amber-950 border border-amber-800 text-amber-300"
              }`}>
                <span>{plateMsg.text}</span>
                <button onClick={() => { setPlateMsg(null); setMultiMatches([]); }} className="ml-3 opacity-60 hover:opacity-100">×</button>
              </div>
            )}

            {/* Birden fazla eşleşme seçim listesi */}
            {multiMatches.length > 1 && (
              <div className="mt-2 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
                {multiMatches.map(v => (
                  <button key={v.id} onClick={async () => {
                    setMultiMatches([]);
                    setPlateMsg(null);
                    if (v.arrived_at) {
                      setPlateMsg({ type: "warn", text: `${v.plate} zaten geldi (${formatTime(v.arrived_at)})` });
                      return;
                    }
                    const ok = await markArrived(v.id);
                    if (ok) {
                      setPlateMsg({ type: "success", text: `✓ ${v.plate} geldi olarak işaretlendi` });
                      setPlateInput("");
                      setTimeout(() => setPlateMsg(null), 4000);
                    }
                  }}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-700 transition-colors border-b border-zinc-700 last:border-0 text-left"
                  >
                    <span className="font-mono text-white text-sm">{v.plate}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      v.arrived_at ? "text-emerald-300 bg-emerald-950 border border-emerald-800" : "text-zinc-400 bg-zinc-900 border border-zinc-700"
                    }`}>
                      {v.arrived_at ? `Geldi ${formatTime(v.arrived_at)}` : "Seç"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {locError && (
        <div className="mb-4 px-4 py-2.5 bg-amber-950 border border-amber-800 rounded-xl text-amber-300 text-sm flex items-center justify-between">
          <span>{locError}</span>
          <button onClick={() => setLocError(null)} className="ml-4 text-amber-500 font-semibold">×</button>
        </div>
      )}

      {fetchError && (
        <div className="mb-4 px-4 py-2.5 bg-red-950 border border-red-800 rounded-xl text-red-300 text-sm flex items-center justify-between">
          <span>{fetchError}</span>
          <button onClick={loadVehicles} className="ml-4 text-red-400 underline text-xs">Yenile</button>
        </div>
      )}

      {!selectedCompany ? (
        <div className="py-20 text-center">
          <p className="text-zinc-500 text-base mb-1">Firma seçin</p>
          <p className="text-zinc-600 text-sm">Firmalar listesinde görünmüyorsa yöneticiden eklemesini isteyin</p>
        </div>
      ) : (
        <>
          {vehicles.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="text-sm">
                <span className="text-emerald-400 font-semibold">{arrivedCount}</span>
                <span className="text-zinc-500"> / {vehicles.length} araç geldi</span>
                {arrivedCount === vehicles.length && vehicles.length > 0 && (
                  <span className="ml-2 text-xs bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full">Tümü geldi</span>
                )}
              </div>
              <div className="flex items-center gap-3">
              {arrivedCount < vehicles.length && !isSorting && (
                  <button
                    onClick={markAllArrived}
                    disabled={bulkMarking || !!marking}
                    className="text-xs bg-emerald-900 border border-emerald-800 text-emerald-300 hover:bg-emerald-800 disabled:opacity-50 px-3 py-1 rounded-lg transition-colors font-medium"
                  >
                    {bulkMarking ? "Kaydediliyor..." : `Tümünü Geldi İşareti (${vehicles.length - arrivedCount})`}
                  </button>
                )}
                {isSorting ? (
                  <>
                    <button onClick={saveSortOrder} disabled={savingSortOrder}
                      className="text-xs bg-emerald-900 border border-emerald-800 text-emerald-300 hover:bg-emerald-800 disabled:opacity-50 px-3 py-1 rounded-lg transition-colors font-medium">
                      {savingSortOrder ? "Kaydediliyor..." : "Sıralaşmayı Kaydet"}
                    </button>
                    <button onClick={() => setIsSorting(false)}
                      className="text-xs text-zinc-500 hover:text-white transition-colors">İptal</button>
                  </>
                ) : (
                  <>
                    <button onClick={enterSortMode} className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1 rounded-lg transition-colors">↕ Sırala</button>
                    <button onClick={loadVehicles} className="text-xs text-zinc-600 hover:text-white transition-colors">Yenile</button>
                  </>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
          ) : vehicles.length === 0 ? (
            <div className="py-16 text-center text-zinc-600 text-sm">
              <p className="text-zinc-500 mb-1">Bu firmaya ait araç yok</p>
              <p>Firmalar sayfasından araç eklenebilir</p>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden overflow-x-auto">
              {isSorting ? (
                <table className="w-full min-w-[340px]">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Sıra</th>
                      <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Plaka</th>
                      <th className="px-4 py-3 w-24 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Taşı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortList.map((v, idx) => (
                      <tr key={v.id} className="border-b border-zinc-800/50 last:border-0">
                        <td className="px-4 py-3 text-zinc-500 text-sm tabular-nums w-12">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <span className="text-white font-mono font-semibold">{v.plate}</span>
                          {v.driver_name && <div className="text-zinc-500 text-xs mt-0.5">{v.driver_name}</div>}
                          {v.route_name && <div className="text-emerald-600 text-xs">{v.route_name}</div>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => moveSortItem(idx, -1)} disabled={idx === 0}
                            className="text-zinc-500 hover:text-white disabled:opacity-20 px-1.5 py-1 text-base transition-colors" title="Yukarı">▲</button>
                          <button onClick={() => moveSortItem(idx, 1)} disabled={idx === sortList.length - 1}
                            className="text-zinc-500 hover:text-white disabled:opacity-20 px-1.5 py-1 text-base transition-colors" title="Aşağı">▼</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Plaka</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Durum</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Giriş Saati</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map(v => (
                    <tr key={v.id} className={
                      "border-b border-zinc-800/50 last:border-0 transition-colors " +
                      (v.arrived_at ? "bg-emerald-950/10 " : "") +
                      (multiMatchIds.has(v.id) ? "ring-1 ring-inset ring-amber-500/40 bg-amber-950/10" : "")
                    }>
                      <td className="px-4 py-3.5">
                        <span className="text-white font-mono font-semibold">{v.plate}</span>
                        {v.notes && <span className="ml-2 text-zinc-600 text-xs">{v.notes}</span>}
                        {v.driver_name && <div className="text-zinc-500 text-xs mt-0.5">Şöför: {v.driver_name}</div>}
                        {v.route_name && <div className="text-emerald-600 text-xs mt-0.5">{v.route_name}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        {v.arrived_at ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 bg-emerald-950 border border-emerald-800 px-2.5 py-1 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Geldi
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 bg-zinc-800 border border-zinc-700 px-2.5 py-1 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>Bekleniyor
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-300 text-sm tabular-nums">{formatTime(v.arrived_at)}</span>
                          {v.arrived_at && v.latitude && (
                            <span className="text-xs text-zinc-600 cursor-pointer hover:text-zinc-400"
                              title={Number(v.latitude).toFixed(5) + ", " + Number(v.longitude).toFixed(5)}>📍</span>
                          )}
                        </div>
                        {v.arrived_at && v.recorded_by_name && (
                          <p className="text-zinc-600 text-xs mt-0.5">{v.recorded_by_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {!v.arrived_at ? (
                          <button onClick={() => markArrived(v.id)} disabled={!!marking}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors">
                            {marking === v.id ? "..." : "Geldi"}
                          </button>
                        ) : canUndo ? (
                          <button onClick={() => undoArrival(v)} disabled={removing === v.arrival_id}
                            className="text-zinc-700 hover:text-red-400 text-xs transition-colors disabled:opacity-50"
                            title="Varış kaydını sil">
                            {removing === v.arrival_id ? "..." : "Geri Al"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          )}
        </>
      )}

      {/* Yeni Araç Ekleme Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full sm:max-w-md">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-white">Yeni Araç Ekle</h2>
              <button onClick={() => setShowAddModal(false)} className="text-zinc-600 hover:text-white text-2xl leading-none">×</button>
            </div>
            <p className="text-zinc-500 text-sm mb-4">Bu plaka sistemde bulunamadı. Plakayı doğrulayıp ekleyin.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Tam Plaka *</label>
                <input
                  type="text"
                  value={newPlate}
                  onChange={e => setNewPlate(e.target.value.toUpperCase())}
                  placeholder="Örn: 34 LLU 344"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 font-mono placeholder-zinc-600"
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter") handleAddAndMark(); }}
                />
                {suggestedPlate && newPlate !== suggestedPlate && (
                  <button onClick={() => setNewPlate(suggestedPlate)} className="mt-1 text-xs text-zinc-500 hover:text-zinc-300 underline">
                    Öneri: {suggestedPlate}
                  </button>
                )}
              </div>
              {addError && <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2">{addError}</p>}
              {!canAddVehicle && (
                <p className="text-amber-400 text-sm bg-amber-950 border border-amber-800 rounded-lg px-3 py-2">
                  Araç ekleme yetkiniz yok. Yöneticiden bu plakayı sisteme eklemesini isteyin.
                </p>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddModal(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              {canAddVehicle && (
                <button onClick={handleAddAndMark} disabled={addingVehicle || !newPlate.trim()}
                  className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                  {addingVehicle ? "Ekleniyor..." : "Ekle ve Geldi İşaretle"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Sefer Kontrolleri ────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Bekleniyor", cls: "text-zinc-400 bg-zinc-800 border-zinc-700" },
  on_time:   { label: "Zamanında",  cls: "text-emerald-300 bg-emerald-950 border-emerald-800" },
  delayed:   { label: "Gecikmeli",  cls: "text-amber-300 bg-amber-950 border-amber-800" },
  cancelled: { label: "İptal",      cls: "text-red-300 bg-red-950 border-red-800" },
};

function SeferKontrol({ user }: { user: any }) {
  const [date, setDate] = useState(todayStr());
  const [controls, setControls] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editModal, setEditModal] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
    route_id: "", planned_time: "", actual_time: "",
    passenger_expected: "", passenger_actual: "", status_code: "", notes: "",
  });

  useEffect(() => {
    fetch("/api/routes").then(r => r.json()).then(d => { if (d.ok) setRoutes(d.data.filter((r: any) => r.is_active)); }).catch(() => {});
  }, []);

  const loadControls = useCallback(async () => {
    setLoading(true); setFetchError(null);
    try {
      const r = await fetch("/api/entry-controls?date=" + date);
      const d = await r.json();
      if (d.ok) setControls(d.data); else setFetchError(d.error || "Yükleme hatası");
    } catch { setFetchError("Sunucuya bağlanılamadı."); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { loadControls(); }, [loadControls]);

  const emptyForm = { route_id: "", planned_time: "", actual_time: "", passenger_expected: "", passenger_actual: "", status_code: "", notes: "" };

  function openNew() { setForm(emptyForm); setSaveError(null); setShowModal(true); }

  function openEdit(ctrl: any) {
    setForm({
      route_id: ctrl.route_id, planned_time: ctrl.planned_time || "", actual_time: ctrl.actual_time || "",
      passenger_expected: ctrl.passenger_expected?.toString() || "", passenger_actual: ctrl.passenger_actual?.toString() || "",
      status_code: ctrl.status_code || "", notes: ctrl.notes || "",
    });
    setSaveError(null); setEditModal(ctrl);
  }

  async function saveNew() {
    if (!form.route_id || !form.planned_time) { setSaveError("Güzergah ve planlanan saat zorunlu"); return; }
    setSaving(true); setSaveError(null);
    try {
      const r = await fetch("/api/entry-controls", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          control_date: date, route_id: form.route_id, planned_time: form.planned_time,
          actual_time: form.actual_time || null,
          passenger_expected: form.passenger_expected ? parseInt(form.passenger_expected) : 0,
          passenger_actual: form.passenger_actual ? parseInt(form.passenger_actual) : 0,
          status_code: form.status_code || undefined, notes: form.notes || null,
        }),
      });
      const d = await r.json();
      if (d.ok) { setShowModal(false); loadControls(); } else setSaveError(d.error || "Kayıt başarısız");
    } finally { setSaving(false); }
  }

  async function saveEdit() {
    if (!editModal) return;
    setSaving(true); setSaveError(null);
    try {
      const body: any = {
        actual_time: form.actual_time || null,
        passenger_expected: form.passenger_expected ? parseInt(form.passenger_expected) : 0,
        passenger_actual: form.passenger_actual ? parseInt(form.passenger_actual) : 0,
        notes: form.notes || null,
      };
      if (form.status_code) body.status_code = form.status_code;
      if (form.actual_time && form.planned_time) body.planned_time = form.planned_time;
      const r = await fetch("/api/entry-controls/" + editModal.id, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.ok) { setEditModal(null); loadControls(); } else setSaveError(d.error || "Güncelleme başarısız");
    } finally { setSaving(false); }
  }

  const canManage = user?.role === "admin" || user?.role === "yonetici" || user?.role === "yetkili";
  const pendingCount = controls.filter(c => c.status_code === "pending").length;
  const delayedCount = controls.filter(c => c.status_code === "delayed").length;

  return (
    <div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="sm:w-44">
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Tarih</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
          </div>
          <div className="flex-1" />
          {canManage && <button onClick={openNew} className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-zinc-200 transition-colors whitespace-nowrap">+ Yeni Kontrol</button>}
        </div>
      </div>

      {fetchError && (
        <div className="mb-4 px-4 py-2.5 bg-red-950 border border-red-800 rounded-xl text-red-300 text-sm flex items-center justify-between">
          <span>{fetchError}</span>
          <button onClick={loadControls} className="ml-4 text-red-400 underline text-xs">Yenile</button>
        </div>
      )}

      {controls.length > 0 && (
        <div className="flex gap-3 mb-4 flex-wrap">
          <span className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-400 px-3 py-1 rounded-full">{controls.length} kayıt</span>
          {pendingCount > 0 && <span className="text-xs bg-zinc-900 border border-zinc-700 text-zinc-400 px-3 py-1 rounded-full">{pendingCount} bekleniyor</span>}
          {delayedCount > 0 && <span className="text-xs bg-amber-950 border border-amber-800 text-amber-300 px-3 py-1 rounded-full">{delayedCount} gecikmeli</span>}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
      ) : controls.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-zinc-500 text-base mb-1">Bu tarihte kontrol kaydı yok</p>
          {canManage && <button onClick={openNew} className="mt-3 text-zinc-400 hover:text-white text-sm underline transition-colors">Yeni kontrol ekle</button>}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Güzergah</th>
                <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Planlanan</th>
                <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Gerçekleşen</th>
                <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Yolcu</th>
                <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Durum</th>
                {canManage && <th className="px-4 py-3 w-12"></th>}
              </tr>
            </thead>
            <tbody>
              {controls.map(ctrl => {
                const st = STATUS_LABELS[ctrl.status_code] || STATUS_LABELS.pending;
                return (
                  <tr key={ctrl.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3.5">
                      <p className="text-white text-sm font-medium">{ctrl.route_name || "—"}</p>
                      {ctrl.route_code && <p className="text-zinc-600 text-xs font-mono">{ctrl.route_code}</p>}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-300 text-sm tabular-nums">{ctrl.planned_time || "—"}</td>
                    <td className="px-4 py-3.5">
                      <span className="text-zinc-300 text-sm tabular-nums">{ctrl.actual_time || "—"}</span>
                      {ctrl.delay_minutes > 0 && <span className="ml-1.5 text-xs text-amber-400 font-medium">+{ctrl.delay_minutes}dk</span>}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-400 text-sm tabular-nums">
                      {ctrl.passenger_actual > 0 || ctrl.passenger_expected > 0
                        ? ctrl.passenger_actual + " / " + ctrl.passenger_expected
                        : "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={"inline-flex items-center text-xs font-medium border px-2.5 py-1 rounded-full " + st.cls}>{st.label}</span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3.5 text-right">
                        <button onClick={() => openEdit(ctrl)} className="text-zinc-600 hover:text-white text-xs transition-colors">Düzenle</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <ControlModal title="Yeni Kontrol" form={form} setForm={setForm} routes={routes} saving={saving} saveError={saveError} onSave={saveNew} onClose={() => setShowModal(false)} isNew={true} />}
      {editModal && <ControlModal title="Kontrolü Düzenle" form={form} setForm={setForm} routes={routes} saving={saving} saveError={saveError} onSave={saveEdit} onClose={() => setEditModal(null)} isNew={false} />}
    </div>
  );
}

function ControlModal({ title, form, setForm, routes, saving, saveError, onSave, onClose, isNew }: {
  title: string; form: any; setForm: (v: any) => void; routes: any[];
  saving: boolean; saveError: string | null; onSave: () => void; onClose: () => void; isNew: boolean;
}) {
  const fld = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((v: any) => ({ ...v, [k]: e.target.value }));
  return (
    <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full sm:max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-zinc-600 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="space-y-3">
          {isNew && (
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Güzergah *</label>
              <select value={form.route_id} onChange={fld("route_id")} className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                <option value="">— Güzergah seçin —</option>
                {routes.map(r => <option key={r.id} value={r.id}>{r.name}{r.code ? " (" + r.code + ")" : ""}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Planlanan Saat {isNew && "*"}</label>
              <input type="time" value={form.planned_time} onChange={fld("planned_time")} disabled={!isNew}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Gerçekleşen Saat</label>
              <input type="time" value={form.actual_time} onChange={fld("actual_time")}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Beklenen Yolcu</label>
              <input type="number" min="0" value={form.passenger_expected} onChange={fld("passenger_expected")} placeholder="0"
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Gerçekleşen Yolcu</label>
              <input type="number" min="0" value={form.passenger_actual} onChange={fld("passenger_actual")} placeholder="0"
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Durum</label>
            <select value={form.status_code} onChange={fld("status_code")} className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
              <option value="">Otomatik belirle</option>
              <option value="pending">Bekleniyor</option>
              <option value="on_time">Zamanında</option>
              <option value="delayed">Gecikmeli</option>
              <option value="cancelled">İptal</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Not</label>
            <textarea value={form.notes} onChange={fld("notes")} rows={2} placeholder="İsteğe bağlı not..."
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none placeholder-zinc-600" />
          </div>
          {saveError && <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2">{saveError}</p>}
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
          <button onClick={onSave} disabled={saving} className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────

export default function GirisKontrolPage() {
  const [user, setUser] = useState<any>(null);
  const [tab, setTab] = useState<"arac" | "sefer">("arac");

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); }).catch(() => {});
  }, []);

  const navUser = user || { full_name: "...", role: "personel" };

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={navUser} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Giriş Kontrol</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Araç kabulü ve giriş kaydı</p>
        </div>
        <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
          <button onClick={() => setTab("arac")}
            className={"px-4 py-2 rounded-lg text-sm font-medium transition-colors " + (tab === "arac" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white")}>
            Araç Gelişleri
          </button>
          <button onClick={() => setTab("sefer")}
            className={"px-4 py-2 rounded-lg text-sm font-medium transition-colors " + (tab === "sefer" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white")}>
            Sefer Kontrolleri
          </button>
        </div>
        {tab === "arac" ? <AracGelis user={user} /> : <SeferKontrol user={user} />}
      </main>
    </div>
  );
}
