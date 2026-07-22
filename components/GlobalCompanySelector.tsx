"use client";
import { useState, useRef, useEffect } from "react";
import { useGlobalCompany } from "@/contexts/CompanyContext";
import { IconBuilding, IconX } from "./Icons";

export default function GlobalCompanySelector() {
  const { companies, loadingCompanies, selectedCompanyId, selectedCompanyName, setSelectedCompany, clearSelectedCompany } = useGlobalCompany();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.trim()
    ? companies.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
    : companies;

  if (loadingCompanies) return null;

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-colors max-w-[160px] ${
          selectedCompanyId
            ? "bg-indigo-950 border-indigo-800 text-indigo-300"
            : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
        }`}
        title={selectedCompanyName || "Firma seçilmedi — tüm firmalar"}
      >
        <IconBuilding size={14} className="shrink-0" />
        <span className="truncate">{selectedCompanyName || "Tüm Firmalar"}</span>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="p-2 border-b border-zinc-800">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Firma ara..."
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              onClick={() => { clearSelectedCompany(); setOpen(false); setQuery(""); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${!selectedCompanyId ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-white"}`}
            >
              Tüm Firmalar
            </button>
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => { setSelectedCompany(c.id); setOpen(false); setQuery(""); }}
                className={`w-full text-left px-3 py-2 text-sm truncate transition-colors ${selectedCompanyId === c.id ? "bg-indigo-950 text-indigo-300" : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"}`}
              >
                {c.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-zinc-600">Firma bulunamadı</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
