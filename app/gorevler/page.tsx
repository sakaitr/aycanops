"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import Badge from "@/components/Badge";

const TODO_STATUSES = [
  { code: "todo", label: "Yapılacak" },
  { code: "doing", label: "Yapılıyor" },
  { code: "blocked", label: "Engellendi" },
  { code: "done", label: "Tamamlandı" },
];

const TICKET_STATUSES = [
  { code: "open", label: "Açık" },
  { code: "in_progress", label: "İşlemde" },
  { code: "waiting", label: "Bekliyor" },
  { code: "solved", label: "Çözüldü" },
  { code: "closed", label: "Kapalı" },
];

function timeAgo(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}d`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function IsTakibiContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") ?? "gorevler";

  const [user, setUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); }).catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/api/users?simple=1").then(r => r.json()).then(d => { if (d.ok) setUsers(d.data); }).catch(() => {});
  }, []);

  // ── Görevler (todos) state ──
  const [todos, setTodos] = useState<any[]>([]);
  const [todosLoading, setTodosLoading] = useState(false);
  const [todoFilter, setTodoFilter] = useState("");
  const [todoSearch, setTodoSearch] = useState("");
  const [showTodoCreate, setShowTodoCreate] = useState(false);
  const [todoCreating, setTodoCreating] = useState(false);
  const [todoForm, setTodoForm] = useState({ title: "", description: "", priority_code: "med", due_date: "", assigned_to: "" });

  // ── Sorunlar (tickets) state ──
  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketFilter, setTicketFilter] = useState("");
  const [ticketSearch, setTicketSearch] = useState("");
  const [showTicketCreate, setShowTicketCreate] = useState(false);
  const [ticketCreating, setTicketCreating] = useState(false);
  const [ticketForm, setTicketForm] = useState({ title: "", description: "", priority_code: "med", assigned_to: "" });

  // ── Rapor state ──
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [rptStart, setRptStart] = useState(firstOfMonth);
  const [rptEnd, setRptEnd] = useState(today);

  useEffect(() => { if (tab === "rapor") loadReport(); }, [tab]);

  async function loadReport() {
    setReportLoading(true);
    try {
      const p = new URLSearchParams({ startDate: rptStart, endDate: rptEnd });
      const res = await fetch(`/api/reports/is-takibi?${p}`);
      const d = await res.json();
      if (d.ok) setReportData(d.data);
    } finally {
      setReportLoading(false);
    }
  }

  useEffect(() => { if (tab === "gorevler") loadTodos(); }, [tab, todoFilter]);
  useEffect(() => { if (tab === "sorunlar") loadTickets(); }, [tab, ticketFilter]);

  async function loadTodos() {
    setTodosLoading(true);
    try {
      const p = new URLSearchParams();
      if (todoFilter) p.set("status", todoFilter);
      p.set("viewAll", "1");
      const res = await fetch(`/api/todos?${p}`);
      const d = await res.json();
      if (d.ok) setTodos(d.data);
    } finally {
      setTodosLoading(false);
    }
  }

  async function loadTickets() {
    setTicketsLoading(true);
    try {
      const p = new URLSearchParams();
      if (ticketFilter) p.set("status", ticketFilter);
      const res = await fetch(`/api/tickets?${p}`);
      const d = await res.json();
      if (d.ok) setTickets(d.data);
    } finally {
      setTicketsLoading(false);
    }
  }

  async function createTodo() {
    if (!todoForm.title.trim()) return;
    setTodoCreating(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...todoForm, assigned_to: todoForm.assigned_to || undefined }),
      });
      const d = await res.json();
      if (d.ok) { setShowTodoCreate(false); setTodoForm({ title: "", description: "", priority_code: "med", due_date: "", assigned_to: "" }); loadTodos(); }
    } finally {
      setTodoCreating(false);
    }
  }

  async function createTicket() {
    if (!ticketForm.title.trim()) return;
    setTicketCreating(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ticketForm, assigned_to: ticketForm.assigned_to || undefined }),
      });
      const d = await res.json();
      if (d.ok) { setShowTicketCreate(false); setTicketForm({ title: "", description: "", priority_code: "med", assigned_to: "" }); loadTickets(); }
    } finally {
      setTicketCreating(false);
    }
  }

  async function deleteTodo(id: string) {
    if (!confirm("Bu görevi silmek istediğinizden emin misiniz?")) return;
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
    loadTodos();
  }

  async function deleteTicket(ticketNo: string) {
    if (!confirm("Bu sorunu silmek istediğinizden emin misiniz?")) return;
    await fetch(`/api/tickets/${ticketNo}`, { method: "DELETE" });
    loadTickets();
  }

  const isManager = user && ["yetkili", "yonetici", "admin"].includes(user.role);
  const isAdmin = user && ["yonetici", "admin"].includes(user.role);

  const filteredTodos = todos.filter(t => !todoSearch || t.title.toLowerCase().includes(todoSearch.toLowerCase()));
  const filteredTickets = tickets.filter(t => !ticketSearch || t.title.toLowerCase().includes(ticketSearch.toLowerCase()));

  function setTab(t: string) { router.push(`/gorevler?tab=${t}`); }

  function fmtHours(h: number | null): string {
    if (h === null || h === undefined) return "—";
    if (h < 1) return `${Math.round(h * 60)} dk`;
    if (h < 24) {
      const hh = Math.floor(h);
      const mm = Math.round((h - hh) * 60);
      return mm > 0 ? `${hh}sa ${mm}dk` : `${hh} saat`;
    }
    const days = h / 24;
    if (days < 1.5) return `${Math.round(h)} saat`;
    return `${days.toFixed(1)} gün`;
  }

  function pct(val: number, total: number) {
    if (!total) return 0;
    return Math.round((val / total) * 100);
  }

  const STATUS_TR: Record<string,string> = {
    todo: "Yapılacak", doing: "Yapılıyor", blocked: "Engellendi", done: "Tamamlandı",
    open: "Açık", in_progress: "İşlemde", waiting: "Bekliyor", solved: "Çözüldü", closed: "Kapalı",
  };
  const PRIORITY_TR: Record<string,string> = {
    critical: "Kritik", high: "Yüksek", med: "Orta", low: "Düşük",
  };
  const PRIORITY_COLOR: Record<string,string> = {
    critical: "bg-red-500", high: "bg-orange-500", med: "bg-yellow-500", low: "bg-blue-500",
  };
  const STATUS_BAR_COLOR: Record<string,string> = {
    todo: "bg-zinc-500", doing: "bg-blue-500", blocked: "bg-red-500", done: "bg-emerald-500",
    open: "bg-red-500", in_progress: "bg-blue-500", waiting: "bg-yellow-500", solved: "bg-emerald-500", closed: "bg-zinc-500",
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">İş Takibi</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {tab === "gorevler" ? `${filteredTodos.length} görev` : tab === "sorunlar" ? `${filteredTickets.length} sorun` : "Rapor"}
            </p>
          </div>
          {tab !== "rapor" && (
            <button
              onClick={() => tab === "gorevler" ? setShowTodoCreate(true) : setShowTicketCreate(true)}
              className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors"
            >
              {tab === "gorevler" ? "+ Yeni Görev" : "+ Yeni Sorun"}
            </button>
          )}
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 mb-6 border-b border-zinc-800 pb-0">
          {[{ key: "gorevler", label: "Görevler" }, { key: "sorunlar", label: "Sorunlar" }, { key: "rapor", label: "Rapor" }].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.key
                  ? "border-white text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── GÖREVLER TAB ── */}
        {tab === "gorevler" && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-5">
              <input
                type="text"
                placeholder="Ara..."
                value={todoSearch}
                onChange={e => setTodoSearch(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-600 w-44 placeholder-zinc-600"
              />
              <div className="flex gap-1 flex-wrap">
                {[{ value: "", label: "Tümü" }, ...TODO_STATUSES.map(s => ({ value: s.code, label: s.label }))].map(o => (
                  <button
                    key={o.value}
                    onClick={() => setTodoFilter(o.value)}
                    className={`text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                      todoFilter === o.value
                        ? "bg-white text-zinc-950"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {todosLoading ? (
              <div className="flex items-center justify-center py-24">
                <div className="text-zinc-600 text-sm">Yükleniyor...</div>
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                {filteredTodos.length === 0 ? (
                  <div className="py-16 text-center text-zinc-600 text-sm">Kayıt bulunamadı</div>
                ) : filteredTodos.map((todo, i) => (
                  <div
                    key={todo.id}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors ${i < filteredTodos.length - 1 ? "border-b border-zinc-800/50" : ""}`}
                  >
                    <Badge status={todo.status_code} showLabel />
                    <Link href={`/gorevler/${todo.id}`} className="text-white text-sm hover:text-zinc-300 transition-colors flex-1 font-medium truncate">
                      {todo.title}
                    </Link>
                    {todo.priority_code && <Badge status={todo.priority_code} showLabel />}
                    {todo.due_date && (
                      <span className={`text-xs hidden sm:block ${new Date(todo.due_date) < new Date() && todo.status_code !== "done" ? "text-red-400" : "text-zinc-500"}`}>
                        {new Date(todo.due_date).toLocaleDateString("tr-TR")}
                      </span>
                    )}
                    <span className="text-zinc-600 text-xs hidden sm:block w-24 truncate text-right">{todo.assigned_name || "—"}</span>
                    <span className="text-zinc-700 text-xs hidden md:block">{timeAgo(todo.created_at)}</span>
                    {isAdmin && (
                      <button
                        onClick={() => deleteTodo(todo.id)}
                        className="text-zinc-700 hover:text-red-400 transition-colors text-base leading-none ml-1 flex-shrink-0"
                        title="Sil"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── SORUNLAR TAB ── */}
        {tab === "sorunlar" && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-5">
              <input
                type="text"
                placeholder="Ara..."
                value={ticketSearch}
                onChange={e => setTicketSearch(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-600 w-44 placeholder-zinc-600"
              />
              <div className="flex gap-1 flex-wrap">
                {[{ value: "", label: "Tümü" }, ...TICKET_STATUSES.map(s => ({ value: s.code, label: s.label }))].map(o => (
                  <button
                    key={o.value}
                    onClick={() => setTicketFilter(o.value)}
                    className={`text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                      ticketFilter === o.value
                        ? "bg-white text-zinc-950"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {ticketsLoading ? (
              <div className="flex items-center justify-center py-24">
                <div className="text-zinc-600 text-sm">Yükleniyor...</div>
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                {/* Table header */}
                <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-zinc-800 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  <span>Başlık</span>
                  <span>Öncelik</span>
                  <span>Durum</span>
                  <span>Atanan</span>
                  <span>Bildiren</span>
                  <span>SLA</span>
                  <span></span>
                </div>
                {filteredTickets.length === 0 ? (
                  <div className="py-16 text-center text-zinc-600 text-sm">Kayıt bulunamadı</div>
                ) : filteredTickets.map((ticket, i) => {
                  const slaBreached = ticket.sla_due_at && new Date(ticket.sla_due_at) < new Date() && !["solved", "closed"].includes(ticket.status_code);
                  return (
                    <div
                      key={ticket.id}
                      className={`flex flex-col md:grid md:grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-2 md:gap-4 px-4 py-3 hover:bg-zinc-800/50 transition-colors items-start md:items-center ${i < filteredTickets.length - 1 ? "border-b border-zinc-800/50" : ""}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-zinc-600 text-xs font-mono flex-shrink-0">{ticket.ticket_no}</span>
                        <Link href={`/sorunlar/${ticket.ticket_no}`} className="text-white text-sm hover:text-zinc-300 transition-colors font-medium truncate">
                          {ticket.title}
                        </Link>
                      </div>
                      <span className="md:hidden"><Badge status={ticket.status_code} showLabel /></span>
                      {ticket.priority_code ? <Badge status={ticket.priority_code} showLabel /> : <span className="text-zinc-700 text-xs">—</span>}
                      <span className="hidden md:block"><Badge status={ticket.status_code} showLabel /></span>
                      <span className="text-zinc-400 text-xs truncate max-w-24">{(ticket as any).assigned_name || "—"}</span>
                      <span className="text-zinc-600 text-xs truncate max-w-24 hidden md:block">{(ticket as any).creator_name || "—"}</span>
                      {ticket.sla_due_at ? (
                        <span className={`text-xs ${slaBreached ? "text-red-400 font-semibold" : "text-zinc-500"}`}>
                          {slaBreached ? "⚠ " : ""}{new Date(ticket.sla_due_at).toLocaleDateString("tr-TR")}
                        </span>
                      ) : <span className="text-zinc-700 text-xs">—</span>}
                      {isAdmin ? (
                        <button
                          onClick={() => deleteTicket(ticket.ticket_no)}
                          className="text-zinc-700 hover:text-red-400 transition-colors text-base leading-none"
                          title="Sil"
                        >
                          ✕
                        </button>
                      ) : <span />}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── RAPOR TAB ── */}
        {tab === "rapor" && (
          <>
            {/* Date filter */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Başlangıç</label>
                <input
                  type="date"
                  value={rptStart}
                  onChange={e => setRptStart(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-600"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Bitiş</label>
                <input
                  type="date"
                  value={rptEnd}
                  onChange={e => setRptEnd(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-600"
                />
              </div>
              <button
                onClick={loadReport}
                disabled={reportLoading}
                className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors"
              >
                {reportLoading ? "Yükleniyor..." : "Uygula"}
              </button>
            </div>

            {reportLoading && (
              <div className="flex items-center justify-center py-24">
                <div className="text-zinc-600 text-sm">Rapor hazırlanıyor...</div>
              </div>
            )}

            {!reportLoading && reportData && (() => {
              const td = reportData.todos;
              const tk = reportData.tickets;
              const tdTotal = td.total || 0;
              const tkTotal = tk.total || 0;
              const tdDone = td.done || 0;
              const tdDoing = td.byStatus?.find((s: any) => s.status_code === "doing")?.count ?? 0;
              const tkOpen = tk.byStatus?.find((s: any) => s.status_code === "open")?.count ?? 0;
              const tkResolved = (tk.byStatus?.find((s: any) => s.status_code === "solved")?.count ?? 0)
                               + (tk.byStatus?.find((s: any) => s.status_code === "closed")?.count ?? 0);

              return (
                <div className="space-y-8">

                  {/* ─── GÖREVLER ─── */}
                  <section>
                    <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                      <span className="text-zinc-400">✓</span> Görevler
                    </h2>

                    {/* Stat cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                      {[
                        { label: "Toplam", value: tdTotal, color: "text-white" },
                        { label: "Tamamlandı", value: tdDone, color: "text-emerald-400" },
                        { label: "Yapılıyor", value: tdDoing, color: "text-blue-400" },
                        { label: "Gecikmiş", value: td.overdue || 0, color: "text-red-400" },
                      ].map(c => (
                        <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
                          <p className="text-xs text-zinc-500 mb-1">{c.label}</p>
                          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                          {c.label === "Tamamlandı" && tdTotal > 0 && (
                            <p className="text-xs text-zinc-600 mt-0.5">%{pct(tdDone, tdTotal)}</p>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* Durum dağılımı */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Durum Dağılımı</p>
                        <div className="space-y-2.5">
                          {td.byStatus?.map((s: any) => (
                            <div key={s.status_code}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-zinc-300 text-xs">{STATUS_TR[s.status_code] || s.status_code}</span>
                                <span className="text-zinc-400 text-xs font-semibold">{s.count} <span className="text-zinc-600">(%{pct(s.count, tdTotal)})</span></span>
                              </div>
                              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${STATUS_BAR_COLOR[s.status_code] || "bg-zinc-500"}`} style={{ width: `${pct(s.count, tdTotal)}%` }} />
                              </div>
                            </div>
                          ))}
                          {(!td.byStatus || td.byStatus.length === 0) && <p className="text-zinc-600 text-xs text-center py-4">Veri yok</p>}
                        </div>
                      </div>

                      {/* Öncelik dağılımı */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Öncelik Dağılımı</p>
                        <div className="space-y-2.5">
                          {td.byPriority?.map((p: any) => (
                            <div key={p.priority_code}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-zinc-300 text-xs">{PRIORITY_TR[p.priority_code] || p.priority_code}</span>
                                <span className="text-zinc-400 text-xs font-semibold">{p.count}</span>
                              </div>
                              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${PRIORITY_COLOR[p.priority_code] || "bg-zinc-500"}`} style={{ width: `${pct(p.count, tdTotal)}%` }} />
                              </div>
                            </div>
                          ))}
                          {(!td.byPriority || td.byPriority.length === 0) && <p className="text-zinc-600 text-xs text-center py-4">Veri yok</p>}
                        </div>
                      </div>

                      {/* Kişi bazlı */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Kişi Bazlı</p>
                        {(!td.byAssignee || td.byAssignee.length === 0) ? (
                          <p className="text-zinc-600 text-xs text-center py-4">Veri yok</p>
                        ) : (
                          <div className="space-y-2">
                            {td.byAssignee.slice(0, 8).map((a: any) => (
                              <div key={a.full_name} className="flex items-center justify-between">
                                <span className="text-zinc-300 text-xs truncate max-w-32">{a.full_name}</span>
                                <div className="flex items-center gap-2 text-xs flex-shrink-0">
                                  <span className="text-zinc-500">{a.total}</span>
                                  <span className="text-emerald-500">{a.done}✓</span>
                                  {a.overdue > 0 && <span className="text-red-400">{a.overdue}↓</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* ─── SORUNLAR ─── */}
                  <section>
                    <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                      <span className="text-zinc-400">⚡</span> Sorunlar
                    </h2>

                    {/* Stat cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                      {[
                        { label: "Toplam", value: tkTotal, color: "text-white" },
                        { label: "Açık", value: tkOpen, color: "text-red-400" },
                        { label: "SLA İhlali", value: tk.slaBreaches || 0, color: "text-orange-400" },
                        { label: "Çözüldü / Kapalı", value: tkResolved, color: "text-emerald-400" },
                      ].map(c => (
                        <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
                          <p className="text-xs text-zinc-500 mb-1">{c.label}</p>
                          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                          {c.label === "Çözüldü / Kapalı" && tkTotal > 0 && (
                            <p className="text-xs text-zinc-600 mt-0.5">%{pct(tkResolved, tkTotal)}</p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Çözümlenme süresi — prominent card */}
                    {tk.resolution && tk.resolution.count > 0 && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                          Çözümlenme Süresi
                          <span className="ml-2 normal-case font-normal text-zinc-600">({tk.resolution.count} çözülen sorun · oluşturma → çözülme)</span>
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                          <div className="text-center">
                            <p className="text-3xl font-bold text-white">{fmtHours(tk.resolution.avgHours)}</p>
                            <p className="text-xs text-zinc-500 mt-1">Ortalama</p>
                          </div>
                          <div className="text-center">
                            <p className="text-3xl font-bold text-emerald-400">{fmtHours(tk.resolution.minHours)}</p>
                            <p className="text-xs text-zinc-500 mt-1">En Hızlı</p>
                          </div>
                          <div className="text-center">
                            <p className="text-3xl font-bold text-red-400">{fmtHours(tk.resolution.maxHours)}</p>
                            <p className="text-xs text-zinc-500 mt-1">En Uzun</p>
                          </div>
                        </div>
                        {/* Bucket bars */}
                        {tk.resolution.buckets && tk.resolution.buckets.length > 0 && (
                          <div className="space-y-2 border-t border-zinc-800 pt-4">
                            {tk.resolution.buckets.map((b: any) => (
                              <div key={b.bucket}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-zinc-400 text-xs">{b.bucket}</span>
                                  <span className="text-zinc-400 text-xs font-semibold">{b.count} <span className="text-zinc-600">(%{pct(b.count, tk.resolution.count)})</span></span>
                                </div>
                                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct(b.count, tk.resolution.count)}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {tk.resolution && tk.resolution.count === 0 && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4 text-center text-zinc-600 text-sm">
                        Seçilen tarih aralığında çözülmüş sorun yok — çözümlenme süresi hesaplanamadı
                      </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                      {/* Durum dağılımı */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Durum Dağılımı</p>
                        <div className="space-y-2.5">
                          {tk.byStatus?.map((s: any) => (
                            <div key={s.status_code}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-zinc-300 text-xs">{STATUS_TR[s.status_code] || s.status_code}</span>
                                <span className="text-zinc-400 text-xs font-semibold">{s.count} <span className="text-zinc-600">(%{pct(s.count, tkTotal)})</span></span>
                              </div>
                              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${STATUS_BAR_COLOR[s.status_code] || "bg-zinc-500"}`} style={{ width: `${pct(s.count, tkTotal)}%` }} />
                              </div>
                            </div>
                          ))}
                          {(!tk.byStatus || tk.byStatus.length === 0) && <p className="text-zinc-600 text-xs text-center py-4">Veri yok</p>}
                        </div>
                      </div>

                      {/* Öncelik dağılımı */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Öncelik Dağılımı</p>
                        <div className="space-y-2.5">
                          {tk.byPriority?.map((p: any) => (
                            <div key={p.priority_code}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-zinc-300 text-xs">{PRIORITY_TR[p.priority_code] || p.priority_code}</span>
                                <span className="text-zinc-400 text-xs font-semibold">{p.count}</span>
                              </div>
                              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${PRIORITY_COLOR[p.priority_code] || "bg-zinc-500"}`} style={{ width: `${pct(p.count, tkTotal)}%` }} />
                              </div>
                            </div>
                          ))}
                          {(!tk.byPriority || tk.byPriority.length === 0) && <p className="text-zinc-600 text-xs text-center py-4">Veri yok</p>}
                        </div>
                      </div>

                      {/* Kişi bazlı */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Kişi Bazlı</p>
                        {(!tk.byAssignee || tk.byAssignee.length === 0) ? (
                          <p className="text-zinc-600 text-xs text-center py-4">Veri yok</p>
                        ) : (
                          <div className="space-y-2">
                            {tk.byAssignee.slice(0, 8).map((a: any) => (
                              <div key={a.full_name} className="flex items-center justify-between">
                                <span className="text-zinc-300 text-xs truncate max-w-32">{a.full_name}</span>
                                <div className="flex items-center gap-2 text-xs flex-shrink-0">
                                  <span className="text-zinc-500">{a.total}</span>
                                  <span className="text-emerald-500">{a.resolved}✓</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Aylık trend */}
                    {tk.monthlyTrend && tk.monthlyTrend.length > 0 && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Aylık Trend (Son 6 Ay)</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left">
                                <th className="text-xs font-semibold text-zinc-500 pb-3 pr-8">Ay</th>
                                <th className="text-xs font-semibold text-zinc-500 pb-3 pr-8">Oluşturulan</th>
                                <th className="text-xs font-semibold text-zinc-500 pb-3 pr-8">Çözülen</th>
                                <th className="text-xs font-semibold text-zinc-500 pb-3">Oran</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tk.monthlyTrend.map((m: any) => (
                                <tr key={m.month} className="border-t border-zinc-800/60">
                                  <td className="py-2.5 pr-8 text-zinc-300 font-medium">{m.month}</td>
                                  <td className="py-2.5 pr-8 text-zinc-400">{m.created}</td>
                                  <td className="py-2.5 pr-8 text-emerald-400">{m.solved}</td>
                                  <td className="py-2.5">
                                    {m.created > 0 ? (
                                      <div className="flex items-center gap-2">
                                        <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct(m.solved, m.created)}%` }} />
                                        </div>
                                        <span className="text-zinc-500 text-xs">%{pct(m.solved, m.created)}</span>
                                      </div>
                                    ) : <span className="text-zinc-700 text-xs">—</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </section>

                </div>
              );
            })()}

            {!reportLoading && !reportData && (
              <div className="flex items-center justify-center py-24">
                <div className="text-zinc-600 text-sm">Tarih aralığı seçip "Uygula"ya tıklayın</div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Create Todo Modal ── */}
      {showTodoCreate && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Yeni Görev</h2>
              <button onClick={() => setShowTodoCreate(false)} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Başlık *</label>
                <input
                  type="text"
                  value={todoForm.title}
                  onChange={e => setTodoForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                  placeholder="Görev başlığı"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Açıklama</label>
                <textarea
                  value={todoForm.description}
                  onChange={e => setTodoForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Öncelik</label>
                  <select
                    value={todoForm.priority_code}
                    onChange={e => setTodoForm(f => ({ ...f, priority_code: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                  >
                    <option value="high">Yüksek</option>
                    <option value="med">Orta</option>
                    <option value="low">Düşük</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Bitiş Tarihi</label>
                  <input
                    type="date"
                    value={todoForm.due_date}
                    onChange={e => setTodoForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
              {isManager && users.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Atanan Kişi</label>
                  <select
                    value={todoForm.assigned_to}
                    onChange={e => setTodoForm(f => ({ ...f, assigned_to: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                  >
                    <option value="">— Atanmamış —</option>
                    {users.map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowTodoCreate(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={createTodo} disabled={todoCreating || !todoForm.title.trim()} className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                {todoCreating ? "Oluşturuluyor..." : "Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Ticket Modal ── */}
      {showTicketCreate && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Yeni Sorun</h2>
              <button onClick={() => setShowTicketCreate(false)} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Başlık *</label>
                <input
                  type="text"
                  value={ticketForm.title}
                  onChange={e => setTicketForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                  placeholder="Sorun başlığı"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Açıklama</label>
                <textarea
                  value={ticketForm.description}
                  onChange={e => setTicketForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none"
                  placeholder="Sorunu detaylı açıklayın..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Öncelik</label>
                <select
                  value={ticketForm.priority_code}
                  onChange={e => setTicketForm(f => ({ ...f, priority_code: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                >
                  <option value="critical">Kritik</option>
                  <option value="high">Yüksek</option>
                  <option value="med">Orta</option>
                  <option value="low">Düşük</option>
                </select>
              </div>
              {isManager && users.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Atanan Kişi</label>
                  <select
                    value={ticketForm.assigned_to}
                    onChange={e => setTicketForm(f => ({ ...f, assigned_to: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                  >
                    <option value="">— Atanmamış —</option>
                    {users.map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowTicketCreate(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={createTicket} disabled={ticketCreating || !ticketForm.title.trim()} className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                {ticketCreating ? "Oluşturuluyor..." : "Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GorevlerPage() {
  return (
    <Suspense>
      <IsTakibiContent />
    </Suspense>
  );
}
