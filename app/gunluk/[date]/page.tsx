"use client";

import { useState, useEffect, use, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import Badge from "@/components/Badge";

const DAYS_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function formatDateFull(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${DAYS_TR[d.getDay()]}, ${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`;
}

interface Row {
  id: string | null;
  title: string;
  isEditing: boolean;
  isSaving: boolean;
}

export default function GunlukDetailPage({ params }: { params: Promise<{ date: string }> }) {
  const router = useRouter();
  const { date } = use(params);
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get("userId") || null; // Manager viewing another user's worklog
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => { router.replace("/login"); });
    fetch("/api/companies").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); });
    fetch("/api/gunluk-sorulari").then(r => r.json()).then(d => { if (d.ok) setSorular(d.data); }).finally(() => setSorularLoading(false));
  }, []);
  const [worklog, setWorklog] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [description, setDescription] = useState("");
  const [descSaved, setDescSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingDesc, setSavingDesc] = useState(false);
  const [workflowUpdating, setWorkflowUpdating] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const [showReturn, setShowReturn] = useState(false);
  const [showLateWarning, setShowLateWarning] = useState(false);
  const [visits, setVisits] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [newVisitCompany, setNewVisitCompany] = useState("");
  const [newVisitNote, setNewVisitNote] = useState("");
  const [newIssue, setNewIssue] = useState("");
  const [savingVisit, setSavingVisit] = useState(false);
  const [savingIssue, setSavingIssue] = useState(false);
  const newRowRef = useRef<HTMLInputElement>(null);

  // Güne Başla — işe başlama check-in soruları
  const [sorular, setSorular] = useState<any[]>([]);
  const [sorularLoading, setSorularLoading] = useState(true);
  const [cevapForm, setCevapForm] = useState<Record<string, any>>({});
  const [detayForm, setDetayForm] = useState<Record<string, any>>({});
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const isOwnWorklog = !targetUserId || targetUserId === user?.id;
  const isEditable = isOwnWorklog && (!worklog || worklog.status_code === "draft" || worklog.status_code === "returned");
  // Check-in kilidi sadece BUGÜN ve kendi günlüğün için geçerli — geçmiş
  // (bu özellikten önce oluşmuş) günlükler checkin_at'siz kalır, onları
  // düzenlerken bu kilide takılmamalı.
  const checkinGateActive = isOwnWorklog && date === today && !worklog?.checkin_at;

  function isLateHour() { return new Date().getHours() >= 22; }

  useEffect(() => { loadWorklog(); }, [date]);

  async function loadWorklog() {
    setLoading(true);
    try {
      const qs = targetUserId ? `?userId=${targetUserId}` : "";
      const res = await fetch(`/api/worklogs/${date}${qs}`);
      const d = await res.json();
      if (d.ok && d.data) {
        setWorklog(d.data);
        setRows((d.data.items || []).map((item: any) => ({
          id: item.id, title: item.title, isEditing: false, isSaving: false,
        })));
        setDescription(d.data.summary || "");
        setDescSaved(d.data.summary || "");
        const prefill: Record<string, any> = {};
        const detayPrefill: Record<string, any> = {};
        for (const c of d.data.cevaplar || []) {
          prefill[c.soru_id] = c.value;
          if (c.detay != null) detayPrefill[c.soru_id] = c.detay;
        }
        setCevapForm(prefill);
        setDetayForm(detayPrefill);
        loadNotes(d.data.id);
      } else {
        setWorklog(null); setRows([]); setDescription(""); setDescSaved("");
        setVisits([]); setIssues([]); setCevapForm({}); setDetayForm({});
      }
    } finally { setLoading(false); }
  }

  async function ensureWorklog(): Promise<boolean> {
    if (worklog) return true;
    try {
      const res = await fetch("/api/worklogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ work_date: date, summary: "" }),
      });
      const d = await res.json();
      if (d.ok) {
        const r2 = await fetch(`/api/worklogs/${date}`);
        const d2 = await r2.json();
        if (d2.ok) { setWorklog(d2.data); return true; }
      }
    } catch {}
    return false;
  }

  function updateCevap(soruId: string, value: any) {
    setCevapForm(f => ({ ...f, [soruId]: value }));
  }

  function toggleChecklistOption(soruId: string, option: string) {
    setCevapForm(f => {
      const current: string[] = Array.isArray(f[soruId]) ? f[soruId] : [];
      const next = current.includes(option) ? current.filter(o => o !== option) : [...current, option];
      return { ...f, [soruId]: next };
    });
  }

  function updateDetay(soruId: string, value: any) {
    setDetayForm(f => ({ ...f, [soruId]: value }));
  }

  function detayTetikleniyor(value: any, tetikleyici: string | null | undefined): boolean {
    if (!tetikleyici) return false;
    if (Array.isArray(value)) return value.includes(tetikleyici);
    return String(value) === tetikleyici;
  }

  async function saveCevaplar() {
    setCheckinError(null);
    setCheckinSaving(true);
    try {
      const cevaplar = sorular.map(s => ({ soru_id: s.id, value: cevapForm[s.id] ?? null, detay: detayForm[s.id] ?? null }));
      const res = await fetch(`/api/worklogs/${date}/cevaplar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cevaplar }),
      });
      const d = await res.json();
      if (!d.ok) { setCheckinError(typeof d.error === "string" ? d.error : "Cevaplar kaydedilemedi"); return; }
      await loadWorklog();
    } finally { setCheckinSaving(false); }
  }

  function addRow() {
    setRows(r => [...r, { id: null, title: "", isEditing: true, isSaving: false }]);
    setTimeout(() => newRowRef.current?.focus(), 30);
  }

  async function commitNewRow(index: number, title: string) {
    const trimmed = title.trim();
    if (!trimmed) { setRows(r => r.filter((_, i) => i !== index)); return; }
    setRows(r => r.map((row, i) => i === index ? { ...row, isSaving: true } : row));
    try {
      const ok = await ensureWorklog();
      if (!ok) { setRows(r => r.filter((_, i) => i !== index)); return; }
      const res = await fetch(`/api/worklogs/${date}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const d = await res.json();
      if (d.ok) {
        setRows(r => r.map((row, i) => i === index
          ? { id: d.data.id, title: trimmed, isEditing: false, isSaving: false } : row));
      } else {
        setRows(r => r.filter((_, i) => i !== index));
      }
    } catch { setRows(r => r.filter((_, i) => i !== index)); }
  }

  async function commitRowEdit(index: number, id: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) { deleteRow(index, id); return; }
    setRows(r => r.map((row, i) => i === index ? { ...row, isSaving: true, isEditing: false } : row));
    try {
      await fetch(`/api/worklogs/${date}/items/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      setRows(r => r.map((row, i) => i === index ? { ...row, title: trimmed, isSaving: false } : row));
    } catch { setRows(r => r.map((row, i) => i === index ? { ...row, isSaving: false } : row)); }
  }

  async function deleteRow(index: number, id: string | null) {
    setRows(r => r.filter((_, i) => i !== index));
    if (id) {
      try { await fetch(`/api/worklogs/${date}/items/${id}`, { method: "DELETE" }); } catch {}
    }
  }

  async function loadNotes(worklogId: string) {
    const res = await fetch(`/api/worklog-notes?worklog_id=${worklogId}`);
    const d = await res.json();
    if (d.ok) { setVisits(d.visits); setIssues(d.issues); }
  }

  async function addVisit() {
    if (!newVisitCompany || !worklog) return;
    setSavingVisit(true);
    try {
      await fetch("/api/worklog-notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "visit", worklog_id: worklog.id, company_id: newVisitCompany, note: newVisitNote }),
      });
      setNewVisitCompany(""); setNewVisitNote("");
      loadNotes(worklog.id);
    } finally { setSavingVisit(false); }
  }

  async function addIssue() {
    if (!newIssue.trim() || !worklog) return;
    setSavingIssue(true);
    try {
      await fetch("/api/worklog-notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "issue", worklog_id: worklog.id, description: newIssue }),
      });
      setNewIssue("");
      loadNotes(worklog.id);
    } finally { setSavingIssue(false); }
  }

  async function deleteVisit(id: number) {
    if (!worklog) return;
    await fetch(`/api/worklog-notes?visit_id=${id}`, { method: "DELETE" });
    loadNotes(worklog.id);
  }

  async function deleteIssue(id: number) {
    if (!worklog) return;
    await fetch(`/api/worklog-notes?issue_id=${id}`, { method: "DELETE" });
    loadNotes(worklog.id);
  }

  async function toggleIssue(id: number, resolved: boolean) {
    if (!worklog) return;
    await fetch("/api/worklog-notes", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue_id: id, resolved }),
    });
    loadNotes(worklog.id);
  }

  async function saveDescription() {
    setSavingDesc(true);
    try {
      const ok = await ensureWorklog();
      if (!ok) return;
      await fetch(`/api/worklogs/${date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: description }),
      });
      setDescSaved(description);
      const r = await fetch(`/api/worklogs/${date}`);
      const d = await r.json();
      if (d.ok) setWorklog(d.data);
    } finally { setSavingDesc(false); }
  }

  async function updateWorkflowStatus(fields: Record<string, any>) {
    setWorkflowUpdating(true);
    try {
      const qs = targetUserId ? `?userId=${targetUserId}` : "";
      await fetch(`/api/worklogs/${date}${qs}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      await loadWorklog();
    } finally { setWorkflowUpdating(false); }
  }

  const descDirty = description !== descSaved;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Link href="/gunluk" className="text-zinc-500 hover:text-white text-sm transition-colors">← Günlükler</Link>
          <span className="text-zinc-800">|</span>
          <h1 className="text-white font-semibold text-sm">{formatDateFull(date)}</h1>
          {date === today && <span className="text-xs text-blue-400 font-medium bg-blue-950 border border-blue-800 px-2 py-0.5 rounded">Bugün</span>}
          {worklog && <Badge status={worklog.status_code} showLabel />}
          {targetUserId && worklog && (
            <span className="text-xs text-zinc-500 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded">
              👤 {(worklog as any).user_name || "Kullanıcı"}
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-zinc-600 text-sm text-center py-16">Yükleniyor...</div>
        ) : (
          <div className="space-y-4">

            {/* Güne Başla — check-in soruları (sadece bugün, check-in yapılmamışsa) */}
            {checkinGateActive && (
              <div className="bg-zinc-900 border border-blue-800/60 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800 bg-blue-950/30">
                  <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Güne Başla</span>
                  <p className="text-zinc-500 text-xs mt-0.5">Sorular cevaplanmadan günlüğün geri kalanına geçilemez.</p>
                </div>
                <div className="p-4 space-y-4">
                  {sorularLoading ? (
                    <p className="text-zinc-600 text-sm">Yükleniyor...</p>
                  ) : sorular.length === 0 ? (
                    <p className="text-zinc-600 text-sm">Tanımlı soru yok — devam edebilirsin.</p>
                  ) : (
                    sorular.map((s: any, idx: number) => {
                      const prevBolum = idx > 0 ? sorular[idx - 1].bolum_baslik : null;
                      const showBolum = s.bolum_baslik && s.bolum_baslik !== prevBolum;
                      const detayAcik = s.detay_label && detayTetikleniyor(cevapForm[s.id], s.detay_tetikleyici);
                      return (
                        <div key={s.id}>
                          {showBolum && (
                            <p className="text-[11px] font-semibold text-blue-400/80 uppercase tracking-widest pt-2 pb-1 first:pt-0">
                              {s.bolum_baslik}
                            </p>
                          )}
                          <label className="block text-sm text-zinc-300 mb-1.5">
                            {s.label}{s.zorunlu && <span className="text-red-400"> *</span>}
                          </label>
                          {s.tip === "evet_hayir" && (
                            <div className="flex gap-2">
                              <button onClick={() => updateCevap(s.id, true)}
                                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${cevapForm[s.id] === true ? "bg-emerald-700 border-emerald-600 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                                Evet
                              </button>
                              <button onClick={() => updateCevap(s.id, false)}
                                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${cevapForm[s.id] === false ? "bg-red-800 border-red-700 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                                Hayır
                              </button>
                            </div>
                          )}
                          {s.tip === "metin" && (
                            <input value={cevapForm[s.id] || ""} onChange={e => updateCevap(s.id, e.target.value)}
                              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                          )}
                          {s.tip === "uzun_metin" && (
                            <textarea value={cevapForm[s.id] || ""} onChange={e => updateCevap(s.id, e.target.value)} rows={3}
                              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
                          )}
                          {s.tip === "checklist" && (
                            <div className="space-y-1.5">
                              {(s.secenekler || []).map((opt: string) => {
                                const checked = Array.isArray(cevapForm[s.id]) && cevapForm[s.id].includes(opt);
                                return (
                                  <label key={opt} className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={checked} onChange={() => toggleChecklistOption(s.id, opt)} className="accent-white" />
                                    <span className="text-sm text-zinc-300">{opt}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          {s.tip === "secim" && (
                            <select value={cevapForm[s.id] || ""} onChange={e => updateCevap(s.id, e.target.value)}
                              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                              <option value="">— Seçin —</option>
                              {(s.secenekler || []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          )}
                          {detayAcik && (
                            <div className="mt-2 pl-3 border-l-2 border-zinc-700">
                              <label className="block text-xs text-zinc-400 mb-1">{s.detay_label}</label>
                              {s.detay_tip !== "uzun_metin" && s.detay_tip !== "secim" && (
                                <input value={detayForm[s.id] || ""} onChange={e => updateDetay(s.id, e.target.value)}
                                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                              )}
                              {s.detay_tip === "uzun_metin" && (
                                <textarea value={detayForm[s.id] || ""} onChange={e => updateDetay(s.id, e.target.value)} rows={2}
                                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
                              )}
                              {s.detay_tip === "secim" && (
                                <select value={detayForm[s.id] || ""} onChange={e => updateDetay(s.id, e.target.value)}
                                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                                  <option value="">— Seçin —</option>
                                  {(s.detay_secenekler || []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  {checkinError && <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2">{checkinError}</p>}
                  <button onClick={saveCevaplar} disabled={checkinSaving || sorularLoading}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors">
                    {checkinSaving ? "Kaydediliyor..." : "Kaydet ve Devam Et"}
                  </button>
                </div>
              </div>
            )}

            {!checkinGateActive && <>
            {worklog?.checkin_at && (
              <p className="text-xs text-zinc-500">
                Güne başlandı: {new Date(worklog.checkin_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}

            {/* Rows table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Planım / Yapılan İşler</span>
                {isEditable && (
                  <button onClick={addRow}
                    className="w-7 h-7 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors text-xl font-light leading-none"
                    title="Yeni satır ekle">+</button>
                )}
              </div>

              {rows.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-zinc-600 text-sm mb-2">{isEditable ? "Henüz satır eklenmedi" : "Kayıt yok"}</p>
                  {isEditable && (
                    <button onClick={addRow} className="text-zinc-500 hover:text-white text-xs underline transition-colors">+ Satır Ekle</button>
                  )}
                </div>
              ) : (
                <div>
                  {rows.map((row, index) => (
                    <div key={row.id ?? `new-${index}`}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/40 last:border-0 group hover:bg-zinc-800/20 transition-colors">
                      <span className="w-5 text-center text-zinc-700 text-xs tabular-nums flex-shrink-0 select-none">{index + 1}</span>

                      {(row.isEditing || row.id === null) ? (
                        <input
                          ref={row.id === null ? newRowRef : undefined}
                          type="text"
                          defaultValue={row.title}
                          placeholder="Firma adı veya yapılan iş..."
                          onKeyDown={e => {
                            const val = (e.target as HTMLInputElement).value;
                            if (e.key === "Enter") {
                              row.id === null ? commitNewRow(index, val) : commitRowEdit(index, row.id, val);
                            }
                            if (e.key === "Escape") {
                              if (row.id === null) setRows(r => r.filter((_, i) => i !== index));
                              else setRows(r => r.map((x, i) => i === index ? { ...x, isEditing: false } : x));
                            }
                          }}
                          onBlur={e => {
                            const val = e.target.value;
                            row.id === null ? commitNewRow(index, val) : commitRowEdit(index, row.id, val);
                          }}
                          disabled={row.isSaving}
                          autoFocus={row.id === null}
                          className="flex-1 bg-transparent text-white text-sm outline-none border-b border-zinc-600 focus:border-zinc-400 py-0.5 placeholder-zinc-600 transition-colors"
                        />
                      ) : (
                        <span
                          className={`flex-1 text-sm py-0.5 ${isEditable ? "cursor-text text-white" : "text-zinc-300"}`}
                          onClick={() => isEditable && setRows(r => r.map((x, i) => i === index ? { ...x, isEditing: true } : x))}
                        >
                          {row.title}
                        </span>
                      )}

                      {row.isSaving && <span className="text-zinc-600 text-xs flex-shrink-0">···</span>}

                      {isEditable && !row.isSaving && (
                        <button onClick={() => deleteRow(index, row.id)}
                          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-all flex-shrink-0 text-base leading-none">×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Gün Sonu Kapaması */}
            <p className="text-[11px] font-semibold text-zinc-600 uppercase tracking-widest pt-2">Gün Sonu Kapaması</p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Açıklama / Sorun Notu</span>
              </div>
              <div className="p-4">
                {isEditable ? (
                  <>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={3}
                      placeholder="Sorun veya özel durum varsa yazın — boş bırakılırsa sorunsuz tamamlandı sayılır"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none placeholder-zinc-600"
                    />
                    {descDirty && (
                      <div className="flex justify-end mt-2">
                        <button onClick={saveDescription} disabled={savingDesc}
                          className="bg-white text-zinc-950 text-xs font-semibold px-4 py-1.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                          {savingDesc ? "Kaydediliyor..." : "Kaydet"}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className={`text-sm ${description ? "text-zinc-300" : "text-emerald-400 italic"}`}>
                    {description || "✓ Sorunsuz tamamlandı"}
                  </p>
                )}
              </div>
            </div>

            {/* Ziyaret Edilen Firmalar */}
            {worklog && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ziyaret Edilen Firmalar</span>
                </div>
                <div className="p-4 space-y-3">
                  {visits.length > 0 && (
                    <div className="space-y-2">
                      {visits.map((v: any) => (
                        <div key={v.id} className="flex items-start gap-2 group">
                          <div className="flex-1 bg-zinc-800 rounded-lg px-3 py-2">
                            <p className="text-white text-sm font-medium">{v.company_name || "Firma"}</p>
                            {v.note && <p className="text-zinc-500 text-xs mt-0.5">{v.note}</p>}
                          </div>
                          {isEditable && (
                            <button onClick={() => deleteVisit(v.id)}
                              className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all text-lg leading-none mt-1.5">×</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {isEditable && (
                    <div className="space-y-2">
                      <select value={newVisitCompany} onChange={e => setNewVisitCompany(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                        <option value="">— Firma seç —</option>
                        {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <input value={newVisitNote} onChange={e => setNewVisitNote(e.target.value)}
                          placeholder="Not (opsiyonel)"
                          className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600" />
                        <button onClick={addVisit} disabled={savingVisit || !newVisitCompany}
                          className="px-4 py-2 bg-zinc-700 text-white text-sm rounded-lg hover:bg-zinc-600 disabled:opacity-40 transition-colors">
                          {savingVisit ? "..." : "Ekle"}
                        </button>
                      </div>
                    </div>
                  )}
                  {visits.length === 0 && !isEditable && (
                    <p className="text-zinc-600 text-sm">Ziyaret kaydı yok</p>
                  )}
                </div>
              </div>
            )}

            {/* Günün Sorunları */}
            {worklog && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Günün Sorunları</span>
                </div>
                <div className="p-4 space-y-3">
                  {issues.length > 0 && (
                    <div className="space-y-2">
                      {issues.map((iss: any) => (
                        <div key={iss.id} className="flex items-start gap-2 group">
                          <button onClick={() => isEditable && toggleIssue(iss.id, !iss.resolved)}
                            className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 transition-colors ${iss.resolved ? "bg-emerald-700 border-emerald-600" : "border-zinc-600 hover:border-zinc-400"}`}>
                            {iss.resolved && <span className="text-white text-xs flex items-center justify-center w-full h-full leading-none">✓</span>}
                          </button>
                          <p className={`flex-1 text-sm ${iss.resolved ? "line-through text-zinc-600" : "text-zinc-300"}`}>{iss.description}</p>
                          {isEditable && (
                            <button onClick={() => deleteIssue(iss.id)}
                              className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all text-lg leading-none">×</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {isEditable && (
                    <div className="flex gap-2">
                      <input value={newIssue} onChange={e => setNewIssue(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") addIssue(); }}
                        placeholder="Sorun / engel yazın..."
                        className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600" />
                      <button onClick={addIssue} disabled={savingIssue || !newIssue.trim()}
                        className="px-4 py-2 bg-zinc-700 text-white text-sm rounded-lg hover:bg-zinc-600 disabled:opacity-40 transition-colors">
                        {savingIssue ? "..." : "Ekle"}
                      </button>
                    </div>
                  )}
                  {issues.length === 0 && !isEditable && (
                    <p className="text-emerald-400 text-sm italic">✓ Sorunsuz tamamlandı</p>
                  )}
                </div>
              </div>
            )}

            </>}

            {/* Manager return note */}
            {!checkinGateActive && worklog?.manager_note && (
              <div className="bg-orange-950/50 border border-orange-800/50 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-orange-400 mb-1">İade Notu</p>
                <p className="text-orange-200 text-sm">{worklog.manager_note}</p>
              </div>
            )}

            {/* Workflow */}
            {!checkinGateActive && worklog && (
              <div className="flex flex-wrap gap-2 pt-1">
                {worklog.status_code === "draft" && (
                  <button
                    onClick={() => isLateHour() ? setShowLateWarning(true) : updateWorkflowStatus({ status_code: "submitted" })}
                    disabled={workflowUpdating}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                    Gönder
                  </button>
                )}
                {worklog.status_code === "returned" && (
                  <button
                    onClick={() => isLateHour() ? setShowLateWarning(true) : updateWorkflowStatus({ status_code: "submitted" })}
                    disabled={workflowUpdating}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                    Yeniden Gönder
                  </button>
                )}
                {worklog.status_code === "submitted" && (user?.role === "yonetici" || user?.role === "admin") && (
                  <>
                    <button onClick={() => updateWorkflowStatus({ status_code: "approved" })} disabled={workflowUpdating}
                      className="bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                      Onayla
                    </button>
                    <button onClick={() => setShowReturn(true)} disabled={workflowUpdating}
                      className="bg-orange-900 hover:bg-orange-800 text-orange-200 text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                      İade Et
                    </button>
                  </>
                )}
                {worklog.status_code === "approved" && (
                  <p className="text-emerald-400 text-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                    Onaylandı · {worklog.approved_at ? new Date(worklog.approved_at).toLocaleString("tr-TR") : ""}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Late submit warning modal */}
      {showLateWarning && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-amber-800/60 rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">⚠️</span>
              <h2 className="text-base font-bold text-amber-400">Geç Gönderim</h2>
            </div>
            <p className="text-zinc-300 text-sm mb-1">Saat <strong className="text-white">22:00</strong>'den sonra gönderiyorsunuz.</p>
            <p className="text-zinc-500 text-xs mb-5">Bu günlük yöneticide <span className="text-amber-400 font-medium">geç gönderildi</span> olarak işaretlenecek.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLateWarning(false)}
                className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button
                onClick={() => { setShowLateWarning(false); updateWorkflowStatus({ status_code: "submitted" }); }}
                className="flex-1 bg-amber-700 hover:bg-amber-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                Yine de Gönder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return modal */}
      {showReturn && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">İade Et</h2>
              <button onClick={() => setShowReturn(false)} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">İade Notu *</label>
              <textarea value={returnNote} onChange={e => setReturnNote(e.target.value)} rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none"
                placeholder="Neden iade ediyorsunuz?" />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowReturn(false)}
                className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button
                onClick={() => { updateWorkflowStatus({ status_code: "returned", manager_note: returnNote }); setShowReturn(false); setReturnNote(""); }}
                disabled={!returnNote.trim()}
                className="flex-1 bg-orange-800 hover:bg-orange-700 text-white text-sm font-semibold py-2.5 rounded-lg disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                İade Et
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
