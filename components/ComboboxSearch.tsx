"use client";
import { useState, useRef, useEffect } from "react";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxSearchProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}

export default function ComboboxSearch({
  options,
  value,
  onChange,
  placeholder = "Ara...",
  emptyLabel = "— Seçin —",
  className = "",
  disabled = false,
}: ComboboxSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label || "";

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleOpen() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 10);
  }

  function handleSelect(opt: ComboboxOption) {
    onChange(opt.value);
    setOpen(false);
    setQuery("");
  }

  function handleClear() {
    onChange("");
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      {!open ? (
        <button
          type="button"
          onClick={handleOpen}
          disabled={disabled}
          className="w-full bg-zinc-800 border border-zinc-700 text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 text-left flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className={value ? "text-white" : "text-zinc-500"}>
            {value ? selectedLabel : emptyLabel}
          </span>
          <span className="text-zinc-500 text-xs ml-2 shrink-0">▾</span>
        </button>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-zinc-800 border border-zinc-500 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); setQuery(""); }
            if (e.key === "Enter" && filtered.length === 1) handleSelect(filtered[0]);
          }}
        />
      )}

      {/* Dropdown list */}
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          <button
            type="button"
            onClick={handleClear}
            className="w-full text-left px-3 py-2 text-zinc-500 hover:bg-zinc-700 text-sm border-b border-zinc-700"
          >
            {emptyLabel}
          </button>
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-zinc-600 text-sm">Sonuç bulunamadı</p>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 transition-colors ${
                  opt.value === value
                    ? "text-emerald-300 bg-emerald-950/40"
                    : "text-white"
                }`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
