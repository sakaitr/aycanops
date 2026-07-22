"use client";

import { useEffect, useState } from "react";
import type { ToastType } from "@/lib/toast";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

const COLORS: Record<ToastType, string> = {
  success: "bg-zinc-900 border-emerald-700 text-emerald-400",
  error: "bg-zinc-900 border-red-700 text-red-400",
  warning: "bg-zinc-900 border-amber-700 text-amber-400",
  info: "bg-zinc-900 border-zinc-700 text-zinc-300",
};

let nextId = 1;

export default function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    function handler(e: Event) {
      const { message, type } = (e as CustomEvent).detail;
      const id = nextId++;
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
    }
    window.addEventListener("__toast__", handler);
    return () => window.removeEventListener("__toast__", handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium pointer-events-auto animate-in slide-in-from-right duration-200 ${COLORS[t.type]}`}
        >
          <span className="text-base leading-none mt-0.5 flex-shrink-0">{ICONS[t.type]}</span>
          <span className="flex-1 text-white">{t.message}</span>
          <button
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            className="text-zinc-600 hover:text-white transition-colors text-base leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
