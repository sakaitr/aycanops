"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import AppSelect from "@/components/AppSelect";
import { hasPermission } from "@/lib/permissions";

const DURUM_LABEL: Record<string, string> = {
  acik: "Açık",
  islemde: "İşlemde",
  cozuldu: "Çözüldü",
  kapandi: "Kapandı",
};
const DURUM_COLOR: Record<string, string> = {
  acik: "bg-red-950 text-red-300 border border-red-800",
  islemde: "bg-amber-950 text-amber-300 border border-amber-800",
  cozuldu: "bg-emerald-950 text-emerald-300 border border-emerald-800",
  kapandi: "bg-zinc-800 text-zinc-400 border border-zinc-700",
};
const ONCELIK_LABEL: Record<string, string> = {
  dusuk: "Düşük",
  normal: "Normal",
  yuksek: "Yüksek",
  kritik: "Kritik",
};
const ONCELIK_COLOR: Record<string, string> = {
  dusuk: "text-zinc-500",
  normal: "text-zinc-400",
  yuksek: "text-amber-400",
  kritik: "text-red-400",
};
const VALID_DURUMLAR = ["acik", "islemde", "cozuldu", "kapandi"];

function timeAgo(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}d`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function AttachmentLink({ a }: { a: any }) {
  const isImage = a.mime_type?.startsWith("image/");
  const href = `/api/uploads/destek/${a.filename}`;
  if (isImage) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
        <img src={href} alt={a.original_name} className="w-full h-full object-cover" />
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 shrink-0">
      📎 {a.original_name}
    </a>
  );
}

function MessageThread({ messages, meLabel }: { messages: any[]; meLabel: "staff" | "customer" }) {
  return (
    <div className="space-y-3">
      {messages.map(m => {
        const isMe = m.sender_type === meLabel;
        const senderName = m.sender_type === "staff" ? (m.staff_name || "Ekip") : (m.customer_name || "Müşteri");
        return (
          <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 ${isMe ? "bg-[var(--t-accent,#2563eb)] bg-blue-600 text-white" : "bg-zinc-800 text-zinc-200"}`}>
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

export default function MusteriDestekPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const [companyFilter, setCompanyFilter] = useState("");
  const [durumFilter, setDurumFilter] = useState("acik");

  const [messages, setMessages] = useState<Record<string, any[]>>({});
  const [messagesLoading, setMessagesLoading] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState<Record<string, string>>({});
  const [replyFiles, setReplyFiles] = useState<Record<string, File[]>>({});
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => { router.replace("/login"); });
  }, []);

  useEffect(() => {
    fetch("/api/companies?limit=9999").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); });
  }, []);

  useEffect(() => { load(); }, [companyFilter, durumFilter]);

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (companyFilter) p.set("company_id", companyFilter);
      if (durumFilter) p.set("durum", durumFilter);
      const r = await fetch(`/api/musteri-destek?${p.toString()}`);
      const d = await r.json();
      if (d.ok) setTickets(d.data);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(ticketId: string) {
    setMessagesLoading(ticketId);
    try {
      const r = await fetch(`/api/musteri-destek/${ticketId}/messages`);
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
      const r = await fetch(`/api/musteri-destek/${ticketId}/messages`, { method: "POST", body: fd });
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

  async function changeDurum(id: string, durum: string) {
    setUpdating(id);
    try {
      const r = await fetch(`/api/musteri-destek/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durum }),
      });
      const d = await r.json();
      if (d.ok) load();
      else alert(d.error || "Güncellenemedi");
    } finally {
      setUpdating(null);
    }
  }

  const canUpdate = hasPermission(user, "musteri_destek:update");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Nav user={user} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-zinc-100">Müşteri Destek</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{tickets.length} kayıt — müşteri portalından gelen destek talepleri</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <AppSelect
            value={companyFilter}
            onChange={setCompanyFilter}
            options={[
              { value: "", label: "Tüm Firmalar" },
              ...companies.map(c => ({ value: c.id, label: c.name })),
            ]}
            triggerClass="bg-zinc-900 border-zinc-800"
            className="max-w-[220px] min-w-[160px]"
          />
          <div className="flex gap-1">
            {["acik", "islemde", "cozuldu", "kapandi", ""].map(d => (
              <button
                key={d || "tumu"}
                onClick={() => setDurumFilter(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  durumFilter === d ? "bg-zinc-700 border-zinc-500 text-zinc-100" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {d ? DURUM_LABEL[d] : "Tümü"}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <p className="text-zinc-500 text-sm py-8 text-center">Yükleniyor...</p>
        ) : tickets.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-zinc-300 font-medium mb-1">Kayıt yok</p>
            <p className="text-zinc-600 text-sm max-w-xs mx-auto">Müşteri portalından bu filtrelere uyan destek talebi bulunamadı.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map(t => {
              const isExpanded = expanded === t.id;
              return (
                <div key={t.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div
                    className="p-4 cursor-pointer hover:bg-zinc-800/30"
                    onClick={() => toggleExpand(t.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300">{t.company_name}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DURUM_COLOR[t.durum] ?? ""}`}>{DURUM_LABEL[t.durum] ?? t.durum}</span>
                          <span className={`text-xs font-medium ${ONCELIK_COLOR[t.oncelik] ?? ""}`}>{ONCELIK_LABEL[t.oncelik] ?? t.oncelik}</span>
                        </div>
                        <p className="text-sm font-medium text-zinc-100 truncate">{t.konu}</p>
                        {!isExpanded && <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{t.icerik}</p>}
                        <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                          <span>{t.olusturan}</span>
                          <span>{timeAgo(t.created_at)}</span>
                        </div>
                      </div>
                      <span className="text-zinc-600 text-xs shrink-0">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-zinc-800/60 pt-3">
                      {messagesLoading === t.id ? (
                        <p className="text-zinc-600 text-sm py-4 text-center">Yükleniyor...</p>
                      ) : (
                        <MessageThread messages={messages[t.id] || []} meLabel="staff" />
                      )}

                      {canUpdate && (
                        <>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {VALID_DURUMLAR.map(d => (
                              <button
                                key={d}
                                onClick={e => { e.stopPropagation(); changeDurum(t.id, d); }}
                                disabled={updating === t.id || t.durum === d}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 ${
                                  t.durum === d ? "bg-zinc-700 text-zinc-300" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
                                }`}
                              >
                                {DURUM_LABEL[d]}
                              </button>
                            ))}
                          </div>

                          <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                            <textarea
                              value={replyBody[t.id] || ""}
                              onChange={e => setReplyBody(prev => ({ ...prev, [t.id]: e.target.value }))}
                              placeholder="Yanıt yaz..."
                              rows={2}
                              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none"
                            />
                            {(replyFiles[t.id]?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {replyFiles[t.id].map((f, i) => (
                                  <span key={i} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-lg">
                                    {f.name}
                                    <button onClick={() => setReplyFiles(prev => ({ ...prev, [t.id]: prev[t.id].filter((_, j) => j !== i) }))} className="ml-1.5 text-zinc-500 hover:text-red-400">×</button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer px-2 py-1.5 rounded-lg bg-zinc-800/60">
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
                                className="bg-white text-zinc-950 text-xs font-semibold px-4 py-1.5 rounded-lg hover:bg-zinc-200 disabled:opacity-40 transition-colors"
                              >
                                {sending === t.id ? "Gönderiliyor..." : "Gönder"}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
