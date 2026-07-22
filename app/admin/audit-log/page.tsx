"use client";
import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";
import { IconHistory, IconSearch } from "@/components/Icons";

interface LogRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
  actor_username: string | null;
  actor_role: string | null;
}

function actionColor(action: string) {
  if (action.includes("create") || action.includes("add")) return "text-emerald-400 bg-emerald-950 border-emerald-800";
  if (action.includes("delete") || action.includes("remove")) return "text-red-400 bg-red-950 border-red-900";
  if (action.includes("update") || action.includes("edit")) return "text-blue-400 bg-blue-950 border-blue-800";
  if (action.includes("login") || action.includes("logout")) return "text-purple-400 bg-purple-950 border-purple-800";
  return "text-zinc-400 bg-zinc-800 border-zinc-700";
}

function entityColor(type: string) {
  const map: Record<string, string> = {
    vehicle: "text-amber-400",
    user: "text-sky-400",
    company: "text-pink-400",
    route: "text-teal-400",
    driver: "text-orange-400",
    passenger: "text-indigo-400",
    task: "text-lime-400",
  };
  return map[type.toLowerCase()] || "text-zinc-400";
}

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return s;
  }
}

export default function AuditLogPage() {
  const [user, setUser] = useState<any>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => setUser(d.user || null));
  }, []);

  const fetchLogs = useCallback(async (p = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p) });
    if (q) params.set("q", q);
    if (entityFilter) params.set("entity", entityFilter);
    if (actionFilter) params.set("action", actionFilter);
    const res = await fetch(`/api/admin/audit-log?${params}`);
    const data = await res.json();
    if (data.ok) {
      setLogs(data.data);
      setPages(data.pages);
      setTotal(data.total);
      if (data.entityTypes.length) setEntityTypes(data.entityTypes);
      if (data.actions.length) setActions(data.actions);
    }
    setLoading(false);
  }, [q, entityFilter, actionFilter]);

  useEffect(() => {
    setPage(1);
    fetchLogs(1);
  }, [fetchLogs]);

  function handlePageChange(p: number) {
    setPage(p);
    fetchLogs(p);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Nav user={user} />
      <main className="p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <IconHistory size={18} className="text-zinc-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Aktivite Günlüğü</h1>
            <p className="text-xs text-zinc-500">Sistem genelinde tüm kullanıcı işlemleri</p>
          </div>
          <div className="ml-auto text-xs text-zinc-600">{total} kayıt</div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px]">
            <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="İşlem, kullanıcı, kayıt ID ara..."
              className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
          >
            <option value="">Tüm Varlıklar</option>
            {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
          >
            <option value="">Tüm İşlemler</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center text-zinc-600 text-sm">Kayıt bulunamadı</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Zaman</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 py-3">Kullanıcı</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 py-3">İşlem</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 py-3">Varlık</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 py-3 hidden lg:table-cell">ID</th>
                    <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 py-3 hidden xl:table-cell">Detaylar</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <>
                      <tr
                        key={log.id}
                        className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition-colors ${i % 2 === 0 ? "" : "bg-zinc-800/10"}`}
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      >
                        <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">{fmtDate(log.created_at)}</td>
                        <td className="px-3 py-3">
                          <div className="text-white text-xs font-medium">{log.actor_name || log.actor_username || "—"}</div>
                          {log.actor_role && <div className="text-zinc-600 text-xs">{log.actor_role}</div>}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-xs font-medium border px-2 py-0.5 rounded-full ${actionColor(log.action)}`}>{log.action}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-xs font-medium ${entityColor(log.entity_type)}`}>{log.entity_type}</span>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <span className="text-xs font-mono text-zinc-600">{log.entity_id ? log.entity_id.slice(0, 8) + "…" : "—"}</span>
                        </td>
                        <td className="px-3 py-3 hidden xl:table-cell">
                          {log.details ? (
                            <span className="text-xs text-zinc-500 truncate max-w-xs block">{JSON.stringify(log.details).slice(0, 60)}</span>
                          ) : <span className="text-zinc-700 text-xs">—</span>}
                        </td>
                      </tr>
                      {expandedId === log.id && log.details && (
                        <tr key={log.id + "_detail"} className="bg-zinc-800/40 border-b border-zinc-800/50">
                          <td colSpan={6} className="px-6 py-4">
                            <pre className="text-xs text-zinc-300 bg-zinc-900 border border-zinc-700 rounded-lg p-3 overflow-x-auto max-h-48 whitespace-pre-wrap">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Önceki
            </button>
            <span className="text-xs text-zinc-500">{page} / {pages}</span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= pages}
              className="px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Sonraki →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
