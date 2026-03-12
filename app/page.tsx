import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { todayIstanbul } from "@/lib/time";
import { isAtLeast } from "@/lib/permissions";
import Badge from "@/components/Badge";
import StatCard from "@/components/StatCard";
import Nav from "@/components/Nav";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const db = getDb();
  const today = todayIstanbul();

  const myTodos = await db
    .prepare(`SELECT * FROM todos WHERE (assigned_to = ? OR created_by = ?) AND status_code != 'done' ORDER BY created_at DESC LIMIT 8`)
    .all(user.id, user.id) as any[];

  const myTickets = await db
    .prepare(`SELECT * FROM tickets WHERE (assigned_to = ? OR created_by = ?) AND status_code NOT IN ('solved','closed') ORDER BY created_at DESC LIMIT 8`)
    .all(user.id, user.id) as any[];

  const todayWorklog = await db
    .prepare("SELECT * FROM worklogs WHERE user_id = ? AND work_date = ?")
    .get(user.id, today) as { id: string; status_code: string; summary: string } | undefined;

  let pendingWorklogs = 0, openTickets = 0, slaBreaches = 0;
  let todayTrips = 0, pendingEntries = 0, todayArrivals = 0, totalActiveVehicles = 0, denetimGerektiren = 0;
  if (isAtLeast(user.role, "yonetici")) {
    pendingWorklogs = (await db.prepare("SELECT COUNT(*) as c FROM worklogs WHERE status_code = 'submitted'").get() as any).c;
    openTickets = (await db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status_code NOT IN ('solved','closed')").get() as any).c;
    slaBreaches = (await db.prepare("SELECT COUNT(*) as c FROM tickets WHERE sla_due_at IS NOT NULL AND sla_due_at < NOW() AND status_code NOT IN ('solved','closed')").get() as any).c;
    try {
      denetimGerektiren = (await db.prepare(`
        SELECT COUNT(*) as c FROM company_vehicles cv
        WHERE cv.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM inspections i
          WHERE i.company_vehicle_id = cv.id
          AND i.inspection_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        )
      `).get() as any)?.c || 0;
    } catch {}
  }
  // Transport stats for all
  try {
    todayTrips = (await db.prepare("SELECT COUNT(*) as c FROM trips WHERE trip_date = ?").get(today) as any)?.c || 0;
    pendingEntries = (await db.prepare("SELECT COUNT(*) as c FROM entry_controls WHERE control_date = ? AND status_code = 'pending'").get(today) as any)?.c || 0;
    todayArrivals = (await db.prepare("SELECT COUNT(*) as c FROM vehicle_arrivals WHERE DATE(arrived_at) = ?").get(today) as any)?.c || 0;
    totalActiveVehicles = (await db.prepare("SELECT COUNT(*) as c FROM company_vehicles WHERE is_active = 1").get() as any)?.c || 0;
  } catch {}

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Kontrol Paneli</h1>
          <p className="text-zinc-500 text-sm mt-1" suppressHydrationWarning>{new Date().toLocaleDateString("tr-TR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard title="Bugün Araç Girişi" value={todayArrivals + (totalActiveVehicles > 0 ? " / " + totalActiveVehicles : "")} accent="green" />
          <StatCard title="Bugün Sefer" value={todayTrips} accent="blue" />
          {isAtLeast(user.role, "yonetici") && denetimGerektiren > 0 && (
            <StatCard title="Denetim Gerektiren" value={denetimGerektiren + " araç"} accent="amber" />
          )}
        </div>

        {isAtLeast(user.role, "yonetici") && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatCard title="Onay Bekleyen" value={pendingWorklogs} accent="blue" />
            <StatCard title="Açık Sorunlar" value={openTickets} accent="amber" />
            <StatCard title="SLA İhlali" value={slaBreaches} accent="red" />
            <StatCard title="Sefer Bekleyen" value={pendingEntries} accent="amber" />
          </div>
        )}

        {/* Quick nav */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {[
            { href: "/seferler", label: "Seferler", desc: "Günlük seferler" },
            { href: "/giris-kontrol", label: "Giriş Kontrol", desc: "Sabah kontrolleri" },
            { href: "/sorunlar", label: "Sorunlar", desc: "Destek talepleri" },
            { href: "/gorevler", label: "Görevler", desc: "Yapılacaklar" },
            { href: "/gunluk", label: "Günlük", desc: "İş günlükleri" },
            ...(isAtLeast(user.role, "yetkili") ? [
              { href: "/araclar", label: "Araçlar", desc: "Filo yönetimi" },
              { href: "/guzergahlar", label: "Güzergahlar", desc: "Hat tanımları" },
              { href: "/denetimler", label: "Denetimler", desc: "Araç kontrolleri" },
            ] : []),
            ...(isAtLeast(user.role, "yonetici") ? [{ href: "/raporlar", label: "Raporlar", desc: "İstatistikler" }] : []),
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 hover:bg-zinc-800 transition-all group"
            >
              <p className="font-semibold text-white text-sm">{item.label}</p>
              <p className="text-zinc-500 text-xs mt-0.5">{item.desc}</p>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's worklog */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Bugünkü Günlük</h2>
              <Link href={`/gunluk/${today}`} className="text-xs text-zinc-500 hover:text-white transition-colors">
                {todayWorklog ? "Düzenle" : "Oluştur"} →
              </Link>
            </div>
            {todayWorklog ? (
              <div>
                <Badge status={todayWorklog.status_code} showLabel />
                <p className="mt-3 text-sm text-zinc-300 leading-relaxed">{todayWorklog.summary}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6">
                <p className="text-zinc-600 text-sm mb-4">Henüz günlük oluşturulmadı</p>
                <Link href={`/gunluk/${today}`} className="bg-white text-zinc-950 text-xs font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors">
                  Günlük Oluştur
                </Link>
              </div>
            )}
          </div>

          {/* My todos */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Görevlerim</h2>
              <Link href="/gorevler" className="text-xs text-zinc-500 hover:text-white transition-colors">Tümü →</Link>
            </div>
            {myTodos.length === 0 ? (
              <p className="text-zinc-600 text-sm py-4 text-center">Görev bulunmuyor</p>
            ) : (
              <ul className="space-y-2">
                {myTodos.slice(0, 5).map((todo: any) => (
                  <li key={todo.id} className="flex items-center gap-2">
                    <Badge status={todo.status_code} />
                    <Link href={`/gorevler/${todo.id}`} className="text-sm text-zinc-300 hover:text-white transition-colors truncate">
                      {todo.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* My tickets */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Üzerimdeki Sorunlar</h2>
              <Link href="/sorunlar" className="text-xs text-zinc-500 hover:text-white transition-colors">Tümü →</Link>
            </div>
            {myTickets.length === 0 ? (
              <p className="text-zinc-600 text-sm py-4 text-center">Sorun bulunmuyor</p>
            ) : (
              <ul className="space-y-2">
                {myTickets.slice(0, 5).map((ticket: any) => (
                  <li key={ticket.id} className="flex items-center gap-2">
                    <Badge status={ticket.priority_code} />
                    <Link href={`/sorunlar/${ticket.ticket_no}`} className="text-sm text-zinc-300 hover:text-white transition-colors truncate">
                      <span className="text-zinc-500 text-xs">{ticket.ticket_no}</span> {ticket.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}