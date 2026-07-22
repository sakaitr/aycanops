"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../_components/PortalShell";

function expiryColor(dateStr: string | null) {
  if (!dateStr) return "";
  const diff = (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "text-red-400 font-semibold";
  if (diff < 30) return "text-amber-400 font-semibold";
  if (diff < 90) return "text-yellow-400";
  return "text-green-400";
}

function expiryBg(dateStr: string | null) {
  if (!dateStr) return "bg-[var(--t-900)]";
  const diff = (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "bg-red-500/10 border border-red-500/30";
  if (diff < 30) return "bg-amber-500/10 border border-amber-500/30";
  return "bg-[var(--t-900)]";
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return "–";
  return new Date(dateStr).toLocaleDateString("tr-TR");
}

function diffLabel(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = Math.round((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)} gün geçti`;
  if (diff === 0) return "Bugün doluyor";
  if (diff < 30) return `${diff} gün kaldı`;
  return null;
}

const DOC_LABELS: Record<string, string> = {
  traffic: "Trafik Sigortası",
  kasko: "Kasko",
  muayene: "Araç Muayene",
  egzoz: "Egzoz Emisyon",
  tachograph: "Takograf",
  ferry_permit: "Feribot İzni",
  other: "Diğer",
};

export default function PortalBelgelerPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "expiring" | "expired">("all");

  useEffect(() => {
    fetch("/api/portal/belgeler")
      .then(r => r.json())
      .then(d => {
        if (!d.ok && d.error === "Yetkisiz") { router.replace("/portal/giris"); return; }
        if (d.ok) setData(d.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  // Group by vehicle plate
  const grouped = data.reduce<Record<string, any[]>>((acc, doc) => {
    const key = doc.plate || "Bilinmeyen";
    if (!acc[key]) acc[key] = [];
    acc[key].push(doc);
    return acc;
  }, {});

  const expiredCount = data.filter(d => d.expiry_date && new Date(d.expiry_date) < new Date()).length;
  const expiringCount = data.filter(d => {
    if (!d.expiry_date) return false;
    const diff = (new Date(d.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff < 30;
  }).length;

  const filteredGrouped = Object.entries(grouped).reduce<Record<string, any[]>>((acc, [plate, docs]) => {
    const filtered = docs.filter(d => {
      if (filter === "all") return true;
      if (!d.expiry_date) return false;
      const diff = (new Date(d.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (filter === "expired") return diff < 0;
      if (filter === "expiring") return diff >= 0 && diff < 30;
      return true;
    });
    if (filtered.length > 0) acc[plate] = filtered;
    return acc;
  }, {});

  return (
    <PortalShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Belgeler</h1>
            <p className="text-xs text-[var(--t-text-500)] mt-0.5">
              {data.length} belge · {Object.keys(grouped).length} araç
              {expiredCount > 0 && <span className="ml-2 text-red-400">· {expiredCount} süresi dolmuş</span>}
              {expiringCount > 0 && <span className="ml-2 text-amber-400">· {expiringCount} yakında dolacak</span>}
            </p>
          </div>
          <div className="flex gap-1.5">
            {([["all", "Tümü"], ["expiring", "Yakında"], ["expired", "Süresi Dolmuş"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 text-xs rounded-xl border transition-colors ${filter === key ? "bg-[var(--t-accent)] text-white border-[var(--t-accent)]" : "border-[var(--t-border-800)] text-[var(--t-text-400)]"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[var(--t-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : Object.keys(filteredGrouped).length === 0 ? (
          <div className="text-center py-12 text-[var(--t-text-500)] text-sm bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl">
            Belge bulunamadı
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(filteredGrouped).map(([plate, docs]) => (
              <div key={plate} className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--t-border-900)] flex items-center gap-2">
                  <svg className="w-4 h-4 text-[var(--t-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <span className="font-semibold text-[var(--foreground)] tracking-wide">{plate}</span>
                  <span className="ml-auto text-xs text-[var(--t-text-500)]">{docs.length} belge</span>
                </div>
                <div className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {docs.map((doc, i) => {
                    const diff = doc.expiry_date
                      ? Math.round((new Date(doc.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                      : null;
                    const badge = diffLabel(doc.expiry_date);
                    return (
                      <div key={i} className={`rounded-lg p-3 ${expiryBg(doc.expiry_date)}`}>
                        <p className="text-xs font-medium text-[var(--foreground)]">
                          {doc.doc_label || DOC_LABELS[doc.doc_type] || doc.doc_type || "Belge"}
                        </p>
                        {doc.doc_type !== doc.doc_label && doc.doc_label && (
                          <p className="text-[10px] text-[var(--t-text-500)]">{DOC_LABELS[doc.doc_type] || doc.doc_type}</p>
                        )}
                        <div className="mt-2 flex items-end justify-between gap-1">
                          <p className={`text-sm ${expiryColor(doc.expiry_date)}`}>
                            {fmtDate(doc.expiry_date)}
                          </p>
                          {badge && (
                            <span className={`text-[10px] rounded-md px-1.5 py-0.5 ${diff !== null && diff < 0 ? "bg-red-400/10 text-red-400" : "bg-amber-400/10 text-amber-400"}`}>
                              {badge}
                            </span>
                          )}
                        </div>
                        {doc.file_url && (
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-[10px] text-[var(--t-accent)] hover:underline"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            Görüntüle
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
