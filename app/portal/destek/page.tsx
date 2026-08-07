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
const EVAL_DURUM_LABEL: Record<string, string> = {
  bekliyor: "Değerlendiriliyor",
  sicile_islendi: "Sicile İşlendi",
  reddedildi: "Reddedildi",
};
const EVAL_DURUM_COLOR: Record<string, string> = {
  bekliyor: "text-amber-400 bg-amber-400/10",
  sicile_islendi: "text-red-400 bg-red-400/10",
  reddedildi: "text-zinc-400 bg-zinc-400/10",
};

function AttachmentLink({ a }: { a: any }) {
  const isImage = a.mime_type?.startsWith("image/");
  const href = `/api/uploads/destek/${a.filename}`;
  if (isImage) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-lg overflow-hidden bg-black/20 shrink-0">
        <img src={href} alt={a.original_name} className="w-full h-full object-cover" />
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/20 text-[13px] hover:bg-black/30 shrink-0">
      📎 {a.original_name}
    </a>
  );
}

function MessageThread({ messages }: { messages: any[] }) {
  return (
    <div className="space-y-3">
      {messages.map(m => {
        const isMe = m.sender_type === "customer";
        const senderName = m.sender_type === "staff" ? (m.staff_name || "Aycan Turizm") : (m.customer_name || "Siz");
        return (
          <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 ${isMe ? "bg-[var(--t-accent)] text-white" : "bg-[var(--t-900)] text-[var(--foreground)]"}`}>
              <p className="text-[11px] opacity-70 mb-0.5">{senderName} · {new Date(m.created_at).toLocaleString("tr-TR")}</p>
              {m.body && <p className="text-sm whitespace-pre-wrap">{m.body}</p>}
              {m.attachments?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {m.attachments.map((a: any) => <AttachmentLink key={a.id} a={a} />)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PortalDestekPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    konu: "", icerik: "", oncelik: "normal",
    kategori: "genel", driver_name: "", vehicle_id: "", incident_date: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [vehicles, setVehicles] = useState<any[]>([]);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, any[]>>({});
  const [messagesLoading, setMessagesLoading] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState<Record<string, string>>({});
  const [replyFiles, setReplyFiles] = useState<Record<string, File[]>>({});
  const [sending, setSending] = useState<string | null>(null);

  async function loadMessages(ticketId: string) {
    setMessagesLoading(ticketId);
    try {
      const r = await fetch(`/api/portal/destek/${ticketId}/messages`);
      const d = await r.json();
      if (d.ok) setMessages(prev => ({ ...prev, [ticketId]: d.data }));
    } finally {
      setMessagesLoading(null);
    }
  }

  function toggleExpand(ticketId: string) {
    const next = expanded === ticketId ? null : ticketId;
    setExpanded(next);
    if (next && !messages[next]) loadMessages(next);
  }

  async function sendReply(ticketId: string) {
    const body = (replyBody[ticketId] || "").trim();
    const files = replyFiles[ticketId] || [];
    if (!body && files.length === 0) return;
    setSending(ticketId);
    try {
      const fd = new FormData();
      if (body) fd.append("body", body);
      files.forEach(f => fd.append("files", f));
      const r = await fetch(`/api/portal/destek/${ticketId}/messages`, { method: "POST", body: fd });
      const d = await r.json();
      if (d.ok) {
        setReplyBody(prev => ({ ...prev, [ticketId]: "" }));
        setReplyFiles(prev => ({ ...prev, [ticketId]: [] }));
        loadMessages(ticketId);
        load();
      } else {
        alert(d.error || "Gönderilemedi");
      }
    } finally {
      setSending(null);
    }
  }

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
  useEffect(() => {
    fetch("/api/portal/araclar").then(r => r.json()).then(d => { if (d.ok) setVehicles(d.data); }).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.konu.trim() || !form.icerik.trim()) {
      setFormError("Konu ve içerik zorunludur");
      return;
    }
    if (form.kategori === "surucu_sikayeti" && !form.driver_name.trim()) {
      setFormError("Sürücü bilgisi zorunludur");
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
        setForm({ konu: "", icerik: "", oncelik: "normal", kategori: "genel", driver_name: "", vehicle_id: "", incident_date: "" });
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
            <h1 className="text-xl font-bold text-[var(--foreground)]">Destek / Şikayet</h1>
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

                <div>
                  <label className="text-xs text-[var(--t-text-500)] mb-1 block">Talep Türü</label>
                  <div className="flex gap-2">
                    {[["genel", "Genel Destek"], ["surucu_sikayeti", "Sürücü Şikayeti"]].map(([val, label]) => (
                      <button key={val} type="button"
                        onClick={() => setForm(f => ({ ...f, kategori: val }))}
                        className={`flex-1 text-sm font-medium rounded-xl px-3 py-2.5 min-h-[44px] border transition-all ${
                          form.kategori === val
                            ? "bg-[var(--t-accent)] text-white border-[var(--t-accent)]"
                            : "bg-[var(--t-900)] text-[var(--t-text-500)] border-[var(--t-border-800)]"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {form.kategori === "surucu_sikayeti" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--t-text-500)] mb-1 block">Araç (opsiyonel)</label>
                      <select
                        value={form.vehicle_id}
                        onChange={e => {
                          const vid = e.target.value;
                          const v = vehicles.find((x: any) => x.vehicle_id === vid || x.id === vid);
                          setForm(f => ({ ...f, vehicle_id: vid, driver_name: v?.driver_name ? v.driver_name : f.driver_name }));
                        }}
                        className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
                      >
                        <option value="">— Araç seç —</option>
                        {vehicles.map((v: any) => (
                          <option key={v.id} value={v.vehicle_id || v.id}>{v.plate}{v.driver_name ? ` · ${v.driver_name}` : ""}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--t-text-500)] mb-1 block">Sürücü Adı *</label>
                      <input
                        type="text"
                        list="portal-driver-names"
                        value={form.driver_name}
                        onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                        placeholder="Sürücü adını yazın veya seçin"
                        className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] rounded-xl px-3 py-2.5 text-[16px] text-[var(--foreground)] placeholder-[var(--t-text-600)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
                      />
                      <datalist id="portal-driver-names">
                        {vehicles.filter((v: any) => v.driver_name).map((v: any) => <option key={v.id} value={v.driver_name} />)}
                      </datalist>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-[var(--t-text-500)] mb-1 block">Olay Tarihi</label>
                      <input
                        type="date"
                        value={form.incident_date}
                        onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))}
                        className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
                      />
                    </div>
                  </div>
                )}

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
            {tickets.map(t => {
              const isExpanded = expanded === t.id;
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl overflow-hidden"
                >
                  <div className="p-4 cursor-pointer" onClick={() => toggleExpand(t.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--foreground)] truncate">{t.konu}</p>
                        {!isExpanded && <p className="text-xs text-[var(--t-text-500)] mt-0.5 line-clamp-2">{t.icerik}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {t.kategori === "surucu_sikayeti" && t.eval_durum && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${EVAL_DURUM_COLOR[t.eval_durum] ?? ""}`}>
                            {EVAL_DURUM_LABEL[t.eval_durum] ?? t.eval_durum}
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${DURUM_COLOR[t.durum] ?? ""}`}>
                          {DURUM_LABEL[t.durum] ?? t.durum}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {t.kategori === "surucu_sikayeti" && (
                        <span className="text-[11px] text-[var(--t-text-500)] font-medium">Sürücü: {t.driver_name}</span>
                      )}
                      <span className="text-[11px] text-[var(--t-text-600)]">
                        {new Date(t.created_at).toLocaleDateString("tr-TR")}
                      </span>
                      <span className="text-[11px] text-[var(--t-text-600)]">•</span>
                      <span className="text-[11px] text-[var(--t-text-600)]">
                        Öncelik: {ONCELIK_LABEL[t.oncelik] ?? t.oncelik}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-[var(--t-border-800)] pt-3" onClick={e => e.stopPropagation()}>
                      {messagesLoading === t.id ? (
                        <p className="text-[var(--t-text-600)] text-sm py-4 text-center">Yükleniyor...</p>
                      ) : (
                        <MessageThread messages={messages[t.id] || []} />
                      )}

                      {t.durum !== "kapandi" && (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={replyBody[t.id] || ""}
                            onChange={e => setReplyBody(prev => ({ ...prev, [t.id]: e.target.value }))}
                            placeholder="Yanıt yaz..."
                            rows={2}
                            className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] text-[16px] text-[var(--foreground)] px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)] resize-none"
                          />
                          {(replyFiles[t.id]?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {replyFiles[t.id].map((f, i) => (
                                <span key={i} className="text-xs bg-[var(--t-900)] text-[var(--t-text-500)] px-2 py-1 rounded-lg">
                                  {f.name}
                                  <button onClick={() => setReplyFiles(prev => ({ ...prev, [t.id]: prev[t.id].filter((_, j) => j !== i) }))} className="ml-1.5 text-[var(--t-text-600)] hover:text-red-400">×</button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-xs text-[var(--t-text-500)] hover:text-[var(--foreground)] cursor-pointer px-2 py-1.5 rounded-lg bg-[var(--t-900)]">
                              📎 Dosya/Görsel Ekle
                              <input
                                type="file"
                                multiple
                                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                                className="hidden"
                                onChange={e => {
                                  const files = Array.from(e.target.files || []);
                                  setReplyFiles(prev => ({ ...prev, [t.id]: [...(prev[t.id] || []), ...files] }));
                                  e.target.value = "";
                                }}
                              />
                            </label>
                            <button
                              onClick={() => sendReply(t.id)}
                              disabled={sending === t.id || (!replyBody[t.id]?.trim() && !(replyFiles[t.id]?.length))}
                              className="bg-[var(--t-accent)] hover:opacity-90 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all"
                            >
                              {sending === t.id ? "Gönderiliyor..." : "Gönder"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
