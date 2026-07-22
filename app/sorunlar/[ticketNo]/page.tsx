"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import Badge from "@/components/Badge";

const STATUS_TRANSITIONS: Record<string, { value: string; label: string }[]> = {
  open: [{ value: "in_progress", label: "Başlat" }, { value: "waiting", label: "Beklet" }],
  in_progress: [{ value: "waiting", label: "Beklet" }, { value: "solved", label: "Çöz" }],
  waiting: [{ value: "in_progress", label: "Devam Et" }, { value: "solved", label: "Çöz" }],
  solved: [{ value: "closed", label: "Kapat" }, { value: "in_progress", label: "Yeniden Aç" }],
  closed: [],
};

function timeAgo(iso: string) {
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s önce`;
  if (diff < 3600) return `${Math.floor(diff / 60)}d önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}s önce`;
  return d.toLocaleDateString("tr-TR");
}

export default function SorunDetailPage({ params }: { params: Promise<{ ticketNo: string }> }) {
  const router = useRouter();
  const { ticketNo } = use(params);
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [user, setUser] = useState<any>(null);
  useEffect(() => { fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => { router.replace("/login"); }); }, []);

  useEffect(() => { loadTicket(); }, [ticketNo]);

  async function loadTicket() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tickets/${ticketNo}`);
      const d = await res.json();
      if (d.ok) setTicket(d.data);
      else setError(d.error);
    } catch {
      setError("Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus: string) {
    setUpdating(true);
    try {
      await fetch(`/api/tickets/${ticketNo}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_code: newStatus }),
      });
      await loadTicket();
    } finally {
      setUpdating(false);
    }
  }

  async function addComment() {
    if (!comment.trim()) return;
    setCommenting(true);
    try {
      await fetch(`/api/tickets/${ticketNo}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      setComment("");
      await loadTicket();
    } finally {
      setCommenting(false);
    }
  }

  const transitions = ticket ? (STATUS_TRANSITIONS[ticket.status_code] || []) : [];

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link href="/gorevler?tab=sorunlar" className="text-zinc-500 hover:text-white text-sm transition-colors">← Sorunlar</Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-zinc-600 text-sm">Yükleniyor...</div>
          </div>
        ) : error ? (
          <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">{error}</div>
        ) : ticket ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main */}
            <div className="lg:col-span-2 space-y-5">
              {/* Original report — immutable first post */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-zinc-800/60 bg-zinc-950/40">
                  <span className="text-zinc-500 text-xs font-mono">{ticket.ticket_no}</span>
                  <span className="text-zinc-800 text-xs">·</span>
                  <span className="text-zinc-600 text-xs">İlk bildirim</span>
                  <span className="text-zinc-800 text-xs">·</span>
                  <span className="text-zinc-600 text-xs">{ticket.creator_name}</span>
                  <span className="text-zinc-800 text-xs">·</span>
                  <span className="text-zinc-600 text-xs">{new Date(ticket.created_at).toLocaleString("tr-TR")}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Badge status={ticket.priority_code} showLabel />
                    <Badge status={ticket.status_code} showLabel />
                  </div>
                </div>
                <div className="px-5 py-5">
                  <p className="text-white text-base font-medium leading-relaxed">{ticket.title}</p>
                  {ticket.description && (
                    <p className="text-zinc-400 text-sm leading-relaxed mt-3">{ticket.description}</p>
                  )}
                </div>
              </div>

              {/* Status Actions */}
              {transitions.length > 0 && user?.role !== "personel" && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Durum Güncelle</p>
                  <div className="flex gap-2 flex-wrap">
                    {transitions.map(t => (
                      <button
                        key={t.value}
                        onClick={() => updateStatus(t.value)}
                        disabled={updating}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Comments */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Yorumlar ({ticket.comments?.length || 0})</p>
                <div className="space-y-4 mb-5">
                  {(ticket.comments || []).map((c: any) => (
                    <div key={c.id} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-zinc-400">{c.user_name?.[0]?.toUpperCase()}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white text-xs font-semibold">{c.user_name}</span>
                          <span className="text-zinc-600 text-xs">{timeAgo(c.created_at)}</span>
                        </div>
                        <p className="text-zinc-300 text-sm leading-relaxed">{c.comment}</p>
                      </div>
                    </div>
                  ))}
                  {(!ticket.comments || ticket.comments.length === 0) && (
                    <p className="text-zinc-600 text-sm text-center py-2">Henüz yorum yok</p>
                  )}
                </div>
                <div className="border-t border-zinc-800 pt-4">
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    rows={3}
                    placeholder="Yorum ekle..."
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-600 resize-none placeholder-zinc-600"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={addComment}
                      disabled={commenting || !comment.trim()}
                      className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors"
                    >
                      {commenting ? "Gönderiliyor..." : "Yorum Yap"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Detaylar</p>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs text-zinc-600">Durum</dt>
                    <dd className="mt-0.5"><Badge status={ticket.status_code} showLabel /></dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-600">Öncelik</dt>
                    <dd className="mt-0.5">{ticket.priority_code ? <Badge status={ticket.priority_code} showLabel /> : <span className="text-zinc-600 text-xs">—</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-600">Atanan</dt>
                    <dd className="text-zinc-300 text-sm mt-0.5">{ticket.assigned_name || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-600">Oluşturulma</dt>
                    <dd className="text-zinc-400 text-xs mt-0.5">{new Date(ticket.created_at).toLocaleString("tr-TR")}</dd>
                  </div>
                  {ticket.sla_due_at && (
                    <div>
                      <dt className="text-xs text-zinc-600">SLA Bitiş</dt>
                      <dd className={`text-xs mt-0.5 ${new Date(ticket.sla_due_at) < new Date() ? "text-red-400" : "text-zinc-400"}`}>
                        {new Date(ticket.sla_due_at).toLocaleString("tr-TR")}
                      </dd>
                    </div>
                  )}
                  {ticket.solved_at && (
                    <div>
                      <dt className="text-xs text-zinc-600">Çözüm Tarihi</dt>
                      <dd className="text-emerald-400 text-xs mt-0.5">{new Date(ticket.solved_at).toLocaleString("tr-TR")}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Actions */}
              {ticket.actions && ticket.actions.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Aksiyonlar</p>
                  <ul className="space-y-2">
                    {ticket.actions.map((a: any) => (
                      <li key={a.id} className={`text-sm flex items-center gap-2 ${a.is_done ? "text-zinc-600" : "text-zinc-300"}`}>
                        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${a.is_done ? "bg-emerald-600" : "bg-zinc-700"}`} />
                        {a.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
