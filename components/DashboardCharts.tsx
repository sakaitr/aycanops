"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { isAtLeast, type UserRole } from "@/lib/permissions";

type DashData = {
  arrivalTrend: { day: string; count: number }[];
  todoStats: { status: string; count: number }[];
  inspectionStats: { result: string; count: number }[];
  tripTrend: { day: string; count: number }[];
  vehicleStatus: { total: number; arrivedToday: number };
};

// ── Tiny sparkline (polyline) ──────────────────────────────────────────────
function Sparkline({ data, color, height = 56 }: { data: number[]; color: string; height?: number }) {
  if (!data.length) return null;
  const W = 200, H = height;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * W;
    const y = H - (v / max) * (H - 8) - 4;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`g-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
      />
      {/* Area fill */}
      <polygon
        fill={`url(#g-${color})`}
        points={`0,${H} ${pts} ${W},${H}`}
      />
      {/* Dots */}
      {data.map((v, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * W;
        const y = H - (v / max) * (H - 8) - 4;
        return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
      })}
    </svg>
  );
}

// ── Donut chart (SVG) ──────────────────────────────────────────────────────
const DONUT_COLORS: Record<string, string> = {
  todo: "#60a5fa",
  in_progress: "#f59e0b",
  done: "#34d399",
  blocked: "#f87171",
  pass: "#34d399",
  fail: "#f87171",
  conditional: "#f59e0b",
};
const LABEL_TR: Record<string, string> = {
  todo: "Bekliyor",
  in_progress: "Devam",
  done: "Tamamlandı",
  blocked: "Engelli",
  pass: "Geçti",
  fail: "Başarısız",
  conditional: "Koşullu",
};

function DonutChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <p className="text-zinc-600 text-sm text-center py-6">Veri yok</p>;
  const R = 38, cx = 50, cy = 50, strokeW = 14;
  const circ = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-24 h-24 flex-shrink-0 -rotate-90">
        {slices.map((s, i) => {
          const dash = (s.value / total) * circ;
          const gap = circ - dash;
          const el = (
            <circle
              key={i}
              cx={cx} cy={cy} r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={strokeW}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return el;
        })}
        {/* center hole */}
        <circle cx={cx} cy={cy} r={R - strokeW / 2 - 1} fill="var(--t-900)" />
      </svg>
      <div className="flex flex-col gap-1.5 text-xs min-w-0">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-zinc-400 truncate">{s.label}</span>
            <span className="ml-auto font-semibold text-white pl-2">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bar chart (SVG) ───────────────────────────────────────────────────────
function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const W = 280, H = 80, barW = Math.floor(W / data.length) - 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {data.map((d, i) => {
        const bH = Math.max((d.value / max) * (H - 20), 2);
        const x = i * (W / data.length) + 2;
        const y = H - bH - 18;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bH} rx="3" fill={color} fillOpacity="0.85" />
            <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize="8" fill="#71717a">
              {d.label}
            </text>
            {d.value > 0 && (
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="9" fill="white" fontWeight="600">
                {d.value}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Vehicle gauge ──────────────────────────────────────────────────────────
function VehicleGauge({ arrived, total }: { arrived: number; total: number }) {
  if (total === 0) return <p className="text-zinc-600 text-sm text-center py-4">Araç yok</p>;
  const pct = Math.round((arrived / total) * 100);
  const R = 36, cx = 50, cy = 50, strokeW = 10;
  const circ = 2 * Math.PI * R;
  const filled = (arrived / total) * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--t-800)" strokeWidth={strokeW} />
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#34d399" strokeWidth={strokeW}
            strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-white">{pct}%</span>
        </div>
      </div>
      <p className="text-xs text-zinc-500">{arrived} / {total} araç girdi</p>
    </div>
  );
}

// ── Short day label ────────────────────────────────────────────────────────
const DAYS_TR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
function dayLabel(iso: string) {
  const d = new Date(iso);
  return DAYS_TR[d.getDay()];
}

// ── Main component ─────────────────────────────────────────────────────────
export default function DashboardCharts({ role }: { role: UserRole }) {
  const [data, setData] = useState<DashData | null>(null);

  useEffect(() => {
    fetch("/api/stats/dashboard")
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d.data); })
      .catch(() => {});
  }, []);

  const skeleton = (
    <div className="h-24 bg-zinc-800 rounded-xl animate-pulse" />
  );

  const todoSlices = (data?.todoStats ?? []).map(s => ({
    label: LABEL_TR[s.status] ?? s.status,
    value: Number(s.count),
    color: DONUT_COLORS[s.status] ?? "#71717a",
  }));

  const inspSlices = (data?.inspectionStats ?? []).map(s => ({
    label: LABEL_TR[s.result] ?? s.result,
    value: Number(s.count),
    color: DONUT_COLORS[s.result] ?? "#71717a",
  }));

  const arrivalBarData = (data?.arrivalTrend ?? []).map(d => ({
    label: dayLabel(d.day),
    value: d.count,
  }));

  const tripBarData = (data?.tripTrend ?? []).map(d => ({
    label: dayLabel(d.day),
    value: d.count,
  }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-2">
      {/* Araç Girişi Trendi */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Araç Girişi (7 Gün)</p>
        {data ? (
          <>
            <p className="text-2xl font-bold text-white mb-3">{data.vehicleStatus.arrivedToday}</p>
            <Sparkline data={data.arrivalTrend.map(d => d.count)} color="#34d399" />
            <div className="flex justify-between mt-1">
              {data.arrivalTrend.map((d, i) => (
                <span key={i} className="text-[9px] text-zinc-600">{dayLabel(d.day)}</span>
              ))}
            </div>
          </>
        ) : skeleton}
      </motion.div>

      {/* Sefer Trendi */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.17 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Seferler (7 Gün)</p>
        {data ? (
          <>
            <p className="text-2xl font-bold text-white mb-3">{data.tripTrend[6]?.count ?? 0}</p>
            <Sparkline data={data.tripTrend.map(d => d.count)} color="#60a5fa" />
            <div className="flex justify-between mt-1">
              {data.tripTrend.map((d, i) => (
                <span key={i} className="text-[9px] text-zinc-600">{dayLabel(d.day)}</span>
              ))}
            </div>
          </>
        ) : skeleton}
      </motion.div>

      {/* Görev Durumları */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.24 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Görev Durumu</p>
        {data ? <DonutChart slices={todoSlices} /> : skeleton}
      </motion.div>

      {/* Denetim Sonuçları (yetkili+) or Araç Göstergesi */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.31 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        {isAtLeast(role, "yetkili") ? (
          <>
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Denetim (30 Gün)</p>
            {data ? (
              inspSlices.length > 0
                ? <DonutChart slices={inspSlices} />
                : <p className="text-zinc-600 text-sm text-center py-6">Denetim yok</p>
            ) : skeleton}
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Bugün Araç Girişi</p>
            {data
              ? <VehicleGauge arrived={data.vehicleStatus.arrivedToday} total={data.vehicleStatus.total} />
              : skeleton}
          </>
        )}
      </motion.div>
    </div>
  );
}
