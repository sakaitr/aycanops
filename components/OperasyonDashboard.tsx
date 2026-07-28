"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  IconCar, IconUsers, IconMap, IconClock, IconTrafficCone, IconWrench,
  IconSearch, IconAlertTriangle, IconZap, IconBuilding, IconCoin,
} from "./Icons";

type Kpi = {
  aktifArac: number;
  aktifSurucu: number;
  bugunkuGiris: number;
  toplamArac: number;
  acikGuzergah: number;
  bakimiYaklasan: number;
};

const NAV_CARDS = [
  { href: "/araclar", label: "Araçlar", desc: "Araç filosu ve durumları", Icon: IconCar },
  { href: "/suruculer", label: "Sürücüler", desc: "Sürücü kayıtları", Icon: IconUsers },
  { href: "/guzergahlar", label: "Güzergahlar", desc: "Güzergah tanımları", Icon: IconMap },
  { href: "/transferler", label: "Transferler", desc: "Aktif ve tamamlanan transferler", Icon: IconClock },
  { href: "/giris-kontrol", label: "Giriş Kontrol", desc: "Günlük araç giriş takibi", Icon: IconTrafficCone },
  { href: "/bakim", label: "Araç Bakım", desc: "Bakım kayıtları ve planlaması", Icon: IconWrench },
  { href: "/denetimler", label: "Denetimler", desc: "Araç/sürücü denetim kayıtları", Icon: IconSearch },
  { href: "/filo/kazalar", label: "Kazalar", desc: "Filo kaza kayıtları", Icon: IconAlertTriangle },
  { href: "/filo/arizalar", label: "Arızalar", desc: "Filo arıza kayıtları", Icon: IconWrench },
  { href: "/yakit-kartlari", label: "Yakıt Kartları", desc: "Araç yakıt kartı takibi", Icon: IconZap },
  { href: "/yolcular", label: "Yolcular", desc: "Yolcu/personel kayıtları", Icon: IconUsers },
  { href: "/rehberler", label: "Rehberler", desc: "Güzergah rehberleri", Icon: IconUsers },
  { href: "/firmalar", label: "Firmalar", desc: "Hizmet verilen müşteri firmalar", Icon: IconBuilding },
  { href: "/isletenler", label: "İşletenler", desc: "Araç tedarikçileri", Icon: IconBuilding },
  { href: "/hakedis", label: "Hakediş", desc: "İşleten hakediş hesaplamaları", Icon: IconCoin },
  { href: "/rota-planlama", label: "Rota Planlama", desc: "Güzergah optimizasyonu", Icon: IconMap },
];

function KpiCard({
  title, value, accent, index,
}: {
  title: string;
  value: number;
  accent: "blue" | "red" | "green" | "amber";
  index: number;
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
        {value.toLocaleString("tr-TR")}
      </p>
      <div className={`absolute bottom-0 left-0 h-[2px] ${accentMap.bar} opacity-40 group-hover:opacity-70 transition-opacity`} style={{ width: "100%" }} />
    </motion.div>
  );
}

export default function OperasyonDashboard({ kpi }: { kpi: Kpi }) {
  const oran = kpi.toplamArac > 0 ? Math.round((kpi.bugunkuGiris / kpi.toplamArac) * 100) : 0;

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Operasyon</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Genel bakış — sahadaki bugünkü durum</p>
      </div>

      {/* Hero — bugünkü araç girişi */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative overflow-hidden rounded-2xl border p-6 mb-4 bg-blue-500/[0.06] border-blue-500/20"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/15">
                <IconCar size={16} className="text-blue-400" />
              </div>
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Bugünkü Araç Girişi</p>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-4xl font-bold tabular-nums text-blue-400">
                {kpi.bugunkuGiris.toLocaleString("tr-TR")} / {kpi.toplamArac.toLocaleString("tr-TR")}
              </p>
              <span className="text-sm text-zinc-500">araç ({oran}%)</span>
            </div>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">Aktif Sürücü</p>
              <p className="text-lg font-semibold text-white tabular-nums">{kpi.aktifSurucu.toLocaleString("tr-TR")}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">Açık Güzergah</p>
              <p className="text-lg font-semibold text-white tabular-nums">{kpi.acikGuzergah.toLocaleString("tr-TR")}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <KpiCard index={0} title="Aktif Araç" value={kpi.aktifArac} accent="blue" />
        <KpiCard index={1} title="Aktif Sürücü" value={kpi.aktifSurucu} accent="blue" />
        <KpiCard index={2} title="Açık Güzergah" value={kpi.acikGuzergah} accent="amber" />
        <KpiCard index={3} title="Bakımı Yaklaşan Araç" value={kpi.bakimiYaklasan} accent="red" />
      </div>

      {kpi.bakimiYaklasan > 0 && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="mb-6 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
          <Link href="/bakim" className="hover:underline">
            {kpi.bakimiYaklasan} aracın bakımı 7 gün içinde yaklaşıyor →
          </Link>
        </motion.div>
      )}

      {/* Navigation grid */}
      <p className="text-xs font-semibold text-zinc-600 uppercase tracking-widest mb-3">Operasyon Modülleri</p>
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
