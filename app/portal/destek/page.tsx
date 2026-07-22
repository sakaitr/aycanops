"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import PortalShell from "../_components/PortalShell";

const DURUM_LABEL: Record<string, string> = {
  acik: "Açık",
  islemde: "İşlemde",
  cozuldu: "Çözüldü",
  kapandi: "Kapandı",
};
const DURUM_COLOR: Record<string, string> = {
  acik: "text-red-400 bg-red-400/10",
  islemde: "text-amber-400 bg-amber-400/10",
  cozuldu: "text-green-400 bg-green-400/10",
  kapandi: "text-zinc-400 bg-zinc-400/10",
};
const ONCELIK_LABEL: Record<string, string> = {
  dusuk: "Düşük",
  normal: "Normal",
  yuksek: "Yüksek",
  kritik: "Kritik",
};

export default function PortalDestekPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ konu: "", icerik: "", oncelik: "normal" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/portal/destek");
      const d = await res.json();
      if (!d.ok && d.error === "Yetkisiz") { router.replace("/portal/giris"); return; }
      if (d.ok) setTickets(d.data);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.konu.trim() || !form.icerik.trim()) {
      setFormError("Konu ve içerik zorunludur");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/destek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (d.ok) {
        setShowForm(false);
        setForm({ konu: "", icerik: "", oncelik: "normal" });
        load();
      } else {
        setFormError(d.error || "Hata oluştu");
      }
    } catch {
      setFormError("Bağlantı hatası");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Destek Talepleri</h1>
            <p className="text-xs text-[var(--t-text-500)] mt-0.5">
              Sorun veya taleplerinizi buradan iletebilirsiniz
            </p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="bg-[var(--t-accent)] hover:opacity-90 text-white text-sm font-medium rounded-xl px-4 py-2.5 min-h-[44px] transition-all"
          >
            + Yeni Talep
          </button>
        </div>

        {/* Yeni Talep Formu */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <form
                onSubmit={handleSubmit}
                className="bg-[var(--t-800)] border border-[var(--t-border-700)] rounded-xl p-4 space-y-3"
              >
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Yeni Destek Talebi</h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs text-[var(--t-text-500)] mb-1 block">Konu *</label>
                    <input
                      type="text"
                      value={form.konu}
                      onChange={e => setForm(f => ({ ...f, konu: e.target.value }))}
                      placeholder="Kısaca konuyu belirtin"
                      className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] rounded-xl px-3 py-2.5 text-[16px] text-[var(--foreground)] placeholder-[var(--t-text-600)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--t-text-500)] mb-1 block">Öncelik</label>
                    <select
                      value={form.oncelik}
                      onChange={e => setForm(f => ({ ...f, oncelik: e.target.value }))}
                      className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
                    >
                      <option value="dusuk">Düşük</option>
                      <option value="normal">Normal</option>
                      <option value="yuksek">Yüksek</option>
                      <option value="kritik">Kritik</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-[var(--t-text-500)] mb-1 block">İçerik *</label>
                  <textarea
                    value={form.icerik}
                    onChange={e => setForm(f => ({ ...f, icerik: e.target.value }))}
                    rows={4}
                    placeholder="Sorununuzu veya talebinizi detaylıca açıklayın..."
                    className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] rounded-xl px-3 py-2.5 text-[16px] text-[var(--foreground)] placeholder-[var(--t-text-600)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)] resize-none"
                  />
                </div>

                {formError && (
                  <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {formError}
                  </p>
                )}

                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="text-sm text-[var(--t-text-400)] hover:text-[var(--foreground)] px-4 py-2.5 min-h-[40px]"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-[var(--t-accent)] hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-5 py-2.5 min-h-[40px] transition-all"
                  >
                    {submitting ? "Gönderiliyor..." : "Gönder"}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Talep Listesi */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--t-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12 text-[var(--t-text-500)] text-sm bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl">
            <svg className="w-10 h-10 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 12h6M9 16h6M7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2M9 4a2 2 0 012-2h2a2 2 0 012 2v2H9V4z"/>
            </svg>
            Henüz destek talebi açılmamış
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map(t => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)] truncate">{t.konu}</p>
                    <p className="text-xs text-[var(--t-text-500)] mt-0.5 line-clamp-2">{t.icerik}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${DURUM_COLOR[t.durum] ?? ""}`}>
                      {DURUM_LABEL[t.durum] ?? t.durum}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[11px] text-[var(--t-text-600)]">
                    {new Date(t.created_at).toLocaleDateString("tr-TR")}
                  </span>
                  <span className="text-[11px] text-[var(--t-text-600)]">•</span>
                  <span className="text-[11px] text-[var(--t-text-600)]">
                    Öncelik: {ONCELIK_LABEL[t.oncelik] ?? t.oncelik}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
