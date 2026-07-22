"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

const EVENT_ICONS: Record<string, string> = {
  belge_bitiyor: "📄",
  sozlesme_bitiyor: "📋",
  bakim_gecikti: "🔧",
  surucu_belge_bitiyor: "🪪",
};

function todayPrefix() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function guessIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes("belge") && t.includes("araç")) return EVENT_ICONS.belge_bitiyor;
  if (t.includes("sözleşme") || t.includes("sozlesme")) return EVENT_ICONS.sozlesme_bitiyor;
  if (t.includes("bakım") || t.includes("bakim")) return EVENT_ICONS.bakim_gecikti;
  if (t.includes("sürücü") || t.includes("surucu")) return EVENT_ICONS.surucu_belge_bitiyor;
  return "🔔";
}

export default function DashboardNotifications() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/notifications")
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          const prefix = todayPrefix();
          const todayItems = (d.data as any[]).filter(n => (n.created_at as string).startsWith(prefix));
          setItems(todayItems);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
  }

  async function markAllRead() {
    const unread = items.filter(n => n.is_read === 0);
    for (const n of unread) await fetch(`/api/notifications/${n.id}`, { method: "PATCH" });
    setItems(prev => prev.map(n => ({ ...n, is_read: 1 })));
  }

  const unreadCount = items.filter(n => n.is_read === 0).length;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">🔔 Bugünkü Uyarılar</h2>
          {unreadCount > 0 && (
            <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-full font-medium">
              {unreadCount} okunmadı
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-zinc-500 hover:text-white transition-colors"
          >
            Tümünü okundu işaretle
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-10 bg-zinc-800 rounded-xl animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-zinc-600 text-sm py-4 text-center">Bugün için bildirim bulunmuyor ✅</p>
      ) : (
        <ul className="space-y-2">
          {items.map(n => (
            <li key={n.id} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${n.is_read ? "opacity-50" : "bg-zinc-800/60 border border-zinc-700/50"}`}>
              <span className="text-base mt-0.5 flex-shrink-0">{guessIcon(n.title)}</span>
              <div className="flex-1 min-w-0">
                {n.link ? (
                  <Link href={n.link} className="text-sm text-zinc-200 hover:text-white truncate block transition-colors" onClick={() => markRead(n.id)}>
                    {n.title}
                  </Link>
                ) : (
                  <p className="text-sm text-zinc-200 truncate">{n.title}</p>
                )}
                {n.body && <p className="text-xs text-zinc-500 truncate mt-0.5">{n.body}</p>}
              </div>
              {!n.is_read && (
                <button
                  onClick={() => markRead(n.id)}
                  className="text-xs text-zinc-600 hover:text-zinc-400 flex-shrink-0 mt-0.5 transition-colors"
                  title="Okundu işaretle"
                >
                  ✓
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
