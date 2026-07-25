export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { todayIstanbul } from "@/lib/time";
import Nav from "@/components/Nav";
import FinansDashboard from "@/components/FinansDashboard";

export default async function FinansPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const db = getDb();
  const today = todayIstanbul();
  const ayBasi = today.slice(0, 8) + "01";

  let ayGelir = 0, ayGider = 0;
  let tahsilEdilecek = 0, odenecek = 0;
  let onayBekleyenSayisi = 0, acikMasrafTalebi = 0;
  let toplamAcilisBakiyesi = 0;

  try {
    ayGelir = Number((await db.prepare(
      `SELECT COALESCE(SUM(brut_tutar), 0) AS t FROM finans_gelir_gider
       WHERE tur = 'gelir' AND durum != 'reddedildi' AND belge_tarihi >= ?`
    ).get(ayBasi) as any)?.t || 0);
    ayGider = Number((await db.prepare(
      `SELECT COALESCE(SUM(brut_tutar), 0) AS t FROM finans_gelir_gider
       WHERE tur = 'gider' AND durum != 'reddedildi' AND belge_tarihi >= ?`
    ).get(ayBasi) as any)?.t || 0);
  } catch {}

  try {
    tahsilEdilecek = Number((await db.prepare(
      `SELECT COALESCE(SUM(genel_toplam), 0) AS t FROM finans_fatura
       WHERE tur = 'satis' AND durum != 'iptal' AND odeme_durumu IN ('odenmedi','kismen_odendi')`
    ).get() as any)?.t || 0);
    odenecek = Number((await db.prepare(
      `SELECT COALESCE(SUM(genel_toplam), 0) AS t FROM finans_fatura
       WHERE tur = 'alis' AND durum != 'iptal' AND odeme_durumu IN ('odenmedi','kismen_odendi')`
    ).get() as any)?.t || 0);
  } catch {}

  try {
    const faturaOnay = (await db.prepare(
      `SELECT COUNT(*) AS c FROM finans_fatura WHERE durum = 'onay_bekliyor'`
    ).get() as any)?.c || 0;
    const ggOnay = (await db.prepare(
      `SELECT COUNT(*) AS c FROM finans_gelir_gider WHERE durum = 'onay_bekliyor'`
    ).get() as any)?.c || 0;
    onayBekleyenSayisi = Number(faturaOnay) + Number(ggOnay);
  } catch {}

  try {
    acikMasrafTalebi = Number((await db.prepare(
      `SELECT COUNT(*) AS c FROM finans_masraf_talebi WHERE durum = 'bekliyor'`
    ).get() as any)?.c || 0);
  } catch {}

  try {
    toplamAcilisBakiyesi = Number((await db.prepare(
      `SELECT COALESCE(SUM(acilis_bakiyesi), 0) AS t FROM finans_kasa_banka_hesabi WHERE is_active = 1`
    ).get() as any)?.t || 0);
  } catch {}

  const kpi = {
    ayGelir, ayGider, net: ayGelir - ayGider,
    tahsilEdilecek, odenecek,
    onayBekleyenSayisi, acikMasrafTalebi,
    toplamAcilisBakiyesi,
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <FinansDashboard kpi={kpi} />
      </main>
    </div>
  );
}
