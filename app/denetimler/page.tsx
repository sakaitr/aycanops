"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import Badge from "@/components/Badge";
import AppSelect from "@/components/AppSelect";
import { hasPermission } from "@/lib/permissions";

// --- Wizard adımları ---
// "setup"   : firma, araç, tarih, tip seçimi
// "criteria": kriter kriter ilerle (currentCriterionIdx)
// "summary" : tüm sonuçlar + kaydet

type WizardStep = "setup" | "criteria" | "summary";

interface CheckItem {
  label: string;
  ok: boolean | null;
  note: string;
}

function computeResult(checklist: CheckItem[]): "pending" | "pass" | "fail" {
  if (!checklist.length) return "pending";
  if (!checklist.every(c => c.ok !== null)) return "pending";
  return checklist.every(c => c.ok === true) ? "pass" : "fail";
}

const RESULT_BADGE: Record<string, { label: string; cls: string }> = {
  pending:     { label: "Bekliyor",     cls: "bg-zinc-800 text-zinc-400" },
  pass:        { label: "Geçti ✓",      cls: "bg-emerald-950 text-emerald-400 border border-emerald-800" },
  fail:        { label: "Başarısız ✗",  cls: "bg-red-950 text-red-400 border border-red-800" },
  conditional: { label: "Koşullu ⚠",   cls: "bg-yellow-950 text-yellow-400 border border-yellow-800" },
};

