"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Dün";
  if (diffDays < 7) return d.toLocaleDateString("tr-TR", { weekday: "long" });
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: diffDays > 365 ? "numeric" : undefined });
}

function snippet(content: string) {
  const first = content.split("\n").find(l => l.trim()) ?? "";
  return first.length > 80 ? first.slice(0, 80) + "…" : first;
}

export default function NotlarPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  // Admin: kullanıcı filtresi
  const [users, setUsers] = useState<any[]>([]);
  const [viewUserId, setViewUserId] = useState<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) {
        setUser(d.data);
        if (d.data.role === "admin") {
          fetch("/api/users").then(r => r.json()).then(u => { if (u.ok) setUsers(u.data); });
        }
      } else {
        router.replace("/login");
      }
    }).catch(() => { router.replace("/login"); });
  }, []);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQ) params.set("q", searchQ);
      if (viewUserId) params.set("user_id", viewUserId);
      const r = await fetch("/api/notes?" + params.toString());
      const d = await r.json();
      if (d.ok) setNotes(d.data);
    } finally {
      setLoading(false);
    }
  }, [searchQ, viewUserId]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  function selectNote(note: any) {
    flushSave();
    setSelected(note);
    setEditTitle(note.title || "");
    setEditContent(note.content || "");
    setTimeout(() => contentRef.current?.focus(), 50);
  }

  function flushSave() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }

  async function saveNote(id: string, title: string, content: string) {
    setSaving(true);
    try {
      await fetch(`/api/notes?id=${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      setNotes(prev => prev.map(n => n.id === id
        ? { ...n, title, content, updated_at: new Date().toISOString() }
        : n
      ));
    } finally {
      setSaving(false);
    }
  }

  function scheduleAutoSave(id: string, title: string, content: string) {
    flushSave();
    saveTimer.current = setTimeout(() => saveNote(id, title, content), 800);
  }

  function handleTitleChange(v: string) {
    setEditTitle(v);
    if (selected) scheduleAutoSave(selected.id, v, editContent);
  }

  function handleContentChange(v: string) {
    setEditContent(v);
    if (selected) scheduleAutoSave(selected.id, editTitle, v);
  }

  async function createNote() {
    flushSave();
    const r = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", content: "" }),
    });
    const d = await r.json();
    if (d.ok) {
      const fresh = d.data;
      setNotes(prev => [fresh, ...prev]);
      selectNote(fresh);
    }
  }

  async function deleteNote(note: any) {
    if (!confirm(`"${note.title || "Başlıksız not"}" silinsin mi?`)) return;
    flushSave();
    setDeleting(true);
    try {
      await fetch(`/api/notes?id=${note.id}`, { method: "DELETE" });
      setNotes(prev => prev.filter(n => n.id !== note.id));
      if (selected?.id === note.id) {
        setSelected(null);
        setEditTitle("");
        setEditContent("");
      }
    } finally {
      setDeleting(false);
    }
  }

  const filtered = notes; // server-side arama kullanıyoruz

  const isAdminView = user?.role === "admin";

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <Nav user={user} />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-white">Notlar</h1>
          <button
            onClick={createNote}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <span className="text-base leading-none">+</span> Yeni Not
          </button>
        </div>

        <div className="flex gap-4 h-[calc(100vh-160px)] min-h-[500px]">
          {/* ── Sol panel: Liste ── */}
          <div className="w-72 flex-shrink-0 flex flex-col gap-2">
            {/* Arama */}
            <div className="relative">
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") setSearchQ(searchInput); }}
                onBlur={() => setSearchQ(searchInput)}
                placeholder="Ara..."
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600 pr-8"
              />
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(""); setSearchQ(""); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >×</button>
              )}
            </div>

            {/* Admin: kullanıcı seç */}
            {isAdminView && users.length > 0 && (
              <select
                value={viewUserId}
                onChange={e => setViewUserId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
              >
                <option value="">— Kendi notlarım —</option>
                {users.filter(u => u.id !== user?.id).map((u: any) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            )}

            {/* Not listesi */}
            <div className="flex-1 overflow-y-auto rounded-xl bg-zinc-900 border border-zinc-800">
              {loading ? (
                <div className="py-12 text-center text-zinc-600 text-sm">Yükleniyor...</div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-zinc-600 text-sm">
                  {searchQ ? "Sonuç bulunamadı" : "Henüz not yok"}
                </div>
              ) : (
                filtered.map(note => (
                  <button
                    key={note.id}
                    onClick={() => selectNote(note)}
                    className={
                      "w-full text-left px-3 py-3 border-b border-zinc-800 last:border-0 transition-colors hover:bg-zinc-800 " +
                      (selected?.id === note.id ? "bg-amber-950/40 border-l-2 border-l-amber-500" : "")
                    }
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-white text-sm font-medium truncate">
                        {note.title || <span className="text-zinc-500 italic">Başlıksız not</span>}
                      </span>
                      <span className="text-zinc-600 text-xs flex-shrink-0">{formatDate(note.updated_at)}</span>
                    </div>
                    <p className="text-zinc-500 text-xs truncate leading-relaxed">
                      {snippet(note.content) || <span className="italic">İçerik yok</span>}
                    </p>
                    {isAdminView && viewUserId && note.user_full_name && (
                      <span className="text-amber-600 text-xs">{note.user_full_name}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ── Sağ panel: Editör ── */}
          <div className="flex-1 flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {selected ? (
              <>
                {/* Başlık */}
                <div className="flex items-center gap-2 px-5 pt-5 pb-2 border-b border-zinc-800">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => handleTitleChange(e.target.value)}
                    placeholder="Başlık"
                    className="flex-1 bg-transparent text-white text-xl font-bold focus:outline-none placeholder-zinc-600"
                    readOnly={isAdminView && !!viewUserId}
                  />
                  <div className="flex items-center gap-3">
                    {saving && <span className="text-zinc-600 text-xs">Kaydediliyor...</span>}
                    {!isAdminView || !viewUserId ? (
                      <button
                        onClick={() => deleteNote(selected)}
                        disabled={deleting}
                        className="text-zinc-600 hover:text-red-400 text-sm transition-colors disabled:opacity-40"
                        title="Notu sil"
                      >
                        Sil
                      </button>
                    ) : null}
                    {isAdminView && !!viewUserId && (
                      <button
                        onClick={() => deleteNote(selected)}
                        disabled={deleting}
                        className="text-zinc-600 hover:text-red-400 text-sm transition-colors disabled:opacity-40"
                        title="Notu sil (admin)"
                      >
                        Sil
                      </button>
                    )}
                  </div>
                </div>
                {/* Tarih */}
                <div className="px-5 py-1.5">
                  <span className="text-zinc-600 text-xs">
                    {formatDate(selected.updated_at)} · düzenlendi
                  </span>
                </div>
                {/* İçerik */}
                <textarea
                  ref={contentRef}
                  value={editContent}
                  onChange={e => handleContentChange(e.target.value)}
                  placeholder="Notunu buraya yaz..."
                  readOnly={isAdminView && !!viewUserId}
                  className="flex-1 w-full bg-transparent text-zinc-200 text-sm leading-relaxed px-5 py-3 resize-none focus:outline-none placeholder-zinc-700"
                />
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
                <div className="text-4xl">📝</div>
                <p className="text-zinc-400 text-base font-medium">Not seçin veya oluşturun</p>
                <p className="text-zinc-600 text-sm">Soldan bir not seçin ya da yeni not oluşturun</p>
                <button
                  onClick={createNote}
                  className="mt-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  + Yeni Not
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
