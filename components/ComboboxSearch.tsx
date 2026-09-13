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
  onSearch?: (query: string) => void;
  loading?: boolean;
  error?: string | null;
  onLoadMore?: () => void;
  onRetry?: () => void;
  valueLabel?: string;
}

export default function ComboboxSearch({
  options,
  value,
  onChange,
  placeholder = "Ara...",
  emptyLabel = "— Seçin —",
  className = "",
  disabled = false,
  onSearch,
  loading = false,
  error,
  onLoadMore,
  onRetry,
  valueLabel,
}: ComboboxSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label || valueLabel || "";

  const filtered = !onSearch && query.trim()
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
    onSearch?.("");
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
          onChange={(e) => { setQuery(e.target.value); onSearch?.(e.target.value); }}
          placeholder={placeholder}
          className="w-full bg-zinc-800 border border-zinc-500 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); setQuery(""); }
            if (e.key === "Enter" && !loading && !error && filtered.length === 1) handleSelect(filtered[0]);
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
          {error ? <div role="alert" className="px-3 py-3 text-red-400 text-sm">{error} {onRetry && <button type="button" onClick={onRetry}>Tekrar dene</button>}</div> : loading ? <p role="status" className="px-3 py-3 text-zinc-400 text-sm">Yükleniyor...</p> : filtered.length === 0 ? (
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
          {!loading && !error && onLoadMore && <button type="button" onClick={onLoadMore} className="w-full px-3 py-2 text-sm text-sky-300">Daha fazla yükle</button>}
        </div>
      )}
    </div>
  );
}
