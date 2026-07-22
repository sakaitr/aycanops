"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

function formatDayMonth(d: string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long" }).format(new Date(d));
}

function daysUntilNext(birthDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const b = new Date(birthDate);
  let next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, b.getMonth(), b.getDate());
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

export default function DogumGunleriPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data);
      else router.replace("/login");
    });
    fetch("/api/admin/dogum-gunleri").then(r => r.json()).then(d => {
      if (d.ok) setRows(d.data);
      setLoading(false);
    });
  }, []);

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Doğum Günleri</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Aktif sürücülerin doğum günleri, en yakın olana göre sıralı</p>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-14 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Doğum tarihi kayıtlı sürücü yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => {
                const kalan = daysUntilNext(row.birth_date);
                return (
                  <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-white font-medium text-sm">{row.name}</span>
                      <p className="text-zinc-600 text-xs mt-0.5">{formatDayMonth(row.birth_date)}{row.phone ? ` · ${row.phone}` : ""}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
                      kalan === 0 ? "bg-emerald-950 border-emerald-800 text-emerald-300" : "bg-zinc-800 border-zinc-700 text-zinc-400"
                    }`}>
                      {kalan === 0 ? "Bugün 🎉" : kalan === 1 ? "Yarın" : `${kalan} gün sonra`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
