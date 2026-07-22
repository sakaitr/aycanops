"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { hasPermission } from "@/lib/permissions";

const CATEGORIES = [
  { code: "oneri",   label: "Öneri",   bg: "bg-blue-900",   text: "text-blue-300" },
  { code: "talep",   label: "Talep",   bg: "bg-amber-900",  text: "text-amber-300" },
  { code: "sikayet", label: "Şikayet", bg: "bg-red-900",    text: "text-red-300" },
  { code: "istek",   label: "İstek",   bg: "bg-violet-900", text: "text-violet-300" },
];

function getCatMeta(code: string) {
  return CATEGORIES.find(c => c.code === code) ?? { label: code, bg: "bg-zinc-800", text: "text-zinc-300" };
}

function timeAgo(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}d`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

export default function OnerilerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "", kaynak: "" });

  const [closing, setClosing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => { router.replace("/login"); });
  }, []);

  useEffect(() => { load(); }, [statusFilter]);

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: "9999" });
      if (statusFilter) p.set("status", statusFilter);
      const r = await fetch(`/api/suggestions?${p}`);
      const d = await r.json();
      if (d.ok) setItems(d.data);
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    if (!form.title.trim() || !form.category) return;
    setCreating(true);
    try {
      const r = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (d.ok) {
        setShowCreate(false);
        setForm({ title: "", description: "", category: "", kaynak: "" });
        load();
      } else {
        alert(typeof d.error === "string" ? d.error : "Kayıt başarısız");
      }
    } finally {
      setCreating(false);
    }
  }

  async function closeItem(suggestNo: string) {
    setClosing(suggestNo);
    try {
      const r = await fetch(`/api/suggestions/${suggestNo}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      const d = await r.json();
      if (d.ok) load();
      else alert(d.error);
    } finally {
      setClosing(null);
    }
  }

  async function reopenItem(suggestNo: string) {
    setClosing(suggestNo);
    try {
      const r = await fetch(`/api/suggestions/${suggestNo}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      });
      const d = await r.json();
      if (d.ok) load();
      else alert(d.error);
    } finally {
      setClosing(null);
    }
  }

  const isManager = hasPermission(user, "suggestions:assign");

  const filtered = catFilter ? items.filter(i => i.category === catFilter) : items;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Nav user={user} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Öneri / Talep</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{filtered.length} kayıt</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm font-medium transition-colors"
          >
            + Yeni Ekle
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Category tabs */}
          <button
            onClick={() => setCatFilter("")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              catFilter === "" ? "bg-zinc-700 border-zinc-500 text-zinc-100" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            Tümü
          </button>
          {CATEGORIES.map(c => (
            <button
              key={c.code}
              onClick={() => setCatFilter(catFilter === c.code ? "" : c.code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                catFilter === c.code ? `${c.bg} ${c.text} border-transparent` : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {c.label}
            </button>
          ))}

          {/* Status toggle */}
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => setStatusFilter("open")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                statusFilter === "open" ? "bg-green-900 text-green-300 border-transparent" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              Açık
            </button>
            <button
              onClick={() => setStatusFilter("closed")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                statusFilter === "closed" ? "bg-zinc-700 text-zinc-300 border-transparent" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              Kapalı
            </button>
            <button
              onClick={() => setStatusFilter("")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                statusFilter === "" ? "bg-zinc-700 text-zinc-300 border-transparent" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              Tümü
            </button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <p className="text-zinc-500 text-sm py-8 text-center">Yükleniyor...</p>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-5xl mb-4">💡</div>
            <p className="text-zinc-300 font-medium mb-1">Henüz öneri yok</p>
            <p className="text-zinc-600 text-sm max-w-xs mx-auto">Ekip üyelerinin saha gözlemleri ve iyileştirme önerilerini buradan takip edin.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => {
              const cat = getCatMeta(item.category);
              return (
                <div key={item.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs text-zinc-500 font-mono">{item.suggest_no}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${cat.bg} ${cat.text}`}>{cat.label}</span>
                      {item.status === "closed" && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-400">Kapalı</span>
                      )}
                      {item.kaynak && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-500 border border-zinc-700">{item.kaynak}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-zinc-100 truncate">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{item.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                      <span>{item.creator_name || "—"}</span>
                      <span>{timeAgo(item.created_at)}</span>
                    </div>
                  </div>
                  {isManager && (
                    <div className="shrink-0">
                      {item.status === "open" ? (
                        <button
                          onClick={() => closeItem(item.suggest_no)}
                          disabled={closing === item.suggest_no}
                          className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {closing === item.suggest_no ? "..." : "Kapat"}
                        </button>
                      ) : (
                        <button
                          onClick={() => reopenItem(item.suggest_no)}
                          disabled={closing === item.suggest_no}
                          className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {closing === item.suggest_no ? "..." : "Aç"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-5 border-b border-zinc-800">
              <h2 className="font-semibold text-zinc-100">Yeni Öneri / Talep</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Kategori *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                >
                  <option value="">Seçiniz</option>
                  {CATEGORIES.map(c => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Başlık *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Konu başlığı..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Açıklama</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detaylar..."
                  rows={4}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Kaynak (opsiyonel)</label>
                <input
                  type="text"
                  value={form.kaynak}
                  onChange={e => setForm(f => ({ ...f, kaynak: e.target.value }))}
                  placeholder="örn. Toplantı, WhatsApp, Saha ziyareti..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>
            </div>
            <div className="p-5 border-t border-zinc-800 flex gap-3 justify-end">
              <button
                onClick={() => { setShowCreate(false); setForm({ title: "", description: "", category: "", kaynak: "" }); }}
                className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
              >
                İptal
              </button>
              <button
                onClick={create}
                disabled={creating || !form.title.trim() || !form.category}
                className="px-4 py-2 text-sm bg-zinc-100 text-zinc-900 hover:bg-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {creating ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
