"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import Badge from "@/components/Badge";

const STATUS_OPTIONS = [
  { value: "todo", label: "Yapılacak" },
  { value: "doing", label: "Yapılıyor" },
  { value: "blocked", label: "Engellendi" },
  { value: "done", label: "Tamamlandı" },
];

export default function GorevDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [todo, setTodo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [user, setUser] = useState<any>(null);
  useEffect(() => { fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => { router.replace("/login"); }); }, []);

  useEffect(() => { loadTodo(); }, [id]);

  async function loadTodo() {
    setLoading(true);
    try {
      const res = await fetch(`/api/todos/${id}`);
      const d = await res.json();
      if (d.ok) setTodo(d.data);
      else setError(d.error || "Görev bulunamadı");
    } catch {
      setError("Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus: string) {
    setUpdating(true);
    try {
      await fetch(`/api/todos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_code: newStatus }),
      });
      await loadTodo();
    } finally {
      setUpdating(false);
    }
  }

  async function addComment() {
    if (!comment.trim()) return;
    setCommenting(true);
    try {
      await fetch(`/api/todos/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      setComment("");
      await loadTodo();
    } finally {
      setCommenting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link href="/gorevler" className="text-zinc-500 hover:text-white text-sm transition-colors">← Görevler</Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">Yükleniyor...</div>
        ) : error ? (
          <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">{error}</div>
        ) : todo ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main */}
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Badge status={todo.status_code} showLabel />
                  {todo.priority_code && <Badge status={todo.priority_code} showLabel />}
                </div>
                <h1 className="text-xl font-bold text-white mb-3">{todo.title}</h1>
                {todo.description && (
                  <p className="text-zinc-400 text-sm leading-relaxed border-t border-zinc-800 pt-3">{todo.description}</p>
                )}
              </div>

              {/* Status change */}
              {user?.role !== "personel" && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Durum Güncelle</p>
                <div className="flex gap-2 flex-wrap">
                  {STATUS_OPTIONS.filter(o => o.value !== todo.status_code).map(o => (
                    <button
                      key={o.value}
                      onClick={() => updateStatus(o.value)}
                      disabled={updating}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {/* Comments */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Yorumlar ({todo.comments?.length || 0})</p>
                <div className="space-y-4 mb-5">
                  {(todo.comments || []).map((c: any) => (
                    <div key={c.id} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-zinc-400">{c.user_name?.[0]?.toUpperCase()}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white text-xs font-semibold">{c.user_name}</span>
                          <span className="text-zinc-600 text-xs">{new Date(c.created_at).toLocaleString("tr-TR")}</span>
                        </div>
                        <p className="text-zinc-300 text-sm leading-relaxed">{c.comment}</p>
                      </div>
                    </div>
                  ))}
                  {(!todo.comments || todo.comments.length === 0) && (
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
            <div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Detaylar</p>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs text-zinc-600">Durum</dt>
                    <dd className="mt-0.5"><Badge status={todo.status_code} showLabel /></dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-600">Öncelik</dt>
                    <dd className="mt-0.5">{todo.priority_code ? <Badge status={todo.priority_code} showLabel /> : <span className="text-zinc-600 text-xs">—</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-600">Atanan</dt>
                    <dd className="text-zinc-300 text-sm mt-0.5">{todo.assigned_name || "—"}</dd>
                  </div>
                  {todo.due_date && (
                    <div>
                      <dt className="text-xs text-zinc-600">Bitiş Tarihi</dt>
                      <dd className={`text-sm mt-0.5 ${new Date(todo.due_date) < new Date() && todo.status_code !== "done" ? "text-red-400" : "text-zinc-300"}`}>
                        {new Date(todo.due_date).toLocaleDateString("tr-TR")}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-zinc-600">Oluşturulma</dt>
                    <dd className="text-zinc-400 text-xs mt-0.5">{new Date(todo.created_at).toLocaleString("tr-TR")}</dd>
                  </div>
                  {todo.completed_at && (
                    <div>
                      <dt className="text-xs text-zinc-600">Tamamlanma</dt>
                      <dd className="text-emerald-400 text-xs mt-0.5">{new Date(todo.completed_at).toLocaleString("tr-TR")}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
