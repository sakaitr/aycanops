"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";

const EVENT_TYPES = [
  { value: "belge_bitiyor",        label: "Araç belgesi bitiyor", kmBased: false },
  { value: "sozlesme_bitiyor",     label: "Firma sözleşmesi bitiyor", kmBased: false },
  { value: "bakim_gecikti",        label: "Bakım tarihi geçti", kmBased: false },
  { value: "surucu_belge_bitiyor", label: "Sürücü belgesi bitiyor", kmBased: false },
  { value: "sigorta_bitiyor",      label: "Araç sigortası bitiyor", kmBased: false },
  { value: "lastik_km_asimi",      label: "Lastik değişim km eşiği aşıldı", kmBased: true },
];

const CHANNELS = [
  { value: "in_app",  label: "Uygulama içi" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "hepsi",  label: "Her ikisi" },
];

const EMPTY_FORM = {
  event_type: "belge_bitiyor",
  label: "",
  department_id: "",
  channel: "in_app",
  days_before: 30,
  km_esigi: 40000,
};

export default function BildirimKurallariPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok || d.data?.role !== "admin") { router.replace("/"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/"));
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rr, dr] = await Promise.all([
        fetch("/api/notification-rules").then(r => r.json()),
        fetch("/api/departments").then(r => r.json()),
      ]);
      if (rr.ok) setRules(rr.data);
      if (dr.ok) setDepartments(dr.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  async function toggleActive(rule: any) {
    const r = await fetch(`/api/notification-rules/${rule.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: rule.is_active ? 0 : 1 }),
    });
    const d = await r.json();
    if (d.ok) load();
    else toast.error(d.error);
  }

  async function deleteRule(id: string) {
    if (!confirm("Bu kuralı silmek istiyor musunuz?")) return;
    const r = await fetch(`/api/notification-rules/${id}`, { method: "DELETE" });
    const d = await r.json();
    if (d.ok) { toast.success("Kural silindi"); load(); }
    else toast.error(d.error);
  }

  async function addRule() {
    if (!form.label.trim()) { toast.error("Açıklama zorunludur"); return; }
    setSaving(true);
    try {
      const isKmBased = EVENT_TYPES.find(et => et.value === form.event_type)?.kmBased;
      const r = await fetch("/api/notification-rules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          days_before: isKmBased ? 0 : Number(form.days_before),
          km_esigi: isKmBased ? Number(form.km_esigi) : null,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("Kural eklendi");
        setShowAdd(false);
        setForm({ ...EMPTY_FORM });
        load();
      } else toast.error(d.error);
    } finally { setSaving(false); }
  }

  async function runNow() {
    setRunning(true);
    try {
      const r = await fetch("/api/cron/notify", {
        method: "POST",
        headers: { "x-cron-secret": "aycan-cron-2026" },
      });
      const d = await r.json();
      if (d.ok) toast.success(`Bildirimler gönderildi: ${d.sent} adet`);
      else toast.error(d.error);
    } finally { setRunning(false); }
  }

  if (!user) return <div className="min-h-screen bg-[var(--background)] flex items-center justify-center"><p className="text-[var(--t-500)]">Yükleniyor...</p></div>;

  const groupedRules = EVENT_TYPES.map(et => ({
    ...et,
    items: rules.filter(r => r.event_type === et.value),
  }));

  return (
    <div className="min-h-screen bg-[var(--background)] flex">
      <Nav user={user} />
      <main className="flex-1 pt-16 md:pt-0 md:pl-60 px-4 pb-8">
        <div className="max-w-3xl mx-auto py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-lg font-bold text-[var(--foreground)]">Bildirim Kuralları</h1>
              <p className="text-xs text-[var(--t-500)] mt-0.5">Her gün sabah 07:00 otomatik çalışır</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={runNow}
                disabled={running}
                className="px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
              >
                {running ? "Çalışıyor..." : "▶ Şimdi Çalıştır"}
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="px-3 py-2 rounded-lg bg-[var(--t-accent)] hover:opacity-90 text-white text-xs font-semibold transition-opacity"
              >
                + Kural Ekle
              </button>
            </div>
          </div>

          {/* Add rule form */}
          {showAdd && (
            <div className="bg-[var(--t-900)] border border-[var(--t-700)] rounded-xl p-5 space-y-4">
              <h2 className="font-semibold text-[var(--foreground)] text-sm">Yeni Kural</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1">Olay Tipi</label>
                  <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none">
                    {EVENT_TYPES.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1">Açıklama *</label>
                  <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="Kural açıklaması"
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1">Departman</label>
                  <select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none">
                    <option value="">Tüm yöneticiler</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--t-400)] mb-1">Kanal</label>
                  <select value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none">
                    {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  {EVENT_TYPES.find(et => et.value === form.event_type)?.kmBased ? (
                    <>
                      <label className="block text-xs font-medium text-[var(--t-400)] mb-1">Km Eşiği</label>
                      <input type="number" min="0" step="1000" value={form.km_esigi}
                        onChange={e => setForm(f => ({ ...f, km_esigi: Number(e.target.value) }))}
                        className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none" />
                    </>
                  ) : (
                    <>
                      <label className="block text-xs font-medium text-[var(--t-400)] mb-1">Kaç gün öncesi</label>
                      <input type="number" min="0" max="365" value={form.days_before}
                        onChange={e => setForm(f => ({ ...f, days_before: Number(e.target.value) }))}
                        className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2 text-sm focus:outline-none" />
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAdd(false)}
                  className="flex-1 py-2 rounded-xl border border-[var(--t-700)] text-[var(--t-300)] text-sm hover:bg-[var(--t-800)] transition-colors">
                  İptal
                </button>
                <button onClick={addRule} disabled={saving}
                  className="flex-1 py-2 rounded-xl bg-[var(--t-accent)] hover:opacity-90 text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? "Ekleniyor..." : "Kural Ekle"}
                </button>
              </div>
            </div>
          )}

          {/* Rules list grouped by event type */}
          {loading ? (
            <div className="py-12 text-center text-[var(--t-500)] text-sm">Yükleniyor...</div>
          ) : (
            <div className="space-y-5">
              {groupedRules.map(group => (
                <div key={group.value}>
                  <h3 className="text-xs font-semibold text-[var(--t-500)] uppercase tracking-wider mb-2">
                    {group.label}
                  </h3>
                  {group.items.length === 0 ? (
                    <div className="text-xs text-[var(--t-700)] italic px-1">Bu kategori için kural yok</div>
                  ) : (
                    <div className="bg-[var(--t-900)] border border-[var(--t-800)] rounded-xl divide-y divide-[var(--t-800)]">
                      {group.items.map(rule => (
                        <div key={rule.id} className="flex items-center gap-3 px-4 py-3">
                          {/* Toggle */}
                          <button
                            onClick={() => toggleActive(rule)}
                            className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${rule.is_active ? "bg-[var(--t-accent)]" : "bg-zinc-700"}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${rule.is_active ? "translate-x-4" : ""}`} />
                          </button>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[var(--foreground)] font-medium truncate">{rule.label}</p>
                            <p className="text-xs text-[var(--t-500)] mt-0.5">
                              {rule.department_name ? `📂 ${rule.department_name}` : "👥 Tüm yöneticiler"}
                              {" · "}
                              {CHANNELS.find(c => c.value === rule.channel)?.label || rule.channel}
                              {rule.days_before > 0 && ` · ${rule.days_before} gün öncesi`}
                              {rule.km_esigi != null && ` · ${rule.km_esigi} km eşiği`}
                            </p>
                          </div>
                          {/* Status badge */}
                          <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${rule.is_active ? "bg-green-500/15 text-green-400" : "bg-zinc-700 text-zinc-500"}`}>
                            {rule.is_active ? "Aktif" : "Pasif"}
                          </span>
                          {/* Delete */}
                          <button
                            onClick={() => deleteRule(rule.id)}
                            className="text-zinc-600 hover:text-red-400 transition-colors text-xs px-1"
                            title="Sil"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