export default function DenetimlerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => { router.replace("/login"); });
  }, []);

  const [inspections, setInspections] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [compVehicles, setCompVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterVehicleId, setFilterVehicleId] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Denetim türleri (API'den)
  const [inspectionTypes, setInspectionTypes] = useState<any[]>([]);

  // Wizard
  const [showForm, setShowForm] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("setup");
  const [currentCriterionIdx, setCurrentCriterionIdx] = useState(0);

  // Setup form
  const [formCompanyId, setFormCompanyId] = useState("");
  const [formPlate, setFormPlate] = useState("");          // serbest plaka girişi
  const [formVehicleId, setFormVehicleId] = useState("");  // eski mod (filo)
  const [formCompVehicleId, setFormCompVehicleId] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formType, setFormType] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Checklist (populated when type selected)
  const [checklist, setChecklist] = useState<CheckItem[]>([]);
  const [criteriaLoading, setCriteriaLoading] = useState(false);

  const [resultOverride, setResultOverride] = useState<"conditional" | null>(null);

  // Denetim fotoğrafları (sadece "summary" adımında seçilir, kayıttan sonra yüklenir)
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [expandedPhotos, setExpandedPhotos] = useState<Record<string, any[]>>({});
  // Soru bazlı fotoğraflar: checklist index -> seçilen dosya
  const [questionPhotos, setQuestionPhotos] = useState<Record<number, File>>({});
  // Fotoğraf yükleme başarısız olup kullanıcı "Kaydet"e tekrar bastığında
  // aynı denetim kaydını yeniden oluşturmamak için, ilk başarılı POST
  // /api/inspections'ın döndürdüğü id burada tutulur.
  const [createdInspectionId, setCreatedInspectionId] = useState<string | null>(null);

  // Görev oluştur modal
  const [gorevModal, setGorevModal] = useState<any | null>(null);
  const [gorevPersonel, setGorevPersonel] = useState("");
  const [gorevDue, setGorevDue] = useState("");
  const [gorevSaving, setGorevSaving] = useState(false);
  const [gorevError, setGorevError] = useState<string | null>(null);
  const [usersForGorev, setUsersForGorev] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Düzenleme modalı — sadece firma/plaka/tarih/tür/not (checklist ve
  // fotoğraflar burada değiştirilmez).
  const [editingInspection, setEditingInspection] = useState<any | null>(null);
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editPlate, setEditPlate] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editType, setEditType] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => { load(); }, [filterVehicleId, filterCompanyId]);
  useEffect(() => {
    fetch("/api/vehicles?limit=9999").then(r => r.json()).then(d => { if (d.ok) setVehicles(d.data); });
    fetch("/api/companies/all-vehicles").then(r => r.json()).then(d => { if (d.ok) setCompVehicles(d.data); });
    fetch("/api/configs/inspection-types").then(r => r.json()).then(d => { if (d.ok) setInspectionTypes(d.data); });
  }, []);

  // İlk tür yüklenince formType'ı set et
  useEffect(() => {
    if (inspectionTypes.length > 0 && !formType) {
      setFormType(inspectionTypes[0].id);
    }
  }, [inspectionTypes]);

  const uniqueCompanies = useMemo(() => {
    const seen = new Set<string>();
    return compVehicles.filter(cv => { if (seen.has(cv.company_id)) return false; seen.add(cv.company_id); return true; });
  }, [compVehicles]);

  const autoResult = useMemo(() => computeResult(checklist), [checklist]);
  const finalResult: string = autoResult === "fail" && resultOverride === "conditional" ? "conditional" : autoResult;

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterVehicleId) params.set("vehicle_id", filterVehicleId);
      if (filterCompanyId) params.set("company_id", filterCompanyId);
      const r = await fetch(`/api/inspections?${params.toString()}`);
      const d = await r.json();
      if (d.ok) setInspections(d.data);
    } finally { setLoading(false); }
  }

  async function deleteInspection(id: string) {
    if (!confirm("Bu denetim kaydı ve fotoğrafları kalıcı olarak silinecek. Emin misiniz?")) return;
    const r = await fetch(`/api/inspections/${id}`, { method: "DELETE" });
    const d = await r.json();
    if (d.ok) {
      setInspections(prev => prev.filter(i => i.id !== id));
      setExpanded(null);
    } else {
      alert(d.error || "Silinemedi");
    }
  }

  function openEditModal(ins: any) {
    setEditingInspection(ins);
    setEditCompanyId(ins.company_id || "");
    setEditPlate(ins.company_vehicle_plate || "");
    setEditDate(ins.inspection_date);
    setEditType(ins.type || "");
    setEditNotes(ins.notes || "");
    setEditError(null);
  }

  async function saveEdit() {
    if (!editingInspection) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/inspections/${editingInspection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: editCompanyId || null,
          company_vehicle_plate: editPlate || null,
          inspection_date: editDate,
          type: editType,
          notes: editNotes,
        }),
      });
      const d = await res.json();
      if (!d.ok) { setEditError(d.error || "Güncellenemedi"); return; }
      setEditingInspection(null);
      load();
    } finally { setEditSaving(false); }
  }

  async function loadCriteriaForType(typeId: string) {
    if (!typeId) { setChecklist([]); return; }
    setCriteriaLoading(true);
    try {
      const r = await fetch(`/api/configs/inspection-types/${typeId}/criteria`);
      const d = await r.json();
      if (d.ok) {
        setChecklist(d.data.map((c: any) => ({ label: c.label, ok: null, note: "" })));
      } else {
        setChecklist([]);
      }
    } finally {
      setCriteriaLoading(false);
    }
  }

  function openForm() {
    const firstType = inspectionTypes[0]?.id || "";
    setFormCompanyId("");
    setFormPlate("");
    setFormVehicleId("");
    setFormCompVehicleId("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormType(firstType);
    setFormNotes("");
    setChecklist([]);
    setResultOverride(null);
    setSaveError(null);
    setPhotoFiles([]);
    setQuestionPhotos({});
    setCreatedInspectionId(null);
    setWizardStep("setup");
    setCurrentCriterionIdx(0);
    setShowForm(true);
    if (firstType) loadCriteriaForType(firstType);
  }

  async function proceedToChecklist() {
    const hasVehicle = formPlate.trim() || formVehicleId || formCompVehicleId;
    if (!hasVehicle || !formType) return;
    // Kriterleri yeniden yükle (tip değişmiş olabilir)
    await loadCriteriaForType(formType);
    setCurrentCriterionIdx(0);
    setWizardStep("criteria");
  }

  function setCheckOk(idx: number, ok: boolean) {
    // Not: "evet" seçilse de kullanıcının yazdığı not silinmez — cevap ne
    // olursa olsun not eklenebilir/kalabilir kalmalı.
    setChecklist(cl => cl.map((c, i) => i === idx ? { ...c, ok } : c));
    if (ok) setResultOverride(null);
  }

  function setQuestionPhoto(idx: number, file: File | null) {
    setQuestionPhotos(prev => {
      const next = { ...prev };
      if (file) next[idx] = file; else delete next[idx];
      return next;
    });
  }

  function setCheckNote(idx: number, note: string) {
    setChecklist(cl => cl.map((c, i) => i === idx ? { ...c, note } : c));
  }

  function canAdvance(idx: number): boolean {
    const item = checklist[idx];
    if (!item) return false;
    if (item.ok === null) return false;
    if (item.ok === false && !item.note.trim()) return false;
    return true;
  }

  function goNext() {
    if (currentCriterionIdx < checklist.length - 1) {
      setCurrentCriterionIdx(i => i + 1);
    } else {
      setWizardStep("summary");
    }
  }

  function goPrev() {
    if (currentCriterionIdx > 0) {
      setCurrentCriterionIdx(i => i - 1);
    } else {
      setWizardStep("setup");
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      // Denetim kaydı daha önce (bu form açıkken) başarıyla oluşturulduysa —
      // örn. fotoğraf yüklemesi başarısız olup kullanıcı "Kaydet"e tekrar
      // bastıysa — aynı kaydı yeniden oluşturmak yerine mevcut id'yi
      // kullanıp doğrudan fotoğraf yüklemesini tekrar dene.
      let inspectionId = createdInspectionId;

      if (!inspectionId) {
        const payload: any = {
          inspection_date: formDate,
          type: inspectionTypes.find(t => t.id === formType)?.code || formType,
          notes: formNotes,
          checklist,
          result: finalResult,
        };
        if (formPlate.trim()) {
          // Serbest plaka modu — firma seçili olabilir veya olmayabilir
          payload.company_vehicle_plate = formPlate.trim().toUpperCase();
          if (formCompanyId && formCompanyId !== "__other__") payload.company_id = formCompanyId;
        } else if (formCompVehicleId) {
          payload.company_vehicle_id = formCompVehicleId;
        } else {
          payload.vehicle_id = formVehicleId;
        }

        const res = await fetch("/api/inspections", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (!d.ok) { setSaveError(d.error || "Kaydetme başarısız"); return; }
        inspectionId = d.data.id;
        setCreatedInspectionId(inspectionId);
      }

      // Genel (özet adımında seçilen) + soru bazlı fotoğraflar tek istekte
      // gönderilir. Her dosyanın hangi soruya ait olduğu (varsa) paralel
      // criterion_index_N alanlarıyla belirtilir; genel fotoğraflarda bu
      // alan boş string olarak gönderilir (NULL = genel).
      const allPhotos: { file: File; criterionIndex: number | null }[] = [
        ...photoFiles.map(f => ({ file: f, criterionIndex: null as number | null })),
        ...Object.entries(questionPhotos).map(([idx, f]) => ({ file: f, criterionIndex: Number(idx) })),
      ];

      if (allPhotos.length > 0) {
        setUploadingPhotos(true);
        try {
          const photoForm = new FormData();
          allPhotos.forEach(({ file, criterionIndex }, i) => {
            photoForm.append("photos", file);
            photoForm.append(`criterion_index_${i}`, criterionIndex === null ? "" : String(criterionIndex));
          });
          const photoRes = await fetch(`/api/inspections/${inspectionId}/photos`, { method: "POST", body: photoForm });
          const photoD = await photoRes.json();
          if (!photoD.ok) {
            // Denetim zaten kaydedildi (createdInspectionId'de tutuluyor),
            // sadece fotoğraf yükleme hatasını göster — "Kaydet"e tekrar
            // basılırsa yeni bir kayıt oluşturulmaz, sadece fotoğraf
            // yüklemesi tekrar denenir.
            setSaveError(`Denetim kaydedildi ancak fotoğraflar yüklenemedi: ${photoD.error}`);
            setUploadingPhotos(false);
            load();
            return;
          }
        } finally { setUploadingPhotos(false); }
      }

      setPhotoFiles([]);
      setQuestionPhotos({});
      setCreatedInspectionId(null);
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  function openGorevModal(ins: any) {
    setGorevModal(ins);
    setGorevPersonel("");
    setGorevDue("");
    setGorevError(null);
    if (usersForGorev.length === 0) {
      fetch("/api/users?simple=1").then(r => r.json()).then(d => { if (d.ok) setUsersForGorev(d.data); });
    }
  }

  async function saveGorev() {
    if (!gorevModal || !gorevPersonel) return;
    setGorevSaving(true);
    setGorevError(null);
    try {
      let cl: any[] = [];
      try { cl = gorevModal.checklist_json ? JSON.parse(gorevModal.checklist_json) : []; } catch {}
      const failedItems = cl.filter((c: any) => c.ok === false);
      const failedDesc = failedItems.map((c: any) => `• ${c.label}${c.note ? ": " + c.note : ""}`).join("\n");
      const plateDisplay = gorevModal.company_vehicle_plate || gorevModal.vehicle_plate || "—";
      const title = `Denetim sorunu: ${plateDisplay}`.slice(0, 200);
      const description = [
        `Denetim Tarihi: ${gorevModal.inspection_date}`,
        `Sonuç: ${gorevModal.result === "fail" ? "Başarısız" : "Koşullu"}`,
        failedDesc ? `\nBaşarısız Kriterler:\n${failedDesc}` : "",
        gorevModal.notes ? `\nNot: ${gorevModal.notes}` : "",
      ].filter(Boolean).join("\n");

      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          priority_code: "high",
          assigned_to: gorevPersonel,
          due_date: gorevDue || null,
        }),
      });
      const d = await res.json();
      if (!d.ok) { setGorevError(d.error || "Görev oluşturulamadı"); return; }
      setGorevModal(null);
    } finally { setGorevSaving(false); }
  }

  const selectedTypeName = inspectionTypes.find(t => t.id === formType)?.label || "";
  const hasVehicle = formPlate.trim() || formVehicleId || formCompVehicleId;
  const currentItem = checklist[currentCriterionIdx];
  const rb = RESULT_BADGE[finalResult] ?? RESULT_BADGE.pending;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Araç Denetimleri</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{inspections.length} kayıt</p>
          </div>
          <button
            onClick={openForm}
            className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors"
          >
            + Denetim Ekle
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <AppSelect
            value={filterVehicleId}
            onChange={v => { setFilterVehicleId(v); setFilterCompanyId(""); }}
            options={[
              { value: "", label: "Tüm Araçlar" },
              ...vehicles.map(v => ({ value: v.id, label: v.plate + (v.driver_name ? ` · ${v.driver_name}` : "") })),
            ]}
            triggerClass="bg-zinc-900 border-zinc-800"
            className="max-w-[200px] min-w-[140px]"
          />
          <AppSelect
            value={filterCompanyId}
            onChange={v => { setFilterCompanyId(v); setFilterVehicleId(""); }}
            options={[
              { value: "", label: "Tüm Firmalar" },
              ...uniqueCompanies.map(cv => ({ value: cv.company_id, label: cv.company_name })),
            ]}
            triggerClass="bg-zinc-900 border-zinc-800"
            className="max-w-[200px] min-w-[140px]"
          />
          {(filterVehicleId || filterCompanyId) && (
            <button onClick={() => { setFilterVehicleId(""); setFilterCompanyId(""); }}
              className="text-xs text-zinc-500 underline hover:text-white">Filtreyi temizle</button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">Yükleniyor...</div>
        ) : inspections.length === 0 ? (
          <div className="py-24 text-center text-zinc-600 text-sm">Denetim kaydı bulunamadı</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {inspections.map((ins, i) => {
              const cl = ins.checklist_json ? JSON.parse(ins.checklist_json) : [];
              const isExpanded = expanded === ins.id;
              const passCount = cl.filter((c: any) => c.ok === true).length;
              const plateDisplay = ins.company_vehicle_plate || ins.vehicle_plate || "—";
              const typeLabel = inspectionTypes.find(t => t.code === ins.type)?.label || ins.type;
              return (
                <div key={ins.id} className={i < inspections.length - 1 ? "border-b border-zinc-800/50" : ""}>
                  <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-zinc-800/30"
                    onClick={() => {
                      const next = isExpanded ? null : ins.id;
                      setExpanded(next);
                      if (next && !expandedPhotos[next]) {
                        fetch(`/api/inspections/${next}/photos`).then(r => r.json()).then(d => {
                          if (d.ok) setExpandedPhotos(prev => ({ ...prev, [next]: d.data }));
                        });
                      }
                    }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-white font-semibold text-sm font-mono">{plateDisplay}</span>
                        {ins.company_name && <span className="bg-zinc-800 text-zinc-400 text-xs px-2 py-0.5 rounded-full">{ins.company_name}</span>}
                        {!ins.company_name && ins.brand && <span className="text-zinc-500 text-xs">{ins.brand} {ins.model}</span>}
                        <Badge status={ins.result} showLabel />
                        <span className="text-zinc-600 text-xs">{typeLabel}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span>{new Date(ins.inspection_date + "T00:00:00").toLocaleDateString("tr-TR")}</span>
                        <span>Denetçi: {ins.inspector_name}</span>
                        {cl.length > 0 && (
                          <span className={passCount === cl.length ? "text-emerald-500" : passCount < cl.length ? "text-red-400" : ""}>
                            {passCount}/{cl.length} geçti
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-zinc-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                  {isExpanded && (
                    <div className="px-5 pb-4 border-t border-zinc-800/40">
                      {cl.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                          {cl.map((c: any, idx: number) => (
                            <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${c.ok === true ? "bg-emerald-950/50 text-emerald-300" : c.ok === false ? "bg-red-950/50 text-red-300" : "bg-zinc-800/50 text-zinc-400"}`}>
                              <span className="text-base">{c.ok === true ? "✓" : c.ok === false ? "✗" : "—"}</span>
                              <span>{c.label}</span>
                              {c.note && <span className="text-xs opacity-60 ml-auto truncate max-w-24">{c.note}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {ins.notes && <p className="text-zinc-500 text-xs mt-3 italic">{ins.notes}</p>}
                      {expandedPhotos[ins.id] && expandedPhotos[ins.id].length > 0 && (
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-3">
                          {expandedPhotos[ins.id].map((p: any) => (
                            <a key={p.id} href={`/api/uploads/denetim/${p.filename}`} target="_blank" rel="noopener noreferrer"
                              className="aspect-square rounded-lg overflow-hidden bg-zinc-800 block">
                              <img src={`/api/uploads/denetim/${p.filename}`} alt="" className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                      {((ins.result === "fail" || ins.result === "conditional") || hasPermission(user, "inspections:delete") || hasPermission(user, "inspections:update")) && (
                        <div className="mt-3 flex justify-end gap-2">
                          {hasPermission(user, "inspections:update") && (
                            <button
                              onClick={e => { e.stopPropagation(); openEditModal(ins); }}
                              className="text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              Düzenle
                            </button>
                          )}
                          {hasPermission(user, "inspections:delete") && (
                            <button
                              onClick={e => { e.stopPropagation(); deleteInspection(ins.id); }}
                              className="text-xs font-semibold bg-zinc-800 hover:bg-red-950 hover:text-red-300 text-zinc-400 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              Sil
                            </button>
                          )}
                          {(ins.result === "fail" || ins.result === "conditional") && (
                            <button
                              onClick={e => { e.stopPropagation(); openGorevModal(ins); }}
                              className="text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              + Görev Oluştur
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── WIZARD MODAL ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg my-auto">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800">
              <h2 className="text-lg font-bold text-white">Denetim Ekle</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
            </div>

            {/* ── ADIM 1: SETUP ── */}
            {wizardStep === "setup" && (
              <div className="p-6 space-y-4">
                {/* Firma */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Firma</label>
                  <AppSelect
                    value={formCompanyId}
                    onChange={setFormCompanyId}
                    options={[
                      { value: "", label: "— Firma seçin (opsiyonel) —" },
                      ...uniqueCompanies.map(cv => ({ value: cv.company_id, label: cv.company_name })),
                    ]}
                  />
                </div>

                {/* Plaka — serbest metin */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Plaka *</label>
                  <input
                    type="text"
                    value={formPlate}
                    onChange={e => setFormPlate(e.target.value.toUpperCase())}
                    placeholder="34 ABC 123"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 font-mono uppercase tracking-widest"
                  />
                </div>

                {/* Tarih + Tip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tarih</label>
                    <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Denetim Tipi</label>
                    <AppSelect
                      value={formType}
                      onChange={v => { setFormType(v); loadCriteriaForType(v); }}
                      options={inspectionTypes.map(t => ({ value: t.id, label: t.label }))}
                    />
                  </div>
                </div>

                {/* Genel not */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Genel Not</label>
                  <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
                </div>

                <div className="flex gap-3 pt-1">
                  <button onClick={() => setShowForm(false)}
                    className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">
                    İptal
                  </button>
                  <button
                    onClick={proceedToChecklist}
                    disabled={!hasVehicle || !formType || criteriaLoading}
                    className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors"
                  >
                    {criteriaLoading ? "Yükleniyor..." : checklist.length === 0 ? "Devam Et (Kritersiz)" : `Devam Et (${checklist.length} kriter)`}
                  </button>
                </div>
              </div>
            )}

            {/* ── ADIM 2: KRİTER WIZARD ── */}
            {wizardStep === "criteria" && checklist.length > 0 && currentItem && (
              <div className="p-6">
                {/* Progress */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-zinc-500">Kriter {currentCriterionIdx + 1} / {checklist.length}</span>
                  <span className="text-xs text-zinc-600">{selectedTypeName}</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-6">
                  <div
                    className="bg-zinc-400 h-1.5 rounded-full transition-all"
                    style={{ width: `${((currentCriterionIdx + 1) / checklist.length) * 100}%` }}
                  />
                </div>

                {/* Kriter kartı */}
                <div className="text-center mb-8">
                  <p className="text-xl font-bold text-white mb-1">{currentItem.label}</p>
                  {currentItem.ok === true && <p className="text-emerald-400 text-sm">✓ Onaylandı</p>}
                  {currentItem.ok === false && <p className="text-red-400 text-sm">✗ Red verildi</p>}
                  {currentItem.ok === null && <p className="text-zinc-500 text-sm">Değerlendirme bekleniyor</p>}
                </div>

                {/* Onay / Red butonları */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <button
                    onClick={() => setCheckOk(currentCriterionIdx, true)}
                    className={`py-5 rounded-xl text-base font-bold transition-all border-2 ${
                      currentItem.ok === true
                        ? "bg-emerald-600 border-emerald-500 text-white scale-105"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-emerald-950 hover:border-emerald-800 hover:text-emerald-300"
                    }`}
                  >
                    ✓ Onayla
                  </button>
                  <button
                    onClick={() => setCheckOk(currentCriterionIdx, false)}
                    className={`py-5 rounded-xl text-base font-bold transition-all border-2 ${
                      currentItem.ok === false
                        ? "bg-red-700 border-red-600 text-white scale-105"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-red-950 hover:border-red-800 hover:text-red-300"
                    }`}
                  >
                    ✗ Red
                  </button>
                </div>

                {/* Açıklama — red verilince zorunlu, onayda da opsiyonel not eklenebilir */}
                {currentItem.ok !== null && (
                  <div className="mb-4">
                    <label className={`block text-xs font-semibold uppercase tracking-wider mb-1 ${currentItem.ok === false ? "text-red-400" : "text-zinc-500"}`}>
                      {currentItem.ok === false ? "Açıklama (zorunlu) *" : "Not (opsiyonel)"}
                    </label>
                    <textarea
                      value={currentItem.note}
                      onChange={e => setCheckNote(currentCriterionIdx, e.target.value)}
                      placeholder={currentItem.ok === false ? "Red nedeni açıklayın..." : "İsterseniz bir not ekleyin..."}
                      rows={currentItem.ok === false ? 3 : 2}
                      autoFocus={currentItem.ok === false}
                      className={`w-full bg-zinc-800 border text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none resize-none ${
                        currentItem.ok === false ? "border-red-800 focus:border-red-600" : "border-zinc-700 focus:border-zinc-500"
                      }`}
                    />
                  </div>
                )}

                {/* Bu soruya özel fotoğraf */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                    Bu Soruya Fotoğraf (opsiyonel)
                  </label>
                  {questionPhotos[currentCriterionIdx] ? (
                    <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
                      <span className="text-zinc-300 text-xs truncate flex-1">{questionPhotos[currentCriterionIdx].name}</span>
                      <button onClick={() => setQuestionPhoto(currentCriterionIdx, null)} className="text-red-400 hover:text-red-300 text-xs font-semibold shrink-0">
                        Kaldır
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 bg-zinc-800 border border-dashed border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-500 text-xs cursor-pointer hover:border-zinc-500 hover:text-zinc-300 transition-colors">
                      📷 Fotoğraf Ekle
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) setQuestionPhoto(currentCriterionIdx, f); }}
                      />
                    </label>
                  )}
                </div>

                {/* İleri / Geri */}
                <div className="flex gap-3">
                  <button onClick={goPrev}
                    className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">
                    ← Geri
                  </button>
                  <button
                    onClick={goNext}
                    disabled={!canAdvance(currentCriterionIdx)}
                    className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors"
                  >
                    {currentCriterionIdx < checklist.length - 1 ? "İleri →" : "Özete Git →"}
                  </button>
                </div>
              </div>
            )}

            {/* Kriterler yok ama setup'tan devam ettik */}
            {wizardStep === "criteria" && checklist.length === 0 && (
              <div className="p-6">
                <p className="text-zinc-400 text-sm text-center py-4">Bu denetim türüne ait kriter tanımlanmamış.</p>
                <div className="flex gap-3">
                  <button onClick={() => setWizardStep("setup")}
                    className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">
                    ← Geri
                  </button>
                  <button onClick={() => setWizardStep("summary")}
                    className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 transition-colors">
                    Özete Git →
                  </button>
                </div>
              </div>
            )}

            {/* ── ADIM 3: ÖZET ── */}
            {wizardStep === "summary" && (
              <div className="p-6">
                {/* Sonuç */}
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-sm text-zinc-400">Sonuç:</span>
                  <span className={`text-sm font-semibold px-3 py-1 rounded-full ${rb.cls}`}>{rb.label}</span>
                  {autoResult === "fail" && resultOverride !== "conditional" && (
                    <button onClick={() => setResultOverride("conditional")}
                      className="text-xs text-yellow-500 underline hover:text-yellow-300">Koşullu onayla</button>
                  )}
                  {resultOverride === "conditional" && (
                    <button onClick={() => setResultOverride(null)} className="text-xs text-zinc-500 underline hover:text-white">Geri al</button>
                  )}
                </div>

                {/* Kriter özeti */}
                {checklist.length > 0 && (
                  <div className="space-y-1.5 mb-5 max-h-60 overflow-y-auto pr-1">
                    {checklist.map((c, idx) => (
                      <div key={idx}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer hover:opacity-80 transition-opacity ${
                          c.ok === true ? "bg-emerald-950/60 text-emerald-300" :
                          c.ok === false ? "bg-red-950/60 text-red-300" :
                          "bg-zinc-800/60 text-zinc-400"
                        }`}
                        onClick={() => { setCurrentCriterionIdx(idx); setWizardStep("criteria"); }}
                      >
                        <span>{c.ok === true ? "✓" : c.ok === false ? "✗" : "—"}</span>
                        <span className="flex-1">{c.label}</span>
                        {c.note && <span className="text-xs opacity-60 truncate max-w-32">{c.note}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Fotoğraf ekle */}
                <div className="mb-5">
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Fotoğraf ekle (opsiyonel, en fazla 12)
                  </label>
                  <label className="flex items-center justify-center gap-2 border border-dashed border-zinc-700 rounded-lg py-3 cursor-pointer hover:border-zinc-500 transition-colors text-sm text-zinc-400">
                    📷 Fotoğraf seç veya çek
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={e => {
                        const files = Array.from(e.target.files || []);
                        setPhotoFiles(prev => [...prev, ...files].slice(0, 12));
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {photoFiles.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      {photoFiles.map((f, idx) => (
                        <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-zinc-800">
                          <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                          <button
                            onClick={() => setPhotoFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute top-1 right-1 bg-black/70 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center"
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {saveError && (
                  <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2 mb-4">{saveError}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (checklist.length > 0) {
                        setCurrentCriterionIdx(checklist.length - 1);
                        setWizardStep("criteria");
                      } else {
                        setWizardStep("setup");
                      }
                    }}
                    className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors"
                  >
                    ← Geri
                  </button>
                  <button
                    onClick={save}
                    disabled={saving || uploadingPhotos}
                    className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors"
                  >
                    {uploadingPhotos ? "Fotoğraflar yükleniyor..." : saving ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── GÖREV OLUŞTUR MODAL ── */}
      {gorevModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800">
              <h2 className="text-lg font-bold text-white">Görev Oluştur</h2>
              <button onClick={() => setGorevModal(null)} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Denetim özeti */}
              <div className="bg-zinc-800 rounded-lg px-4 py-3 text-sm">
                <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">Denetim Özeti</p>
                <p className="text-white font-mono font-semibold text-base">
                  {gorevModal.company_vehicle_plate || gorevModal.vehicle_plate || "—"}
                </p>
                <p className="text-zinc-400 text-xs mt-0.5">
                  {new Date(gorevModal.inspection_date + "T00:00:00").toLocaleDateString("tr-TR")}
                  {" · "}
                  <span className={gorevModal.result === "fail" ? "text-red-400" : "text-yellow-400"}>
                    {gorevModal.result === "fail" ? "Başarısız" : "Koşullu"}
                  </span>
                </p>
                {(() => {
                  try {
                    const cl = gorevModal.checklist_json ? JSON.parse(gorevModal.checklist_json) : [];
                    const failed = cl.filter((c: any) => c.ok === false);
                    if (!failed.length) return null;
                    return (
                      <ul className="mt-2 space-y-0.5">
                        {failed.map((c: any, i: number) => (
                          <li key={i} className="text-red-300 text-xs">✗ {c.label}{c.note ? ` — ${c.note}` : ""}</li>
                        ))}
                      </ul>
                    );
                  } catch { return null; }
                })()}
              </div>

              {/* Personel */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Personel *</label>
                <AppSelect
                  value={gorevPersonel}
                  onChange={setGorevPersonel}
                  options={[
                    { value: "", label: "— Personel seçin —" },
                    ...usersForGorev.map(u => ({ value: u.id, label: u.full_name })),
                  ]}
                />
              </div>

              {/* Termin */}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Termin</label>
                <input type="date" value={gorevDue} onChange={e => setGorevDue(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
              </div>

              {gorevError && (
                <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2">{gorevError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setGorevModal(null)}
                  className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">
                  İptal
                </button>
                <button onClick={saveGorev} disabled={gorevSaving || !gorevPersonel}
                  className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                  {gorevSaving ? "Oluşturuluyor..." : "Oluştur ve Bildir"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DÜZENLEME MODALI ── */}
      {editingInspection && (
        <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg my-auto">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800">
              <h2 className="text-lg font-bold text-white">Denetimi Düzenle</h2>
              <button onClick={() => setEditingInspection(null)} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Firma</label>
                <AppSelect
                  value={editCompanyId}
                  onChange={setEditCompanyId}
                  options={[
                    { value: "", label: "— Firma seçin (opsiyonel) —" },
                    ...uniqueCompanies.map(cv => ({ value: cv.company_id, label: cv.company_name })),
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Plaka</label>
                <input
                  type="text"
                  value={editPlate}
                  onChange={e => setEditPlate(e.target.value.toUpperCase())}
                  placeholder="34 ABC 123"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 font-mono uppercase tracking-widest"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tarih</label>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tür</label>
                <AppSelect
                  value={editType}
                  onChange={setEditType}
                  options={inspectionTypes.map(t => ({ value: t.code, label: t.label }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Not</label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>
              {editError && (
                <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2">{editError}</p>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setEditingInspection(null)}
                  className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">
                  İptal
                </button>
                <button onClick={saveEdit} disabled={editSaving}
                  className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                  {editSaving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
