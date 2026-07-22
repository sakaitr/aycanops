"use client";
import { useState, useEffect, useRef } from "react";
import { applyTheme, getStoredTheme } from "./ThemeProvider";

/* ── 5 Stil × 5 Renk ─────────────────────────────────────────────────── */
const STYLE_GROUPS = [
  {
    key: "carbon",
    label: "Carbon",
    desc: "OLED Siyahı",
    preview: { bg: "#09090b", card: "#18181b", border: "#27272a" },
    themes: [
      { id: "carbon-blue",   label: "Mavi",   dot: "#3b82f6" },
      { id: "carbon-green",  label: "Yeşil",  dot: "#22c55e" },
      { id: "carbon-teal",   label: "Teal",   dot: "#14b8a6" },
      { id: "carbon-amber",  label: "Kehribar", dot: "#f59e0b" },
      { id: "carbon-purple", label: "Mor",    dot: "#a855f7" },
    ],
  },
  {
    key: "navy",
    label: "Navy",
    desc: "Koyu Lacivert",
    preview: { bg: "#081e48", card: "#0b2a61", border: "#1e4f96" },
    themes: [
      { id: "navy-blue",   label: "Mavi",   dot: "#01aef0" },
      { id: "navy-green",  label: "Yeşil",  dot: "#10b981" },
      { id: "navy-teal",   label: "Teal",   dot: "#06b6d4" },
      { id: "navy-amber",  label: "Kehribar", dot: "#f59e0b" },
      { id: "navy-purple", label: "Mor",    dot: "#a855f7" },
    ],
  },
  {
    key: "dusk",
    label: "Dusk",
    desc: "Slate Karanlık",
    preview: { bg: "#0f172a", card: "#1e293b", border: "#334155" },
    themes: [
      { id: "dusk-blue",   label: "Mavi",   dot: "#60a5fa" },
      { id: "dusk-green",  label: "Yeşil",  dot: "#34d399" },
      { id: "dusk-teal",   label: "Teal",   dot: "#2dd4bf" },
      { id: "dusk-amber",  label: "Kehribar", dot: "#fbbf24" },
      { id: "dusk-purple", label: "Mor",    dot: "#c084fc" },
    ],
  },
  {
    key: "cloud",
    label: "Cloud",
    desc: "Açık Beyaz",
    preview: { bg: "#f1f5f9", card: "#ffffff", border: "#e2e8f0" },
    themes: [
      { id: "cloud-blue",   label: "Mavi",   dot: "#2563eb" },
      { id: "cloud-green",  label: "Yeşil",  dot: "#16a34a" },
      { id: "cloud-teal",   label: "Teal",   dot: "#0d9488" },
      { id: "cloud-amber",  label: "Kehribar", dot: "#d97706" },
      { id: "cloud-purple", label: "Mor",    dot: "#7c3aed" },
    ],
  },
  {
    key: "stone",
    label: "Stone",
    desc: "Sıcak Karanlık",
    preview: { bg: "#1c1917", card: "#292524", border: "#44403c" },
    themes: [
      { id: "stone-blue",   label: "Mavi",   dot: "#60a5fa" },
      { id: "stone-green",  label: "Yeşil",  dot: "#34d399" },
      { id: "stone-teal",   label: "Teal",   dot: "#2dd4bf" },
      { id: "stone-amber",  label: "Kehribar", dot: "#f59e0b" },
      { id: "stone-purple", label: "Mor",    dot: "#c084fc" },
    ],
  },
];

const ALL_THEMES = STYLE_GROUPS.flatMap(g => g.themes);

export default function ThemeSwitcher() {
  const [current, setCurrent] = useState<string>("navy-blue");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setCurrent(getStoredTheme()); }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function select(id: string) {
    applyTheme(id);
    setCurrent(id);
    setOpen(false);
  }

  const activeTheme = ALL_THEMES.find(t => t.id === current);
  const activeGroup = STYLE_GROUPS.find(g => g.themes.some(t => t.id === current));
  const activeDot = activeTheme?.dot ?? "#01aef0";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2.5 h-9 rounded-xl hover:bg-zinc-800 transition-all group cursor-pointer"
        title={`Tema: ${activeGroup?.label} · ${activeTheme?.label}`}
        aria-label="Tema değiştir"
      >
        <span
          className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-2 ring-zinc-700 group-hover:ring-zinc-500 transition-all"
          style={{ backgroundColor: activeDot }}
        />
        <span className="hidden sm:block text-[11px] font-medium text-zinc-500 group-hover:text-zinc-300 transition-colors leading-none">
          {activeGroup?.label}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 animate-scale-in"
          style={{ filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.5))" }}>
          <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-2xl overflow-hidden w-72">

            {/* Header */}
            <div className="px-4 pt-3.5 pb-2.5 border-b border-zinc-800/60">
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Görünüm Seçici</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">{activeGroup?.label} · {activeTheme?.label}</p>
            </div>

            {/* Style rows */}
            <div className="p-2 space-y-0.5">
              {STYLE_GROUPS.map(group => {
                const isActiveGroup = group.key === activeGroup?.key;
                return (
                  <div
                    key={group.key}
                    className={`rounded-xl px-3 py-2.5 transition-all ${
                      isActiveGroup ? "bg-zinc-800/70" : "hover:bg-zinc-800/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {/* Mini preview */}
                        <div
                          className="w-5 h-5 rounded-md border border-white/10 flex-shrink-0 overflow-hidden"
                          style={{ backgroundColor: group.preview.bg }}
                        >
                          <div
                            className="w-full h-2 mt-1.5"
                            style={{ backgroundColor: group.preview.card, borderTop: `1px solid ${group.preview.border}` }}
                          />
                        </div>
                        <div>
                          <span className={`text-xs font-semibold leading-none ${isActiveGroup ? "text-zinc-100" : "text-zinc-400"}`}>
                            {group.label}
                          </span>
                          <span className="block text-[10px] text-zinc-600 leading-none mt-0.5">{group.desc}</span>
                        </div>
                      </div>
                    </div>

                    {/* Color dots */}
                    <div className="flex gap-1.5">
                      {group.themes.map(t => {
                        const isActive = t.id === current;
                        return (
                          <button
                            key={t.id}
                            onClick={() => select(t.id)}
                            title={t.label}
                            className="cursor-pointer transition-transform hover:scale-110 active:scale-95"
                            style={{ outline: "none" }}
                          >
                            <span
                              className={`block rounded-full transition-all ${
                                isActive
                                  ? "ring-2 ring-offset-1 ring-offset-zinc-900 ring-white/80 scale-110"
                                  : "ring-1 ring-white/10 hover:ring-white/30"
                              }`}
                              style={{
                                backgroundColor: t.dot,
                                width: isActive ? "18px" : "16px",
                                height: isActive ? "18px" : "16px",
                              }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-zinc-800/60">
              <p className="text-[10px] text-zinc-600">5 stil · 5 renk · 25 tema</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


