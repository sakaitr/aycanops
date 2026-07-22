"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

type Plan = {
  id: string;
  name: string;
  company_name?: string;
  shift_name?: string;
  direction: string;
  status: string;
  version_no: number;
  updated_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Taslak",
  published: "Yayında",
  active: "Aktif",
  archived: "Arşiv",
};

export default function RotaPlanlamaPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [name, setName] = useState("");
  const [direction, setDirection] = useState("morning");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadPlans(nextCompanyId = companyId) {
    setLoading(true);
    const params = new URLSearchParams();
    if (nextCompanyId) params.set("company_id", nextCompanyId);
    const d = await fetch(`/api/route-plans?${params}`).then(r => r.json()).catch(() => ({ ok: false }));
    if (d.ok) setPlans(d.data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => router.replace("/login"));
    fetch("/api/companies?limit=9999").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); }).catch(() => {});
    loadPlans("");
  }, [router]);

  async function createPlan() {
    if (!name.trim()) return alert("Plan adı zorunludur");
    setSaving(true);
    try {
      const d = await fetch("/api/route-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company_id: companyId || null, direction }),
      }).then(r => r.json());
      if (!d.ok) return alert(d.error || "Plan oluşturulamadı");
      setName("");
      await loadPlans(companyId);
    } finally {
      setSaving(false);
    }
  }

  async function publishPlan(id: string, activate = false) {
    const d = await fetch(`/api/route-plans/${id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activate }),
    }).then(r => r.json());
    if (!d.ok) return alert(d.error || "Plan durumu güncellenemedi");
    await loadPlans(companyId);
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">MVP-3 / MVP-4</p>
            <h1 className="mt-1 text-2xl font-bold text-white">Vardiya Bazlı Rota Planlama</h1>
            <p className="mt-1 text-sm text-zinc-500">Plan oluştur, versiyonla, yayınla ve aktif planı kontrol et.</p>
          </div>
          <select
            value={companyId}
            onChange={e => { setCompanyId(e.target.value); loadPlans(e.target.value); }}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-violet-600"
          >
            <option value="">Tüm firmalar</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <h2 className="text-sm font-semibold text-white">Yeni plan</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Örn. NARPLAS Sabah Servis Planı"
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-[16px] text-white outline-none focus:border-violet-600"
            />
            <select value={direction} onChange={e => setDirection(e.target.value)} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-600">
              <option value="morning">Sabah</option>
              <option value="evening">Akşam</option>
              <option value="both">Gidiş-Dönüş</option>
            </select>
            <button onClick={createPlan} disabled={saving} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50">
              {saving ? "Kaydediliyor..." : "Plan oluştur"}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
          <div className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Planlar</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-zinc-500">Yükleniyor...</div>
          ) : plans.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">Henüz rota planı yok.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">Firma</th>
                    <th className="px-4 py-3 font-medium">Yön</th>
                    <th className="px-4 py-3 font-medium">Durum</th>
                    <th className="px-4 py-3 font-medium">Versiyon</th>
                    <th className="px-4 py-3 text-right font-medium">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map(plan => (
                    <tr key={plan.id} className="border-b border-zinc-800/70 last:border-0">
                      <td className="px-4 py-3 font-medium text-white">{plan.name}</td>
                      <td className="px-4 py-3 text-zinc-400">{plan.company_name || "—"}</td>
                      <td className="px-4 py-3 text-zinc-400">{plan.direction === "morning" ? "Sabah" : plan.direction === "evening" ? "Akşam" : plan.direction}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${plan.status === "active" ? "bg-green-500/15 text-green-300" : plan.status === "published" ? "bg-sky-500/15 text-sky-300" : "bg-zinc-800 text-zinc-300"}`}>
                          {STATUS_LABEL[plan.status] || plan.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">v{plan.version_no || 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => publishPlan(plan.id, false)} className="rounded-lg border border-sky-700 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-950">Yayınla</button>
                          <button onClick={() => publishPlan(plan.id, true)} className="rounded-lg border border-green-700 px-3 py-1.5 text-xs font-semibold text-green-200 hover:bg-green-950">Aktifleştir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
