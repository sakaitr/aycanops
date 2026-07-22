"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { IconSearch, IconX } from "./Icons";

type SearchResult = {
  type: string;
  id: string;
  label: string;
  sub?: string;
  href: string;
};

const TYPE_COLORS: Record<string, string> = {
  "Araç": "bg-blue-500/20 text-blue-300",
  "Yolcu": "bg-teal-500/20 text-teal-300",
  "Sürücü": "bg-violet-500/20 text-violet-300",
  "Personel": "bg-indigo-500/20 text-indigo-300",
  "Firma": "bg-amber-500/20 text-amber-300",
  "Güzergah": "bg-emerald-500/20 text-emerald-300",
  "Görev": "bg-orange-500/20 text-orange-300",
};

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const search = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setResults(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    setActiveIdx(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 250);
  }

  function handleSelect(r: SearchResult) {
    setOpen(false);
    router.push(r.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && results.length > 0) { handleSelect(results[activeIdx]); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/60 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-all text-sm"
        title="Global Ara (Ctrl+K)"
      >
        <IconSearch size={13} />
        <span className="text-xs">Ara...</span>
        <kbd className="ml-2 text-[10px] bg-zinc-700/60 text-zinc-500 px-1.5 py-0.5 rounded font-mono">⌃K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800">
          <IconSearch size={16} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Araç, sürücü, firma, güzergah ara..."
            className="flex-1 bg-transparent text-white text-sm placeholder-zinc-600 focus:outline-none"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin shrink-0" />
          )}
          <button onClick={() => setOpen(false)} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <IconX size={16} />
          </button>
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <div className="max-h-80 overflow-y-auto py-2">
            {results.map((r, i) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => handleSelect(r)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === activeIdx ? "bg-zinc-800/60" : "hover:bg-zinc-800/40"}`}
              >
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${TYPE_COLORS[r.type] || "bg-zinc-700 text-zinc-400"}`}>
                  {r.type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{r.label}</p>
                  {r.sub && <p className="text-xs text-zinc-500 truncate">{r.sub}</p>}
                </div>
                <span className="text-zinc-600 text-xs shrink-0">{r.href}</span>
              </button>
            ))}
          </div>
        ) : query.length >= 2 && !loading ? (
          <div className="py-10 text-center text-zinc-600 text-sm">
            "<span className="text-zinc-400">{query}</span>" için sonuç bulunamadı
          </div>
        ) : query.length < 2 ? (
          <div className="py-6 px-4">
            <p className="text-xs text-zinc-600 mb-2.5">Hızlı bağlantılar</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Araçlar", href: "/araclar" },
                { label: "Giriş Kontrol", href: "/giris-kontrol" },
                { label: "Denetimler", href: "/denetimler" },
                { label: "İş Takibi", href: "/gorevler" },
                { label: "Raporlar", href: "/raporlar" },
              ].map(l => (
                <button
                  key={l.href}
                  onClick={() => { setOpen(false); router.push(l.href); }}
                  className="text-xs bg-zinc-800 text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors"
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="px-4 py-2 border-t border-zinc-800 flex gap-3 text-[10px] text-zinc-700">
          <span>↑↓ gezin</span>
          <span>↵ seç</span>
          <span>Esc kapat</span>
        </div>
      </div>
    </div>
  );
}
