"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

const CRITERIA = [
  { key: "score_punctuality", label: "Dakiklik", desc: "Planlı saate uyum", emoji: "⏰" },
  { key: "score_driving", label: "Sürüş Davranışı", desc: "Güvenli ve kurallara uygun sürüş", emoji: "🚌" },
  { key: "score_communication", label: "Yolcu İletişimi", desc: "Kibarlık ve sürücü davranışı", emoji: "🤝" },
  { key: "score_cleanliness", label: "Araç Temizliği", desc: "İç ve dış temizlik", emoji: "✨" },
  { key: "score_route_compliance", label: "Güzergah Uyumu", desc: "Rota ve durakların takibi", emoji: "🗺️" },
  { key: "score_appearance", label: "Kıyafet & Görünüm", desc: "Kurumsal görünüm", emoji: "👔" },
] as const;

function Stars({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={`text-base ${s <= Math.round(value) ? "text-amber-400" : "text-zinc-700"}`}>★</span>
      ))}
    </div>
  );
}

function ScoreBadge({ value, large }: { value: number; large?: boolean }) {
  const color =
    value >= 4.5 ? "text-emerald-400" :
    value >= 3.5 ? "text-amber-400" :
    value >= 2.5 ? "text-orange-400" :
    "text-red-400";
  return <span className={`font-bold tabular-nums ${color} ${large ? "text-4xl" : "text-sm"}`}>{value.toFixed(1)}</span>;
}

function ScoreBar({ value }: { value: number }) {
  const pct = ((value - 1) / 4) * 100;
  const color = value >= 4.5 ? "bg-emerald-500" : value >= 3.5 ? "bg-amber-500" : value >= 2.5 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function PublicSurucuPage() {
  const params = useParams<{ companyId: string; driverSlug: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!params?.companyId || !params?.driverSlug) return;
    fetch(`/api/public/driver-rating/${params.companyId}/${params.driverSlug}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setData(d);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [params?.companyId, params?.driverSlug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Yükleniyor...</div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-zinc-600 text-4xl mb-4">🚌</div>
          <h1 className="text-white font-bold text-xl mb-2">Sürücü Bulunamadı</h1>
          <p className="text-zinc-500 text-sm">Bu sayfaya ait sürücü değerlendirmesi bulunamadı.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 py-8 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Firma header */}
        <div className="text-center mb-8">
          <div className="text-xs text-zinc-600 uppercase tracking-widest mb-1">Aycan Turizm Değerlendirme Sistemi</div>
          <div className="text-sm text-zinc-400">{data.company?.name}</div>
        </div>

        {/* Driver card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-2xl">
                  🧑‍✈️
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">{data.driver?.name}</h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-mono bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{data.driver?.plate}</span>
                    <span className="text-xs text-zinc-500">{data.count} değerlendirme</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-center shrink-0">
              <ScoreBadge value={data.overall} large />
              <div className="text-xs text-zinc-600 mt-1">genel ortalama</div>
            </div>
          </div>
        </div>

        {/* Criteria averages */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Kriter Ortalamaları</h2>
          <div className="space-y-3">
            {CRITERIA.map(c => (
              <div key={c.key} className="flex items-center gap-3">
                <span className="text-base w-6 text-center shrink-0">{c.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-zinc-300">{c.label}</span>
                    <span className="text-xs text-zinc-500 ml-2 shrink-0">{(data.averages?.[c.key] ?? 0).toFixed(1)}</span>
                  </div>
                  <ScoreBar value={data.averages?.[c.key] ?? 1} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Evaluation history */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Değerlendirme Geçmişi ({data.evaluations?.length ?? 0})
          </h2>
          <div className="space-y-3">
            {(data.evaluations ?? []).map((ev: any, i: number) => {
              const avg = CRITERIA.reduce((s, c) => s + (ev[c.key] ?? 0), 0) / CRITERIA.length;
              return (
                <div key={ev.id ?? i} className="border-t border-zinc-800 pt-3 first:border-0 first:pt-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-zinc-500">📅 {ev.evaluation_date}</div>
                      {ev.route_text && <div className="text-xs text-zinc-600 mt-0.5">🗺 {ev.route_text}</div>}
                      {ev.notes && <div className="text-xs text-zinc-600 mt-1 italic">"{ev.notes}"</div>}
                    </div>
                    <div className="text-center shrink-0">
                      <ScoreBadge value={avg} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 mt-2">
                    {CRITERIA.map(c => (
                      <div key={c.key} className="flex flex-col items-center bg-zinc-800/50 rounded-lg px-2 py-1.5">
                        <span className="text-[10px] text-zinc-600 mb-0.5">{c.label.split(" ")[0]}</span>
                        <Stars value={ev[c.key] ?? 0} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-xs text-zinc-700">
          Aycan Turizm Operasyon Yönetim Sistemi
        </div>
      </div>
    </div>
  );
}
