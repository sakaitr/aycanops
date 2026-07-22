"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { IconCoin, IconBarChart } from "@/components/Icons";

const CATEGORIES: { key: string; label: string; emoji: string }[] = [
  { key: "fuel",        label: "Yakıt",      emoji: "⛽" },
  { key: "maintenance", label: "Bakım",       emoji: "🔧" },
  { key: "salary",      label: "Personel",   emoji: "👤" },
  { key: "insurance",   label: "Sigorta",    emoji: "🛡️" },
  { key: "tax",         label: "Vergi",      emoji: "🏛️" },
  { key: "rent",        label: "Kiralama",   emoji: "🏢" },
  { key: "equipment",   label: "Ekipman",    emoji: "📦" },
  { key: "other",       label: "Diğer",      emoji: "📋" },
];

type BudgetRow = {
  category: string;
  budgeted_amount: number;
  actual_amount: number;
  notes: string | null;
  id: string | null;
  company_id: string | null;
};

function toYM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatTL(n: number) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

function ProgressBar({ ratio }: { ratio: number }) {
  const pct = Math.min(ratio * 100, 100);
  const color =
    ratio > 1 ? "bg-red-500" : ratio > 0.8 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="w-full bg-[var(--t-800)] rounded-full h-1.5 overflow-hidden">
      <div
        className={`${color} h-1.5 rounded-full transition-all`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function ButcePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    }).catch(() => { router.replace("/login"); });
  }, []);

  const now = new Date();
  const [period, setPeriod] = useState(toYM(now));
  const [data, setData] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editRow, setEditRow] = useState<BudgetRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAmount, setModalAmount] = useState("");
  const [modalNotes, setModalNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/butce?period=${period}`);
      const json = await res.json();
      if (json.ok) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  function openEdit(row: BudgetRow) {
    setEditRow(row);
    setModalAmount(row.budgeted_amount > 0 ? String(row.budgeted_amount) : "");
    setModalNotes(row.notes ?? "");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditRow(null);
  }

  async function handleSave() {
    if (!editRow) return;
    const amount = parseFloat(modalAmount.replace(",", "."));
    if (isNaN(amount) || amount < 0) return;

    setSaving(true);
    try {
      await fetch("/api/butce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: editRow.category,
          period,
          budgeted_amount: amount,
          notes: modalNotes || null,
          company_id: editRow.company_id ?? null,
        }),
      });
      closeModal();
      await load();
    } finally {
      setSaving(false);
    }
  }

  const totalBudget = data.reduce((s, r) => s + r.budgeted_amount, 0);
  const totalActual = data.reduce((s, r) => s + r.actual_amount, 0);

  // Period navigation
  function shiftPeriod(delta: number) {
    const [y, m] = period.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setPeriod(toYM(d));
  }

  const catInfo = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Nav user={user} />
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--t-accent)]/20 flex items-center justify-center">
            <IconCoin className="text-[var(--t-accent)]" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Bütçe & Maliyet</h1>
            <p className="text-sm text-[var(--t-400)]">Aylık bütçe planlama ve maliyet analizi</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftPeriod(-1)}
            className="w-8 h-8 rounded-lg bg-[var(--t-800)] hover:bg-[var(--t-700)] text-[var(--t-300)] flex items-center justify-center text-sm font-medium transition-colors"
          >
            ‹
          </button>
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="rounded-lg border border-[var(--t-700)] bg-[var(--t-900)] text-[var(--foreground)] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
          />
          <button
            onClick={() => shiftPeriod(1)}
            className="w-8 h-8 rounded-lg bg-[var(--t-800)] hover:bg-[var(--t-700)] text-[var(--t-300)] flex items-center justify-center text-sm font-medium transition-colors"
          >
            ›
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Toplam Bütçe", value: formatTL(totalBudget), color: "text-blue-400" },
          { label: "Gerçekleşen", value: formatTL(totalActual), color: "text-emerald-400" },
          {
            label: "Fark",
            value: (totalBudget - totalActual >= 0 ? "+" : "") + formatTL(totalBudget - totalActual),
            color: totalBudget - totalActual >= 0 ? "text-emerald-400" : "text-red-400",
          },
        ].map(card => (
          <div key={card.label} className="bg-[var(--t-900)] border border-[var(--t-800)] rounded-xl p-4">
            <p className="text-xs text-[var(--t-400)] mb-1">{card.label}</p>
            <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Category table */}
      <div className="bg-[var(--t-900)] border border-[var(--t-800)] rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--t-800)]">
          <IconBarChart size={16} className="text-[var(--t-400)]" />
          <span className="text-sm font-medium text-[var(--t-300)]">Kategori Bazlı Analiz</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-[var(--t-500)]">Yükleniyor…</div>
        ) : (
          <div className="divide-y divide-[var(--t-800)]">
            {data.map(row => {
              const info = catInfo[row.category];
              const ratio = row.budgeted_amount > 0 ? row.actual_amount / row.budgeted_amount : 0;
              const overBudget = row.actual_amount > row.budgeted_amount && row.budgeted_amount > 0;
              return (
                <div key={row.category} className="px-4 py-3 hover:bg-[var(--t-800)]/50 transition-colors">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">{info?.emoji ?? "📋"}</span>
                      <span className="text-sm font-medium text-[var(--foreground)] truncate">
                        {info?.label ?? row.category}
                      </span>
                      {overBudget && (
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          AŞILDI
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-[var(--t-500)]">Bütçe</p>
                        <p className="text-sm font-semibold text-[var(--t-200)]">
                          {row.budgeted_amount > 0 ? formatTL(row.budgeted_amount) : "—"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[var(--t-500)]">Gerçekleşen</p>
                        <p className={`text-sm font-semibold ${row.actual_amount > 0 ? (overBudget ? "text-red-400" : "text-emerald-400") : "text-[var(--t-500)]"}`}>
                          {row.actual_amount > 0 ? formatTL(row.actual_amount) : "—"}
                        </p>
                      </div>
                      <button
                        onClick={() => openEdit(row)}
                        className="ml-2 px-2.5 py-1 text-xs bg-[var(--t-800)] hover:bg-[var(--t-700)] text-[var(--t-300)] rounded-lg transition-colors whitespace-nowrap"
                      >
                        Düzenle
                      </button>
                    </div>
                  </div>
                  {row.budgeted_amount > 0 && (
                    <div className="flex items-center gap-2">
                      <ProgressBar ratio={ratio} />
                      <span className="text-[11px] text-[var(--t-500)] whitespace-nowrap w-10 text-right">
                        {Math.round(ratio * 100)}%
                      </span>
                    </div>
                  )}
                  {row.notes && (
                    <p className="text-xs text-[var(--t-500)] mt-1 truncate">{row.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {modalOpen && editRow && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-[var(--t-900)] border border-[var(--t-700)] rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{catInfo[editRow.category]?.emoji ?? "📋"}</span>
                <div>
                  <h2 className="font-semibold text-[var(--foreground)]">
                    {catInfo[editRow.category]?.label ?? editRow.category}
                  </h2>
                  <p className="text-xs text-[var(--t-500)]">{period} dönemi bütçesi</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="w-7 h-7 rounded-lg bg-[var(--t-800)] hover:bg-[var(--t-700)] text-[var(--t-400)] flex items-center justify-center text-base transition-colors"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--t-300)] mb-1.5">
                  Bütçe Tutarı (₺)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={modalAmount}
                  onChange={e => setModalAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--t-300)] mb-1.5">
                  Not (opsiyonel)
                </label>
                <textarea
                  value={modalNotes}
                  onChange={e => setModalNotes(e.target.value)}
                  rows={2}
                  placeholder="Açıklama ekle…"
                  className="w-full rounded-lg border border-[var(--t-700)] bg-[var(--t-800)] text-[var(--foreground)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]/50 resize-none"
                />
              </div>
            </div>

            {editRow.actual_amount > 0 && (
              <div className="bg-[var(--t-800)] rounded-lg px-3 py-2 text-sm flex justify-between">
                <span className="text-[var(--t-400)]">Bu dönem gerçekleşen:</span>
                <span className="font-semibold text-[var(--t-200)]">{formatTL(editRow.actual_amount)}</span>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 rounded-xl border border-[var(--t-700)] text-[var(--t-300)] text-sm font-medium hover:bg-[var(--t-800)] transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-[var(--t-accent)] hover:opacity-90 text-white text-sm font-semibold transition-opacity disabled:opacity-60"
              >
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
