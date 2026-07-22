"use client";

import type { ReactNode } from "react";

type BulkActionBarProps = {
  selectedCount: number;
  pageCount: number;
  filteredCount: number;
  onSelectPage: () => void;
  onSelectFiltered: () => void;
  onClear: () => void;
  children?: ReactNode;
};

export default function BulkActionBar({ selectedCount, pageCount, filteredCount, onSelectPage, onSelectFiltered, onClear, children }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-16 z-20 mb-4 rounded-2xl border border-sky-800/70 bg-sky-950/90 px-4 py-3 shadow-xl shadow-black/20 backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-sky-100">{selectedCount} kayıt seçildi</p>
          <p className="text-xs text-sky-300/80">Sayfa: {pageCount} · Filtre sonucu: {filteredCount}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onSelectPage} className="rounded-lg border border-sky-700 px-3 py-2 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-900">
            Bu sayfayı seç
          </button>
          <button onClick={onSelectFiltered} className="rounded-lg border border-sky-700 px-3 py-2 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-900">
            Filtre sonucunu seç
          </button>
          {children}
          <button onClick={onClear} className="rounded-lg border border-sky-900 px-3 py-2 text-xs font-semibold text-sky-300 transition-colors hover:border-sky-700 hover:text-white">
            Temizle
          </button>
        </div>
      </div>
    </div>
  );
}