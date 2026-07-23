"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import AppSelect from "@/components/AppSelect";
import { hasPermission } from "@/lib/permissions";

const DURUM_LABEL: Record<string, string> = {
  acik: "Açık",
  islemde: "İşlemde",
  cozuldu: "Çözüldü",
  kapandi: "Kapandı",
};
const DURUM_COLOR: Record<string, string> = {
  acik: "bg-red-950 text-red-300 border border-red-800",
  islemde: "bg-amber-950 text-amber-300 border border-amber-800",
  cozuldu: "bg-emerald-950 text-emerald-300 border border-emerald-800",
  kapandi: "bg-zinc-800 text-zinc-400 border border-zinc-700",
};
const ONCELIK_LABEL: Record<string, string> = {
  dusuk: "Düşük",
  normal: "Normal",
  yuksek: "Yüksek",
  kritik: "Kritik",
};
const ONCELIK_COLOR: Record<string, string> = {
  dusuk: "text-zinc-500",
  normal: "text-zinc-400",
  yuksek: "text-amber-400",
  kritik: "text-red-400",
};
const VALID_DURUMLAR = ["acik", "islemde", "cozuldu", "kapandi"];

function timeAgo(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}d`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

export default function MusteriDestekPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const [companyFilter, setCompanyFilter] = useState("");
  const [durumFilter, setDurumFilter] = useState("acik");

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => { router.replace("/login"); });
  }, []);

  useEffect(() => {
    fetch("/api/companies?limit=9999").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); });
  }, []);

  useEffect(() => { load(); }, [companyFilter, durumFilter]);

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (companyFilter) p.set("company_id", companyFilter);
      if (durumFilter) p.set("durum", durumFilter);
      const r = await fetch(`/api/musteri-destek?${p.toString()}`);
      const d = await r.json();
      if (d.ok) setTickets(d.data);
    } finally {
      setLoading(false);
    }
  }

  async function changeDurum(id: string, durum: string) {
    setUpdating(id);
    try {
      const r = await fetch(`/api/musteri-destek/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durum }),
      });
      const d = await r.json();
      if (d.ok) load();
      else alert(d.error || "Güncellenemedi");
    } finally {
      setUpdating(null);
    }
  }

  const canUpdate = hasPermission(user, "musteri_destek:update");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Nav user={user} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-zinc-100">Müşteri Destek</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{tickets.length} kayıt — müşteri portalından gelen destek talepleri</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <AppSelect
            value={companyFilter}
            onChange={setCompanyFilter}
            options={[
              { value: "", label: "Tüm Firmalar" },
              ...companies.map(c => ({ value: c.id, label: c.name })),
            ]}
            triggerClass="bg-zinc-900 border-zinc-800"
            className="max-w-[220px] min-w-[160px]"
          />
          <div className="flex gap-1">
            {["acik", "islemde", "cozuldu", "kapandi", ""].map(d => (
              <button
                key={d || "tumu"}
                onClick={() => setDurumFilter(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  durumFilter === d ? "bg-zinc-700 border-zinc-500 text-zinc-100" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {d ? DURUM_LABEL[d] : "Tümü"}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <p className="text-zinc-500 text-sm py-8 text-center">Yükleniyor...</p>
        ) : tickets.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-zinc-300 font-medium mb-1">Kayıt yok</p>
            <p className="text-zinc-600 text-sm max-w-xs mx-auto">Müşteri portalından bu filtrelere uyan destek talebi bulunamadı.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map(t => {
              const isExpanded = expanded === t.id;
              return (
                <div key={t.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div
                    className="p-4 cursor-pointer hover:bg-zinc-800/30"
                    onClick={() => setExpanded(isExpanded ? null : t.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300">{t.company_name}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DURUM_COLOR[t.durum] ?? ""}`}>{DURUM_LABEL[t.durum] ?? t.durum}</span>
                          <span className={`text-xs font-medium ${ONCELIK_COLOR[t.oncelik] ?? ""}`}>{ONCELIK_LABEL[t.oncelik] ?? t.oncelik}</span>
                        </div>
                        <p className="text-sm font-medium text-zinc-100 truncate">{t.konu}</p>
                        {!isExpanded && <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{t.icerik}</p>}
                        <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                          <span>{t.olusturan}</span>
                          <span>{timeAgo(t.created_at)}</span>
                        </div>
                      </div>
                      <span className="text-zinc-600 text-xs shrink-0">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-zinc-800/60 pt-3">
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap">{t.icerik}</p>
                      {canUpdate && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {VALID_DURUMLAR.map(d => (
                            <button
                              key={d}
                              onClick={e => { e.stopPropagation(); changeDurum(t.id, d); }}
                              disabled={updating === t.id || t.durum === d}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 ${
                                t.durum === d ? "bg-zinc-700 text-zinc-300" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
                              }`}
                            >
                              {DURUM_LABEL[d]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
