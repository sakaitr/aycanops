"use client";

import type { ChartData, ChartSeries } from "@/lib/reports/queries";

// ─── shared types ─────────────────────────────────────────────────────────────

interface BaseProps { chart: ChartData; width?: number; height?: number }

const PALETTE = [
  "#1E88E5","#43A047","#FB8C00","#E53935","#8E24AA",
  "#00ACC1","#FFD600","#6D4C41","#546E7A","#EC407A",
  "#26A69A","#78909C",
];

function color(s: ChartSeries, i: number) { return s.color ?? PALETTE[i % PALETTE.length]; }

// ─── Bar Chart ────────────────────────────────────────────────────────────────

export function BarChart({ chart, width = 400, height = 200 }: BaseProps) {
  const series = chart.series.slice(0, 18);
  if (series.length === 0) return <Empty title={chart.title} />;

  const maxVal = Math.max(...series.map(s => s.value), 1);
  const padTop = 24;
  const padBottom = 36;
  const padLeft = 8;
  const padRight = 8;
  const chartH = height - padTop - padBottom;
  const barW = (width - padLeft - padRight) / series.length;

  return (
    <figure className="m-0 p-0">
      <figcaption className="text-[11px] font-semibold text-slate-600 mb-1 truncate">{chart.title}</figcaption>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {/* y=0 axis */}
        <line x1={padLeft} y1={padTop + chartH} x2={width - padRight} y2={padTop + chartH} stroke="#CBD5E1" strokeWidth="1" />

        {series.map((s, i) => {
          const bh = Math.max((s.value / maxVal) * chartH, 1);
          const bx = padLeft + i * barW + barW * 0.1;
          const by = padTop + chartH - bh;
          const bw = barW * 0.8;
          const c = color(s, i);
          const lbl = s.label.length > 7 ? s.label.slice(0, 6) + "…" : s.label;
          return (
            <g key={i}>
              <rect x={bx} y={by} width={bw} height={bh} fill={c} rx="2" opacity="0.88">
                <title>{s.label}: {s.value}</title>
              </rect>
              {bh > 14 && (
                <text x={bx + bw / 2} y={by + 10} textAnchor="middle" fontSize="7" fill="#fff" fontWeight="600">{s.value}</text>
              )}
              {bh <= 14 && (
                <text x={bx + bw / 2} y={by - 2} textAnchor="middle" fontSize="7" fill="#475569">{s.value}</text>
              )}
              <text
                x={bx + bw / 2} y={padTop + chartH + 13}
                textAnchor="middle" fontSize="7" fill="#64748B"
                transform={series.length > 8 ? `rotate(-35,${bx + bw / 2},${padTop + chartH + 13})` : undefined}
              >{lbl}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

// ─── Line Chart ───────────────────────────────────────────────────────────────

export function LineChart({ chart, width = 400, height = 200 }: BaseProps) {
  const series = chart.series.slice(0, 30);
  if (series.length < 2) return <BarChart chart={chart} width={width} height={height} />;

  const maxVal = Math.max(...series.map(s => s.value), 1);
  const padTop = 24;
  const padBottom = 36;
  const padLeft = 32;
  const padRight = 8;
  const chartH = height - padTop - padBottom;
  const chartW = width - padLeft - padRight;
  const stepX = chartW / (series.length - 1);

  const pts = series.map((s, i) => ({
    x: padLeft + i * stepX,
    y: padTop + chartH - (s.value / maxVal) * chartH,
    ...s,
  }));

  const polyline = pts.map(p => `${p.x},${p.y}`).join(" ");
  const area = `${padLeft},${padTop + chartH} ` + polyline + ` ${padLeft + chartW},${padTop + chartH}`;

  return (
    <figure className="m-0 p-0">
      <figcaption className="text-[11px] font-semibold text-slate-600 mb-1 truncate">{chart.title}</figcaption>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {/* grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
          const gy = padTop + chartH * (1 - f);
          return (
            <g key={i}>
              <line x1={padLeft} y1={gy} x2={padLeft + chartW} y2={gy} stroke="#E2E8F0" strokeWidth="1" />
              <text x={padLeft - 2} y={gy + 4} textAnchor="end" fontSize="7" fill="#94A3B8">{Math.round(maxVal * f)}</text>
            </g>
          );
        })}
        {/* area */}
        <polygon points={area} fill={PALETTE[0]} opacity="0.12" />
        {/* line */}
        <polyline points={polyline} fill="none" stroke={PALETTE[0]} strokeWidth="2" />
        {/* dots */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill={PALETTE[0]}>
              <title>{p.label}: {p.value}</title>
            </circle>
            {(series.length <= 8 || i % Math.ceil(series.length / 8) === 0) && (
              <text x={p.x} y={padTop + chartH + 13} textAnchor="middle" fontSize="7" fill="#64748B"
                transform={series.length > 10 ? `rotate(-35,${p.x},${padTop + chartH + 13})` : undefined}
              >{p.label.length > 5 ? p.label.slice(-5) : p.label}</text>
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────

export function DonutChart({ chart, width = 220, height = 180 }: BaseProps) {
  const series = chart.series.filter(s => s.value > 0).slice(0, 10);
  if (series.length === 0) return <Empty title={chart.title} />;

  const total = series.reduce((a, s) => a + s.value, 0);
  const cx = height / 2 + 4;
  const cy = height / 2;
  const outerR = height / 2 - 8;
  const innerR = outerR * 0.55;
  let startAngle = -Math.PI / 2;

  function arcPath(start: number, end: number, or: number, ir: number) {
    const s1 = { x: cx + or * Math.cos(start), y: cy + or * Math.sin(start) };
    const s2 = { x: cx + ir * Math.cos(start), y: cy + ir * Math.sin(start) };
    const e1 = { x: cx + or * Math.cos(end), y: cy + or * Math.sin(end) };
    const e2 = { x: cx + ir * Math.cos(end), y: cy + ir * Math.sin(end) };
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${s1.x} ${s1.y} A ${or} ${or} 0 ${large} 1 ${e1.x} ${e1.y} L ${e2.x} ${e2.y} A ${ir} ${ir} 0 ${large} 0 ${s2.x} ${s2.y} Z`;
  }

  return (
    <figure className="m-0 p-0">
      <figcaption className="text-[11px] font-semibold text-slate-600 mb-1 truncate">{chart.title}</figcaption>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {series.map((s, i) => {
          const angle = (s.value / total) * Math.PI * 2;
          const endAngle = startAngle + angle;
          const path = arcPath(startAngle, endAngle, outerR, innerR);
          startAngle = endAngle;
          return (
            <path key={i} d={path} fill={color(s, i)} opacity="0.88">
              <title>{s.label}: {s.value} ({Math.round(s.value / total * 100)}%)</title>
            </path>
          );
        })}
        {/* center */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#334155">{total}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill="#64748B">toplam</text>
        {/* legend */}
        {series.map((s, i) => {
          const lx = cy * 2 + 12;
          const ly = 8 + i * 16;
          const lbl = s.label.length > 16 ? s.label.slice(0, 15) + "…" : s.label;
          return (
            <g key={i}>
              <rect x={lx} y={ly} width={10} height={10} fill={color(s, i)} rx="2" />
              <text x={lx + 13} y={ly + 9} fontSize="8" fill="#475569">{lbl} ({Math.round(s.value / total * 100)}%)</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

// ─── Radar Chart ──────────────────────────────────────────────────────────────

export function RadarChart({ chart, width = 240, height = 220 }: BaseProps) {
  const series = chart.series.slice(0, 8);
  if (series.length < 3) return <BarChart chart={chart} width={width} height={height} />;

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(cx, cy) - 28;
  const n = series.length;
  const maxVal = Math.max(...series.map(s => s.value), 1);

  function pt(i: number, scale: number) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + r * scale * Math.cos(angle), y: cy + r * scale * Math.sin(angle) };
  }

  const gridLevels = [0.25, 0.5, 0.75, 1];
  const dataPoints = series.map((s, i) => pt(i, s.value / maxVal));
  const polyPoints = dataPoints.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <figure className="m-0 p-0">
      <figcaption className="text-[11px] font-semibold text-slate-600 mb-1 truncate">{chart.title}</figcaption>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* grid */}
        {gridLevels.map((level, li) => {
          const gpts = series.map((_, i) => pt(i, level));
          return <polygon key={li} points={gpts.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#E2E8F0" strokeWidth="1" />;
        })}
        {/* axes */}
        {series.map((_, i) => {
          const tip = pt(i, 1);
          return <line key={i} x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="#CBD5E1" strokeWidth="1" />;
        })}
        {/* data area */}
        <polygon points={polyPoints} fill={PALETTE[0]} opacity="0.22" />
        <polygon points={polyPoints} fill="none" stroke={PALETTE[0]} strokeWidth="2" />
        {/* dots + labels */}
        {dataPoints.map((p, i) => {
          const tipPt = pt(i, 1.18);
          const lbl = series[i].label.length > 10 ? series[i].label.slice(0, 9) + "…" : series[i].label;
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="3" fill={PALETTE[0]}>
                <title>{series[i].label}: {series[i].value}</title>
              </circle>
              <text x={tipPt.x} y={tipPt.y + 4} textAnchor="middle" fontSize="8" fill="#475569">{lbl}</text>
            </g>
          );
        })}
        {/* center dot */}
        <circle cx={cx} cy={cy} r="2" fill="#94A3B8" />
      </svg>
    </figure>
  );
}

// ─── Auto renderer ────────────────────────────────────────────────────────────

export function AutoChart({ chart, width, height }: BaseProps) {
  switch (chart.type) {
    case "bar":   return <BarChart   chart={chart} width={width} height={height} />;
    case "line":  return <LineChart  chart={chart} width={width} height={height} />;
    case "donut": return <DonutChart chart={chart} width={width ?? 220} height={height ?? 180} />;
    case "radar": return <RadarChart chart={chart} width={width ?? 240} height={height ?? 220} />;
    default:      return <BarChart   chart={chart} width={width} height={height} />;
  }
}

function Empty({ title }: { title: string }) {
  return (
    <figure className="m-0 p-0">
      <figcaption className="text-[11px] font-semibold text-slate-600 mb-1 truncate">{title}</figcaption>
      <div className="flex items-center justify-center h-16 text-xs text-slate-400 border border-dashed border-slate-200 rounded">Veri yok</div>
    </figure>
  );
}
