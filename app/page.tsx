export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { todayIstanbul } from "@/lib/time";
import { isAtLeast, getHierarchyLevel } from "@/lib/permissions";
import Badge from "@/components/Badge";
import Nav from "@/components/Nav";
import Link from "next/link";
import DashboardCharts from "@/components/DashboardCharts";
import DashboardStats from "@/components/DashboardStats";
import DashboardRefresher from "@/components/DashboardRefresher";
import DashboardNotifications from "@/components/DashboardNotifications";

export default async function DashboardPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const db = getDb();
  const today = todayIstanbul();

  const myTodos = await db
    .prepare(`SELECT * FROM todos WHERE (assigned_to = ? OR created_by = ?) AND status_code != 'done' ORDER BY created_at DESC LIMIT 8`)
    .all(user.id, user.id) as any[];

  const myNotes = await db
    .prepare("SELECT id, title, content, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 4")
    .all(user.id) as any[];

  const myTickets = await db
    .prepare(`SELECT * FROM tickets WHERE (assigned_to = ? OR created_by = ?) AND status_code NOT IN ('solved','closed') ORDER BY created_at DESC LIMIT 8`)
    .all(user.id, user.id) as any[];

  const todayWorklog = await db
    .prepare("SELECT * FROM worklogs WHERE user_id = ? AND work_date = ?")
    .get(user.id, today) as { id: string; status_code: string; summary: string } | undefined;

  // --- Stat counts ---
  let openTickets = 0, slaBreaches = 0;
  let todayArrivals = 0, totalActiveVehicles = 0, denetimGerektiren = 0;
  let checkedCompanies = 0, uncheckedCompanies = 0, openRoutesCount = 0, openTodosCount = 0;
  let activeTransfers = 0, todayCompletedTransfers = 0;

  try {
    todayArrivals = (await db.prepare(`
      SELECT COUNT(DISTINCT va.vehicle_id) as c
      FROM vehicle_arrivals va
      JOIN company_vehicles cv ON cv.id = va.vehicle_id AND cv.is_active = 1
        AND (COALESCE(cv.is_temporary, 0) = 0 OR cv.added_date = ?)
      WHERE va.arrival_date = ?
    `).get(today, today) as any)?.c || 0;
    totalActiveVehicles = (await db.prepare(`
      SELECT COUNT(*) as c
      FROM company_vehicles cv
      WHERE cv.is_active = 1
        AND (COALESCE(cv.is_temporary, 0) = 0 OR cv.added_date = ?)
    `).get(today) as any)?.c || 0;
    checkedCompanies = (await db.prepare("SELECT COUNT(DISTINCT company_id) as c FROM vehicle_arrivals WHERE arrival_date = ?").get(today) as any)?.c || 0;
    uncheckedCompanies = (await db.prepare(`
      SELECT COUNT(*) as c FROM companies
      WHERE is_active = 1
      AND NOT EXISTS (
        SELECT 1 FROM vehicle_arrivals va
        WHERE va.company_id = companies.id
        AND va.arrival_date = ?
      )
    `).get(today) as any)?.c || 0;
    openTodosCount = (await db.prepare(
      "SELECT COUNT(*) as c FROM todos WHERE (assigned_to = ? OR created_by = ?) AND status_code != 'done'"
    ).get(user.id, user.id) as any)?.c || 0;
    activeTransfers = (await db.prepare("SELECT COUNT(*) as c FROM transfers WHERE status = 'yapiliyor'").get() as any)?.c || 0;
    todayCompletedTransfers = (await db.prepare("SELECT COUNT(*) as c FROM transfers WHERE status = 'tamamlandi' AND DATE(completed_at) = ?").get(today) as any)?.c || 0;
  } catch {}

  try {
    slaBreaches = (await db.prepare("SELECT COUNT(*) as c FROM tickets WHERE sla_due_at IS NOT NULL AND sla_due_at < NOW() AND status_code NOT IN ('solved','closed')").get() as any).c;
  } catch {}

  if (isAtLeast(user.role, "yonetici")) {
    try {
      openTickets = (await db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status_code NOT IN ('solved','closed')").get() as any).c;
      denetimGerektiren = (await db.prepare(`
        SELECT COUNT(*) AS c FROM company_vehicles cv
        WHERE cv.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM inspections i
          WHERE i.company_vehicle_id = cv.id
          AND i.inspection_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        )
      `).get() as any)?.c || 0;
    } catch {}
  }

  try {
    openRoutesCount = (await db.prepare("SELECT COUNT(*) as c FROM open_routes WHERE status = 'open'").get() as any)?.c || 0;
  } catch {}

  const statsData = {
    todayArrivals, totalActiveVehicles,
    checkedCompanies, uncheckedCompanies,
    denetimGerektiren, openTodosCount,
    openTickets, slaBreaches, openRoutesCount,
    activeTransfers, todayCompletedTransfers,
  };

  // Yaklaşan son tarihler (30 gün)
  let upcomingExpiries: { label: string; expiry: string; daysLeft: number; url: string }[] = [];
  try {
    const docExpiries = await db.prepare(`
      SELECT vd.expiry_date, vd.doc_type, v.plate, v.id as vehicle_id
      FROM vehicle_documents vd
      JOIN vehicles v ON v.id = vd.vehicle_id
      WHERE vd.expiry_date IS NOT NULL
        AND vd.expiry_date >= ? AND vd.expiry_date <= DATE_ADD(?, INTERVAL 30 DAY)
      ORDER BY vd.expiry_date ASC LIMIT 10
    `).all(today, today) as any[];
    const docTypeLabels: Record<string, string> = { muayene: "Muayene", sigorta: "Sigorta", ruhsat: "Ruhsat", ehliyet: "Ehliyet", src: "SRC" };
    for (const d of docExpiries) {
      const daysLeft = Math.ceil((new Date(d.expiry_date).getTime() - Date.now()) / 86400000);
      upcomingExpiries.push({ label: `${d.plate} — ${docTypeLabels[d.doc_type] || d.doc_type}`, expiry: d.expiry_date, daysLeft, url: `/araclar/${d.vehicle_id}` });
    }
    const driverExpiries = await db.prepare(`
      SELECT id, name,
        LEAST(
          COALESCE(license_expiry, '9999-12-31'),
          COALESCE(src_expiry, '9999-12-31'),
          COALESCE(psiko_expiry, '9999-12-31'),
          COALESCE(health_expiry, '9999-12-31')
        ) as min_expiry
      FROM drivers
      WHERE status = 'aktif'
        AND LEAST(
          COALESCE(license_expiry, '9999-12-31'),
          COALESCE(src_expiry, '9999-12-31'),
          COALESCE(psiko_expiry, '9999-12-31'),
          COALESCE(health_expiry, '9999-12-31')
        ) BETWEEN ? AND DATE_ADD(?, INTERVAL 30 DAY)
      ORDER BY min_expiry ASC LIMIT 5
    `).all(today, today) as any[];
    for (const d of driverExpiries) {
      const daysLeft = Math.ceil((new Date(d.min_expiry).getTime() - Date.now()) / 86400000);
      upcomingExpiries.push({ label: `Sürücü: ${d.name}`, expiry: d.min_expiry, daysLeft, url: `/suruculer/${d.id}` });
    }
    upcomingExpiries.sort((a, b) => a.daysLeft - b.daysLeft);
    upcomingExpiries = upcomingExpiries.slice(0, 8);
  } catch {}

  // Aktif transferler
  let activeTransferList: { id: string; title: string; company_name: string; started_at: string }[] = [];
  try {
    activeTransferList = await db.prepare(`
      SELECT t.id, t.title, c.name as company_name, t.started_at
      FROM transfers t LEFT JOIN companies c ON c.id = t.company_id
      WHERE t.status = 'yapiliyor'
      ORDER BY t.started_at DESC LIMIT 5
    `).all() as any[];
  } catch {}

  return (
    <div className="min-h-screen bg-zinc-950">
      <DashboardRefresher />
      <Nav user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">
              Merhaba, {user.full_name?.split(" ")[0] || "Merhaba"}
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5" suppressHydrationWarning>
              {new Date().toLocaleDateString("tr-TR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          {/* Quick actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/gunluk/${todayIstanbul()}`}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-300 transition-all">
              Günlük
            </Link>
            <Link href="/gorevler"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-300 transition-all">
              Görevler
            </Link>
            <Link href="/giris-kontrol"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--t-accent)]/10 hover:bg-[var(--t-accent)]/20 border border-[var(--t-accent)]/30 text-xs font-semibold text-[var(--t-accent)] transition-all">
              Giriş Kontrol
            </Link>
          </div>
        </div>

        {/* Denetim alert bar */}
        {isAtLeast(user.role, "yonetici") && denetimGerektiren > 0 && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-red-950/50 border border-red-900/50 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 animate-pulse" />
            <p className="text-sm text-red-300 flex-1 font-medium">
              <span className="font-bold tabular-nums">{denetimGerektiren}</span> araç son 30 günde denetlenmedi
            </p>
            <a href="/denetimler" className="text-xs font-semibold text-red-400 hover:text-red-300 whitespace-nowrap transition-colors">
              Denetimler →
            </a>
          </div>
        )}

        {/* Stat cards — client component (for open-routes modal interactivity) */}
        <DashboardStats stats={statsData} hierarchyLevel={getHierarchyLevel(user.role)} />

        {/* Charts */}
        <DashboardCharts hierarchyLevel={getHierarchyLevel(user.role)} />

        {/* Bottom grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Today's worklog */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
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

          {/* My notes */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Son Notlarım</h2>
              <Link href="/notlar" className="text-xs text-zinc-500 hover:text-white transition-colors">Tümü →</Link>
            </div>
            {myNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6">
                <p className="text-zinc-600 text-sm mb-4">Henüz not yok</p>
                <Link href="/notlar" className="bg-amber-500 text-zinc-950 text-xs font-semibold px-4 py-2 rounded-lg hover:bg-amber-400 transition-colors">
                  Not Oluştur
                </Link>
              </div>
            ) : (
              <ul className="space-y-2">
                {myNotes.map((note: any) => (
                  <li key={note.id}>
                    <Link href="/notlar" className="flex items-start gap-2 group rounded-lg px-2 py-1.5 hover:bg-zinc-800 transition-colors -mx-2">
                      <span className="text-amber-500 text-xs mt-0.5 flex-shrink-0">—</span>
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-300 group-hover:text-white transition-colors truncate">
                          {note.title || <span className="italic text-zinc-600">Başlıksız not</span>}
                        </p>
                        {note.content && (
                          <p className="text-xs text-zinc-600 truncate">
                            {note.content.split("\n").find((l: string) => l.trim())?.slice(0, 60) ?? ""}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* My todos */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
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
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
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

          {/* Yaklaşan Son Tarihler */}
          <div className="bg-zinc-900 border border-amber-900/40 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-amber-500/80 uppercase tracking-wider">Yaklaşan Son Tarihler</h2>
              <span className="text-xs text-zinc-600">Sonraki 30 gün</span>
            </div>
            {upcomingExpiries.length === 0 ? (
              <p className="text-zinc-600 text-sm py-4 text-center">Sonraki 30 günde biten araç belgesi, sürücu belgesi veya sözleşme bulunmuyor ✅</p>
            ) : (
              <ul className="space-y-2">
                {upcomingExpiries.map((e, i) => (
                  <li key={i} className="flex items-center justify-between gap-3">
                    <Link href={e.url} className="text-sm text-zinc-300 hover:text-white truncate transition-colors flex-1">{e.label}</Link>
                    <span className={`text-xs font-medium flex-shrink-0 ${e.daysLeft <= 7 ? "text-red-400" : "text-amber-400"}`}>
                      {e.daysLeft === 0 ? "Bugün" : `${e.daysLeft}g`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Aktif Transferler */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Aktif Transferler</h2>
              <Link href="/transferler" className="text-xs text-zinc-500 hover:text-white transition-colors">Tümü →</Link>
            </div>
            {activeTransferList.length === 0 ? (
              <p className="text-zinc-600 text-sm py-4 text-center">Devam eden transfer bulunmuyor</p>
            ) : (
              <ul className="space-y-2">
                {activeTransferList.map((t: any) => (
                  <li key={t.id}>
                    <Link href={`/transferler/${t.id}`} className="flex items-start gap-2 group rounded-lg px-2 py-1.5 hover:bg-zinc-800 transition-colors -mx-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0 animate-pulse"></span>
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-300 group-hover:text-white truncate">{t.title}</p>
                        {t.company_name && <p className="text-xs text-zinc-600 truncate">{t.company_name}</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Bugünkü Uyarılar */}
          <DashboardNotifications />
        </div>
      </main>
    </div>
  );
}
