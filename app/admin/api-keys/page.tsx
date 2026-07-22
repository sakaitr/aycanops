"use client";

import { useEffect, useState, useCallback } from "react";
import { IconShield, IconX, IconCopy } from "@/components/Icons";

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: number;
  created_at: string;
};

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState("read");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/api-keys");
      const json = await res.json();
      if (json.ok) setKeys(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes }),
      });
      const json = await res.json();
      if (json.ok) {
        setNewKey(json.key);
        setName("");
        setScopes("read");
        setModalOpen(false);
        await load();
      }
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    await fetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
    await load();
  }

  async function toggleKey(id: string, currentActive: number) {
    await fetch(`/api/admin/api-keys/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: currentActive === 0 ? 1 : 0 }),
    });
    await load();
  }

  function copyKey() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--t-accent)]/20 flex items-center justify-center">
            <IconShield className="text-[var(--t-accent)]" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Public API Anahtarları</h1>
            <p className="text-sm text-[var(--t-400)]">API v1 erişim anahtarlarını yönet</p>
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-[var(--t-accent)] hover:opacity-90 text-white text-sm font-semibold transition-opacity"
        >
          + Yeni Anahtar
        </button>
      </div>

      {/* New Key Banner */}
      {newKey && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-emerald-400">✓ API anahtarı oluşturuldu — sadece bir kez görüntüleniyor</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-[var(--t-900)] rounded-lg px-3 py-2 text-xs text-emerald-300 font-mono break-all select-all">
              {newKey}
            </code>
            <button
              onClick={copyKey}
              className="shrink-0 px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-semibold transition-colors flex items-center gap-1"
            >
              <IconCopy size={12} />
              {copied ? "Kopyalandı!" : "Kopyala"}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="text-xs text-[var(--t-500)] hover:text-[var(--t-300)]">
            Gizle
          </button>
        </div>
      )}

      {/* Keys list */}
      <div className="bg-[var(--t-900)] border border-[var(--t-800)] rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[var(--t-500)]">Yükleniyor…</div>
        ) : keys.length === 0 ? (
          <div className="py-16 text-center text-[var(--t-500)] text-sm">
            Henüz API anahtarı oluşturulmadı.
          </div>
        ) : (
          <div className="divide-y divide-[var(--t-800)]">
            {keys.map(k => (
              <div key={k.id} className="px-4 py-4 flex items-start justify-between gap-4 hover:bg-[var(--t-800)]/40">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[var(--foreground)] text-sm">{k.name}</span>
                    {k.is_active ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">Aktif</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400">İptal</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--t-500)] mt-1 space-x-3">
                    <span>Prefix: <code className="text-[var(--t-300)] font-mono">{k.key_prefix}…</code></span>
                    <span>Kapsam: <code className="text-[var(--t-300)]">{k.scopes}</code></span>
                    <span>Son kullanım: {formatDate(k.last_used_at)}</span>
                    {k.expires_at && <span>Bitiş: {formatDate(k.expires_at)}</span>}
                  </div>
                  <p className="text-[11px] text-[var(--t-600)] mt-0.5">Oluşturulma: {formatDate(k.created_at)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleKey(k.id, k.is_active)}
                    className="px-2.5 py-1 text-xs bg-[var(--t-800)] hover:bg-[var(--t-700)] text-[var(--t-300)] rounded-lg transition-colors whitespace-nowrap"
                  >
                    {k.is_active ? "Devre Dışı" : "Aktif Et"}
                  </button>
                  <button
                    onClick={() => revokeKey(k.id)}
                    className="px-2.5 py-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                  >
                    İptal
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Docs snippet */}
      <div className="bg-[var(--t-900)] border border-[var(--t-800)] rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-[var(--t-400)]">API Kullanımı</p>
        <pre className="text-xs text-[var(--t-300)] font-mono bg-[var(--t-800)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{`# Araçları listele
curl -H "X-API-Key: <anahtarın>" \\
  https://aycanops.agno.digital/api/v1/vehicles

# Sefer listesi (tarih aralığı)
curl -H "X-API-Key: <anahtarın>" \\
  "https://aycanops.agno.digital/api/v1/trips?date_from=2026-04-01&date_to=2026-04-30"`}</pre>
      </div>

      {/* Create Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="bg-[var(--t-900)] border border-[var(--t-700)] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[var(--foreground)]">Yeni API Anahtarı</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-[var(--t-800)] hover:bg-[var(--t-700)] flex items-center justify-center text-[var(--t-400)]"
              >
                <IconX size={14} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Anahtar Adı</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Örn: Müşteri Portal, ERP Entegrasyon"
                  autoFocus
                  className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--t-400)] mb-1.5">Erişim Kapsamı</label>
                <select
                  value={scopes}
                  onChange={e => setScopes(e.target.value)}
                  className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2.5 text-sm focus:outline-none"
                >
                  <option value="read">Sadece Okuma (read)</option>
                  <option value="read write">Okuma + Yazma (read write)</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-[var(--t-700)] text-sm text-[var(--t-300)] hover:bg-[var(--t-800)] transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !name.trim()}
                className="flex-1 py-2.5 rounded-xl bg-[var(--t-accent)] hover:opacity-90 text-white text-sm font-semibold transition-opacity disabled:opacity-50"
              >
                {creating ? "Oluşturuluyor…" : "Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
