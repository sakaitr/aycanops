"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../_components/PortalShell";

const STATUS_LABEL: Record<string, string> = { yeni: "Yeni", incelendi: "İncelendi" };
const STATUS_COLOR: Record<string, string> = {
  yeni: "text-amber-400 bg-amber-400/10",
  incelendi: "text-green-400 bg-green-400/10",
};

function fileHref(filename: string) {
  return `/api/uploads/musteri-denetim/${filename}`;
}

export default function PortalDenetimlerPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState<string | null>(null); // plaka
  const [form, setForm] = useState({ title: "", inspection_date: "", note: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  async function load() {
    try {
      const [vRes, sRes] = await Promise.all([
        fetch("/api/portal/araclar").then(r => r.json()),
        fetch("/api/portal/denetimler").then(r => r.json()),
      ]);
      if (!vRes.ok && vRes.error === "Yetkisiz") { router.replace("/portal/giris"); return; }
      if (vRes.ok) setVehicles(vRes.data);
      if (sRes.ok) setSubmissions(sRes.data);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = vehicles.filter(v =>
    !search || v.plate?.toLowerCase().includes(search.toLowerCase()) || v.driver_name?.toLowerCase().includes(search.toLowerCase())
  );

  function openForm(plate: string) {
    setShowForm(plate);
    setForm({ title: "", inspection_date: new Date().toISOString().split("T")[0], note: "" });
    setFiles([]);
    setFormError("");
  }

  async function submit(plate: string, vehicleId: string | null) {
    setFormError("");
    if (!form.title.trim() || !form.inspection_date) { setFormError("Başlık ve tarih zorunludur"); return; }
    if (files.length === 0) { setFormError("En az bir dosya ekleyin"); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title.trim());
      fd.append("inspection_date", form.inspection_date);
      fd.append("note", form.note.trim());
      fd.append("plate", plate);
      if (vehicleId) fd.append("company_vehicle_id", vehicleId);
      files.forEach(f => fd.append("files", f));
      const res = await fetch("/api/portal/denetimler", { method: "POST", body: fd });
      const d = await res.json();
      if (d.ok) { setShowForm(null); load(); }
      else setFormError(d.error || "Hata oluştu");
    } catch {
      setFormError("Bağlantı hatası");
    } finally { setSubmitting(false); }
  }

  return (
    <PortalShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Araç Denetimleri</h1>
            <p className="text-xs text-[var(--t-text-500)] mt-0.5">
              Kendi denetim ekibinizin yaptığı denetim dosyalarını plaka bazında ekleyin
            </p>
          </div>
          <input
            type="text"
            placeholder="Plaka / sürücü ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--t-text-600)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)] w-52"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--t-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-[var(--t-text-500)] text-sm bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl">
            Araç bulunamadı
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((v, i) => {
              const vehicleId = v.vehicle_id || v.id;
              const plateSubmissions = submissions.filter(s => s.plate === v.plate);
              const isFormOpen = showForm === v.plate;
              return (
                <div key={v.id || i} className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-bold text-[var(--foreground)] tracking-wide">{v.plate}</span>
                      {v.driver_name && <p className="text-xs text-[var(--t-text-400)] mt-0.5">{v.driver_name}</p>}
                    </div>
                    <button
                      onClick={() => openForm(v.plate)}
                      className="text-xs font-semibold bg-[var(--t-accent)] hover:opacity-90 text-white px-3 py-1.5 rounded-lg transition-all"
                    >
                      + Denetim Ekle
                    </button>
                  </div>

                  {plateSubmissions.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {plateSubmissions.map(s => (
                        <div key={s.id} className="bg-[var(--t-900)] rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm font-medium text-[var(--foreground)]">{s.title}</p>
                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium shrink-0 ${STATUS_COLOR[s.status]}`}>
                              {STATUS_LABEL[s.status]}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--t-text-500)] mb-1.5">
                            {new Date(s.inspection_date).toLocaleDateString("tr-TR")} · {s.olusturan}
                          </p>
                          {s.note && <p className="text-xs text-[var(--t-text-400)] mb-1.5">{s.note}</p>}
                          {s.files?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {s.files.map((f: any) => (
                                <a key={f.id} href={fileHref(f.filename)} target="_blank" rel="noopener noreferrer"
                                  className="text-[11px] bg-[var(--t-800)] text-[var(--t-text-400)] px-2 py-1 rounded-lg hover:text-[var(--foreground)]">
                                  {f.original_name}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    !isFormOpen && <p className="text-xs text-[var(--t-text-600)] mt-3">Henüz denetim dosyası eklenmemiş</p>
                  )}

                  {isFormOpen && (
                    <div className="mt-3 bg-[var(--t-900)] rounded-lg p-3 space-y-2">
                      <input type="text" placeholder="Başlık *" value={form.title}
                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                        className="w-full bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--t-text-600)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]" />
                      <input type="date" value={form.inspection_date}
                        onChange={e => setForm(f => ({ ...f, inspection_date: e.target.value }))}
                        className="w-full bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]" />
                      <textarea placeholder="Not (opsiyonel)" rows={2} value={form.note}
                        onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                        className="w-full bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--t-text-600)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)] resize-none" />
                      <label className="flex items-center justify-center gap-2 bg-[var(--t-800)] border border-dashed border-[var(--t-border-800)] rounded-lg px-3 py-2.5 text-[var(--t-text-500)] text-xs cursor-pointer hover:border-[var(--t-accent)] transition-colors">
                        {files.length > 0 ? `${files.length} dosya seçildi` : "Dosya Seç (PDF, foto, doc, xls)"}
                        <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" className="hidden"
                          onChange={e => setFiles(Array.from(e.target.files || []))} />
                      </label>
                      {formError && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5">{formError}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => setShowForm(null)}
                          className="flex-1 text-xs text-[var(--t-text-400)] hover:text-[var(--foreground)] py-2">İptal</button>
                        <button onClick={() => submit(v.plate, vehicleId)} disabled={submitting}
                          className="flex-1 bg-[var(--t-accent)] hover:opacity-90 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg transition-all">
                          {submitting ? "Yükleniyor..." : "Gönder"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
