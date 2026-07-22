"use client";

/** Tek satır skeleton */
export function SkeletonLine({ w = "100%", h = "16px", className = "" }: { w?: string; h?: string; className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-zinc-800 ${className}`}
      style={{ width: w, height: h }}
    />
  );
}

/** StatCard skeleton */
export function SkeletonStatCard() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="w-8 h-8 rounded-xl bg-zinc-800" />
        <div className="w-16 h-4 rounded bg-zinc-800" />
      </div>
      <div className="w-20 h-8 rounded bg-zinc-800" />
      <div className="w-32 h-3 rounded bg-zinc-800" />
    </div>
  );
}

/** Tablo satır iskelet */
export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b border-zinc-800/60">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-zinc-800 animate-pulse" style={{ width: i === 0 ? "80%" : "60%" }} />
        </td>
      ))}
    </tr>
  );
}

/** Tablo iskeleti (birden fazla satır) */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} cols={cols} />
      ))}
    </>
  );
}

/** Kart grid iskeleti */
export function SkeletonCard() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 animate-pulse flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-zinc-800 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-zinc-800 rounded w-3/4" />
          <div className="h-3 bg-zinc-800 rounded w-1/2" />
        </div>
      </div>
      <div className="h-3 bg-zinc-800 rounded w-full" />
      <div className="h-3 bg-zinc-800 rounded w-4/5" />
    </div>
  );
}

/** Tam sayfa yükleniyor state */
export function SkeletonPage({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: cards }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}
