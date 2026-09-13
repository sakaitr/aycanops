"use client";
import { useEffect, useState } from "react";
import ComboboxSearch from "./ComboboxSearch";

export type SelectableVehicle = { id: string; plate: string; driver_name?: string; driver_phone?: string };
type Props = {
  value: string;
  companyId?: string;
  selectedLabel?: string;
  onChange: (id: string, vehicle?: SelectableVehicle) => void;
};

export default function VehicleSelect(props: Props) {
  return <ScopedVehicleSelect key={props.companyId || "all"} {...props} />;
}

function ScopedVehicleSelect({ value, companyId, selectedLabel, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SelectableVehicle[]>([]);
  const [selected, setSelected] = useState<SelectableVehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, page: String(page), limit: "30", status: "active" });
        if (companyId) params.set("company_id", companyId);
        const response = await fetch(`/api/vehicles?${params}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error("Araçlar yüklenemedi");
        if (controller.signal.aborted) return;
        setRows(previous => page === 1 ? body.data : [...previous, ...body.data.filter((v: SelectableVehicle) => !previous.some(p => p.id === v.id))]);
        setHasMore(body.meta.page < body.meta.pages);
      } catch {
        if (!controller.signal.aborted) setError("Araçlar yüklenemedi. Bağlantıyı kontrol edin");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [companyId, query, page, retry]);

  useEffect(() => {
    setSelected(null);
    if (!value) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ id: value, limit: "1" });
    if (companyId) params.set("company_id", companyId);
    fetch(`/api/vehicles?${params}`, { signal: controller.signal }).then(r => r.json()).then(body => {
      if (!controller.signal.aborted && body.ok) setSelected(body.data[0] ?? null);
    }).catch(() => { if (!controller.signal.aborted) setError("Seçili araç yüklenemedi"); });
    return () => controller.abort();
  }, [value, companyId, retry]);

  const options = rows.map(v => ({ value: v.id, label: `${v.plate}${v.driver_name ? ` · ${v.driver_name}` : ""}` }));
  return <ComboboxSearch options={options} value={value} emptyLabel="— Araç seç —" placeholder="Plaka veya şoför ara..."
    valueLabel={selected?.plate || selectedLabel || "Seçili araç"}
    onChange={id => onChange(id, id ? rows.find(r => r.id === id) ?? selected ?? undefined : undefined)}
    onSearch={text => { if (text !== query) { setRows([]); setLoading(true); setQuery(text); setPage(1); } }}
    loading={loading} error={error} onRetry={() => setRetry(n => n + 1)}
    onLoadMore={hasMore ? () => { setLoading(true); setPage(n => n + 1); } : undefined} />;
}
