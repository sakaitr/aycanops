"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  IconDocument, IconClipboard2, IconCoin, IconActivity, IconBarChart,
  IconBuilding, IconArrowUpRight, IconArrowDownRight, IconWallet,
} from "./Icons";

type Kpi = {
  ayGelir: number;
  ayGider: number;
  net: number;
  tahsilEdilecek: number;
  odenecek: number;
  onayBekleyenSayisi: number;
  acikMasrafTalebi: number;
  toplamAcilisBakiyesi: number;
};

function fmtTutar(v: number): string {
  return v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const NAV_CARDS = [
  { href: "/finans/faturalar", label: "Faturalar", desc: "Satış ve alış faturaları", Icon: IconDocument },
  { href: "/finans/fisler", label: "Fişler", desc: "Kasa/banka fişleri, makbuzlar", Icon: IconClipboard2 },
  { href: "/finans/gelir-gider", label: "Gelir-Gider", desc: "Genel gelir ve gider kayıtları", Icon: IconCoin },
  { href: "/finans/masraf-talebi", label: "Masraf Talebi", desc: "Personel masraf talepleri", Icon: IconClipboard2 },
  { href: "/finans/odemeler", label: "Ödemeler", desc: "Tahsilat ve ödeme kayıtları", Icon: IconCoin },
  { href: "/finans/banka-hareketleri", label: "Banka Hareketleri", desc: "Kasa/banka hesap hareketleri", Icon: IconActivity },
  { href: "/hakedis", label: "Hakediş", desc: "İşleten hakediş hesaplamaları", Icon: IconCoin },
  { href: "/mutabakat", label: "Firma Mutabakat", desc: "Firma mutabakat kayıtları", Icon: IconCoin },
  { href: "/kar-zarar", label: "Kâr-Zarar", desc: "Kâr-zarar raporu", Icon: IconBarChart },
  { href: "/butce", label: "Bütçe & Maliyet", desc: "Bütçe ve maliyet takibi", Icon: IconCoin },
  { href: "/isletenler", label: "İşletenler", desc: "Araç tedarikçileri", Icon: IconBuilding },
  { href: "/firmalar", label: "Firmalar", desc: "Müşteri firmalar", Icon: IconBuilding },
  { href: "/finans/belgeler", label: "Finans Belgeleri", desc: "Yüklenen fatura/fiş belgeleri", Icon: IconDocument },
  { href: "/raporlar", label: "Raporlar", desc: "Finans rapor kataloğu", Icon: IconBarChart },
];

function KpiCard({
  title, value, accent, index, suffix = " ₺",
}: {
  title: string;
  value: number;
  accent: "blue" | "red" | "green" | "amber";
  index: number;
  suffix?: string;
}) {
  const accentMap = {
    blue: { text: "text-blue-400", bar: "bg-blue-400", glow: "hover:shadow-blue-500/10" },
    red: { text: "text-red-400", bar: "bg-red-400", glow: "hover:shadow-red-500/10" },
    green: { text: "text-emerald-400", bar: "bg-emerald-400", glow: "hover:shadow-emerald-500/10" },
    amber: { text: "text-amber-400", bar: "bg-amber-400", glow: "hover:shadow-amber-500/10" },
  }[accent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: "easeOut" }}
      className={`group relative bg-zinc-900 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-2.5 overflow-hidden transition-all duration-200 ${accentMap.glow}`}
    >
      <p className="text-xs font-medium text-zinc-500 leading-snug">{title}</p>
      <p className={`text-2xl font-bold tabular-nums leading-none ${accentMap.text}`}>
        {fmtTutar(value)}{suffix}
      </p>
      <div className={`absolute bottom-0 left-0 h-[2px] ${accentMap.bar} opacity-40 group-hover:opacity-70 transition-opacity`} style={{ width: "100%" }} />
    </motion.div>
  );
}

export default function FinansDashboard({ kpi }: { kpi: Kpi }) {
  const netPositive = kpi.net >= 0;

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Finans</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Genel bakış — bu ayın finansal durumu</p>
      </div>

      {/* Hero — net position */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className={`relative overflow-hidden rounded-2xl border p-6 mb-4 ${
          netPositive ? "bg-emerald-500/[0.06] border-emerald-500/20" : "bg-red-500/[0.06] border-red-500/20"
        }`}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${netPositive ? "bg-emerald-500/15" : "bg-red-500/15"}`}>
                <IconWallet size={16} className={netPositive ? "text-emerald-400" : "text-red-400"} />
              </div>
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Bu Ay Net Durum</p>
            </div>
            <div className="flex items-baseline gap-2">
              <p className={`text-4xl font-bold tabular-nums ${netPositive ? "text-emerald-400" : "text-red-400"}`}>
                {netPositive ? "+" : "−"}{fmtTutar(Math.abs(kpi.net))} ₺
              </p>
              {netPositive
                ? <IconArrowUpRight size={20} className="text-emerald-400" />
                : <IconArrowDownRight size={20} className="text-red-400" />}
            </div>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">Gelir</p>
              <p className="text-lg font-semibold text-emerald-400 tabular-nums">{fmtTutar(kpi.ayGelir)} ₺</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">Gider</p>
              <p className="text-lg font-semibold text-red-400 tabular-nums">{fmtTutar(kpi.ayGider)} ₺</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <KpiCard index={0} title="Tahsil Edilecek" value={kpi.tahsilEdilecek} accent="blue" />
        <KpiCard index={1} title="Ödenecek" value={kpi.odenecek} accent="amber" />
        <KpiCard index={2} title="Kasa/Banka Açılış Bakiyesi" value={kpi.toplamAcilisBakiyesi} accent="blue" />
        <KpiCard index={3} title="Onay Bekleyen Kayıt" value={kpi.onayBekleyenSayisi} accent="amber" suffix="" />
      </div>

      {kpi.acikMasrafTalebi > 0 && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="mb-6 flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          <Link href="/finans/masraf-talebi" className="hover:underline">
            {kpi.acikMasrafTalebi} bekleyen masraf talebi var →
          </Link>
        </motion.div>
      )}

      {/* Navigation grid */}
      <p className="text-xs font-semibold text-zinc-600 uppercase tracking-widest mb-3">Finans Modülleri</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {NAV_CARDS.map((card, idx) => (
          <motion.div
            key={card.href}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.15 + idx * 0.03, ease: "easeOut" }}
          >
            <Link
              href={card.href}
              className="group flex flex-col gap-2.5 bg-zinc-900 border border-zinc-800/80 rounded-2xl p-4 h-full hover:border-zinc-700 hover:bg-zinc-800/60 active:scale-[0.98] transition-all duration-200"
            >
              <div className="w-9 h-9 rounded-xl bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center transition-colors">
                <card.Icon size={17} className="text-zinc-400 group-hover:text-zinc-200 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{card.label}</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-snug">{card.desc}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </>
  );
}
