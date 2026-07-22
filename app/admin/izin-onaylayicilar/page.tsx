"use client";
import { useState, useEffect } from "react";
import Nav from "@/components/Nav";
import { IconShield, IconCheck } from "@/components/Icons";

export default function IzinOnaylayicilarPage() {
  const [user, setUser] = useState<any>(null);
  const [kullanicilar, setKullanicilar] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.user); });
    load();
  }, []);

  async function load() {
    setLoading(true);
    const d = await fetch("/api/admin/izin-onaylayicilar").then(r => r.json());
    if (d.ok) setKullanicilar(d.data);
    setLoading(false);
  }

  async function toggle(userId: string, current: number) {
    setSaving(userId);
    await fetch("/api/admin/izin-onaylayicilar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, izin_onaylayici: current ? 0 : 1 }),
    });
    setSaving(null);
    load();
  }

  const ROLE_LABEL: Record<string, string> = {
    personel: "Personel", yetkili: "Yetkili", yonetici: "Yönetici", admin: "Admin",
  };
  const ROLE_COLOR: Record<string, string> = {
    personel: "text-zinc-400", yetkili: "text-blue-400", yonetici: "text-violet-400", admin: "text-amber-400",
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">İzin Onaylayıcıları</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Hangi kullanıcıların izin taleplerini onaylayabileceğini belirle</p>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-zinc-900 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800/60 rounded-2xl overflow-hidden">
            {kullanicilar.map((k, i) => (
              <div
                key={k.id}
                className={`flex items-center justify-between px-4 py-3.5 ${i < kullanicilar.length - 1 ? "border-b border-zinc-800/60" : ""}`}
              >
                <div>
                  <p className="text-sm font-medium text-white">{k.full_name}</p>
                  <p className={`text-xs ${ROLE_COLOR[k.role] || "text-zinc-500"}`}>{ROLE_LABEL[k.role] || k.role}</p>
                </div>
                <button
                  onClick={() => toggle(k.id, k.izin_onaylayici)}
                  disabled={saving === k.id}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                    k.izin_onaylayici ? "bg-[var(--t-accent)]" : "bg-zinc-700"
                  } ${saving === k.id ? "opacity-50" : ""}`}
                  aria-label={k.izin_onaylayici ? "Onaylayıcı yetkisini kaldır" : "Onaylayıcı yap"}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${k.izin_onaylayici ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-zinc-600">
          Onaylayıcı olarak işaretlenen kullanıcılar tüm bekleyen izin taleplerini görebilir ve onaylayabilir.
        </p>
      </main>
    </div>
  );
}
