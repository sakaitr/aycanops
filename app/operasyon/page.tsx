export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { todayIstanbul } from "@/lib/time";
import Nav from "@/components/Nav";
import OperasyonDashboard from "@/components/OperasyonDashboard";

export default async function OperasyonPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const db = getDb();
  const today = todayIstanbul();
  const yediGunSonra = new Date(new Date(today).getTime() + 7 * 86400000).toISOString().slice(0, 10);

  let aktifArac = 0, aktifSurucu = 0, bugunkuGiris = 0, toplamArac = 0, acikGuzergah = 0, bakimiYaklasan = 0;

  try {
    aktifArac = Number((await db.prepare("SELECT COUNT(*) AS c FROM vehicles WHERE status_code = 'active'").get() as any)?.c || 0);
    toplamArac = aktifArac;
  } catch {}

  try {
    aktifSurucu = Number((await db.prepare("SELECT COUNT(*) AS c FROM drivers WHERE status = 'aktif'").get() as any)?.c || 0);
  } catch {}

  try {
    bugunkuGiris = Number((await db.prepare(
      "SELECT COUNT(DISTINCT vehicle_id) AS c FROM vehicle_arrivals WHERE arrival_date = ?"
    ).get(today) as any)?.c || 0);
  } catch {}

  try {
    acikGuzergah = Number((await db.prepare("SELECT COUNT(*) AS c FROM open_routes WHERE status = 'open'").get() as any)?.c || 0);
  } catch {}

  try {
    bakimiYaklasan = Number((await db.prepare(
      "SELECT COUNT(*) AS c FROM vehicle_maintenance WHERE next_service_date IS NOT NULL AND next_service_date BETWEEN ? AND ?"
    ).get(today, yediGunSonra) as any)?.c || 0);
  } catch {}

  const kpi = { aktifArac, aktifSurucu, bugunkuGiris, toplamArac, acikGuzergah, bakimiYaklasan };

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <OperasyonDashboard kpi={kpi} />
      </main>
    </div>
  );
}
