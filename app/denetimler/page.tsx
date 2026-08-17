"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import Badge from "@/components/Badge";
import AppSelect from "@/components/AppSelect";
import { hasPermission } from "@/lib/permissions";
import { todayIstanbul } from "@/lib/time";

// 'YYYY-MM-DD' iki tarih arası gün farkı — sadece takvim günü kıyaslar,
// saat/UTC ofset belirsizliği taşımaz.
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
function normalizePlate(p: string): string {
  return p.toUpperCase().replace(/\s+/g, "");
}

// --- Wizard adımları ---
// "setup"        : firma, araç, tarih, tip seçimi (tekil denetim)
// "criteria"     : kriter kriter ilerle (currentCriterionIdx)
// "summary"      : tüm sonuçlar + kaydet
// --- Seri denetim adımları (bir firmanın tüm araçlarını art arda denetle) ---
// "seri-company" : firma + tür seç (oturum boyunca sabit kalır)
// "seri-list"    : firmanın araç listesi — birini seç ya da manuel plaka gir
// "seri-checklist": tek ekranda checkbox listesi, hepsi "Onay" ile başlar

type WizardStep = "setup" | "criteria" | "summary" | "seri-company" | "seri-list" | "seri-checklist";

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
  const [sourceSubmissionId, setSourceSubmissionId] = useState<string | null>(null);
  const [preloadedType, setPreloadedType] = useState<string | null>(null);

  // Müşteri portalından yüklenen denetim dosyaları
  const [customerSubmissions, setCustomerSubmissions] = useState<any[]>([]);
  const [csLoading, setCsLoading] = useState(false);
  const [csFilter, setCsFilter] = useState<"yeni" | "all">("yeni");

  // Seri denetim — firma/tür oturum boyunca sabit, araçlar art arda
  const [seriCompanyId, setSeriCompanyId] = useState("");
  const [seriType, setSeriType] = useState("");
  const [seriDonePlates, setSeriDonePlates] = useState<Set<string>>(new Set());
  const [seriManualPlate, setSeriManualPlate] = useState("");
  const [seriSaving, setSeriSaving] = useState(false);
  const [seriError, setSeriError] = useState<string | null>(null);

  // plate|||typeCode -> son denetim tarihi. Aynı araç/tür 10 gün içinde
  // tekrar denetlenmişse seri listede gizlenir, tekil formda uyarı gösterilir.
  const [recentInspectionsByPlate, setRecentInspectionsByPlate] = useState<Map<string, string>>(new Map());

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

  // Düzenleme modalı — sadece firma/plaka/tarih/tür/not
  const [editingInspection, setEditingInspection] = useState<any | null>(null);
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editPlate, setEditPlate] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editType, setEditType] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Genişletilmiş satırda checklist/sonuç düzenleme (yalnızca inspections:update)
  const [checklistEdit, setChecklistEdit] = useState<CheckItem[]>([]);
  const [resultEdit, setResultEdit] = useState<string>("pending");
  const [checklistDirty, setChecklistDirty] = useState(false);
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [uploadingCriterionPhoto, setUploadingCriterionPhoto] = useState<number | null>(null);

  useEffect(() => { load(); }, [filterVehicleId, filterCompanyId]);
  useEffect(() => {
    fetch("/api/vehicles?limit=9999").then(r => r.json()).then(d => { if (d.ok) setVehicles(d.data); });
    fetch("/api/companies/all-vehicles").then(r => r.json()).then(d => { if (d.ok) setCompVehicles(d.data); });
    fetch("/api/configs/inspection-types").then(r => r.json()).then(d => { if (d.ok) setInspectionTypes(d.data); });
    loadRecentInspections();
  }, []);
  useEffect(() => { loadCustomerSubmissions(); }, [csFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCustomerSubmissions() {
    setCsLoading(true);
    try {
      const params = csFilter === "yeni" ? "?status=yeni" : "";
      const r = await fetch(`/api/customer-inspection-submissions${params}`);
      const d = await r.json();
      if (d.ok) setCustomerSubmissions(d.data);
    } finally { setCsLoading(false); }
  }

  function openFormFromSubmission(sub: any) {
    // Firma checklist doldurduysa aynı tür + cevaplar başlangıç noktası
    // olarak kullanılır — staff sıfırdan değil, doğrulayarak ilerler.
    const matchedType = sub.type && inspectionTypes.some((t: any) => t.id === sub.type) ? sub.type : (inspectionTypes[0]?.id || "");
    const customerChecklist = sub.checklist_json ? JSON.parse(sub.checklist_json) : null;

    setFormCompanyId(sub.company_id);
    setFormPlate(sub.plate);
    setFormVehicleId("");
    setFormCompVehicleId("");
    setFormDate(sub.inspection_date);
    setFormType(matchedType);
    setFormNotes("");
    setChecklist(customerChecklist || []);
    setResultOverride(null);
    setSaveError(null);
    setPhotoFiles([]);
    setQuestionPhotos({});
    setCreatedInspectionId(null);
    setSourceSubmissionId(sub.id);
    setPreloadedType(customerChecklist ? matchedType : null);
    setWizardStep("setup");
    setCurrentCriterionIdx(0);
    setShowForm(true);
    if (!customerChecklist && matchedType) loadCriteriaForType(matchedType);
  }

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

  // ── Seri denetim: 10 gün içinde aynı tür denetimi yapılmış araçlar
  // listeden gizlenir (bu oturumda yapılanlar hariç), kalanlar en eski/hiç
  // denetlenmemiş önce gelecek şekilde sıralanır.
  const seriTypeCode = useMemo(() => inspectionTypes.find(t => t.id === seriType)?.code || seriType, [inspectionTypes, seriType]);
  const seriCandidateVehicles = useMemo(
    () => compVehicles.filter(cv => cv.company_id === seriCompanyId),
    [compVehicles, seriCompanyId]
  );
  function seriLastDate(plate: string): string | undefined {
    return recentInspectionsByPlate.get(`${normalizePlate(plate)}|||${seriTypeCode}`);
  }
  function seriIsRecentlyInspected(plate: string): boolean {
    const d = seriLastDate(plate);
    return d ? daysBetween(d, todayIstanbul()) < 10 : false;
  }
  const seriVisibleVehicles = useMemo(() => {
    return seriCandidateVehicles
      .filter(cv => seriDonePlates.has(cv.plate) || !seriIsRecentlyInspected(cv.plate))
      .sort((a, b) => (seriLastDate(a.plate) || "").localeCompare(seriLastDate(b.plate) || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriCandidateVehicles, recentInspectionsByPlate, seriTypeCode, seriDonePlates]);
  const seriHiddenCount = seriCandidateVehicles.length - seriVisibleVehicles.length;

  function matchSeriVehicleByPlate(plate: string) {
    const norm = normalizePlate(plate);
    return seriCandidateVehicles.find(cv => normalizePlate(cv.plate) === norm) || null;
  }

  // Tekil (seri olmayan) formda da aynı 10 gün kuralı — burada gizlemek
  // yerine sadece uyarı gösterilir, denetim yine de kaydedilebilir.
  const setupPlateForCheck = formCompVehicleId ? (compVehicles.find(cv => cv.id === formCompVehicleId)?.plate || "") : formPlate.trim();
  const setupTypeCodeForCheck = inspectionTypes.find(t => t.id === formType)?.code || formType;
  const setupRecentDate = setupPlateForCheck
    ? recentInspectionsByPlate.get(`${normalizePlate(setupPlateForCheck)}|||${setupTypeCodeForCheck}`)
    : undefined;
  const setupRecentDays = setupRecentDate ? daysBetween(setupRecentDate, todayIstanbul()) : null;
  const setupShowRecentWarning = setupRecentDays !== null && setupRecentDays < 10;

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

  // 10 gün kuralı için sayfanın liste filtrelerinden bağımsız, filtresiz
  // tam veri lazım — load()'daki filterCompanyId/filterVehicleId burayı
  // etkilemesin diye ayrı bir istek.
  async function loadRecentInspections() {
    try {
      const r = await fetch("/api/inspections");
      const d = await r.json();
      if (!d.ok) return;
      const map = new Map<string, string>();
      for (const insp of d.data as any[]) {
        const plate = (insp.company_vehicle_plate || insp.vehicle_plate || "").trim();
        if (!plate || !insp.type || !insp.inspection_date) continue;
        const key = `${normalizePlate(plate)}|||${insp.type}`;
        const existing = map.get(key);
        if (!existing || insp.inspection_date > existing) map.set(key, insp.inspection_date);
      }
      setRecentInspectionsByPlate(map);
    } catch { /* sessiz geç — sadece uyarı/gizleme özelliği etkilenir */ }
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
    setSourceSubmissionId(null);
    setPreloadedType(null);
    setWizardStep("setup");
    setCurrentCriterionIdx(0);
    setShowForm(true);
    if (firstType) loadCriteriaForType(firstType);
  }

  async function proceedToChecklist() {
    const hasVehicle = formPlate.trim() || formVehicleId || formCompVehicleId;
    if (!hasVehicle || !formType) return;
    // Müşteri gönderiminden checklist önceden yüklendiyse ve tür
    // değiştirilmediyse üzerine yazma — aksi halde kriterleri yeniden yükle.
    if (preloadedType && formType === preloadedType) {
      setPreloadedType(null);
    } else {
      await loadCriteriaForType(formType);
    }
    setCurrentCriterionIdx(0);
    setWizardStep("criteria");
  }

  // ── Seri denetim: firma + tür bir kere seçilir, ardından o firmanın
  // araçları art arda, tek ekranda checkbox listesiyle hızlıca denetlenir.
  function startSeri() {
    const firstType = inspectionTypes[0]?.id || "";
    setSeriCompanyId("");
    setSeriType(firstType);
    setSeriDonePlates(new Set());
    setSeriManualPlate("");
    setSeriError(null);
    setFormNotes("");
    setWizardStep("seri-company");
    setShowForm(true);
  }

  function beginSeriList() {
    if (!seriCompanyId || !seriType) return;
    setWizardStep("seri-list");
  }

  async function startSeriChecklist(plate: string, compVehicleId: string) {
    setSeriError(null);
    setFormPlate(compVehicleId ? "" : plate);
    setFormCompVehicleId(compVehicleId);
    setFormVehicleId("");
    setFormCompanyId(seriCompanyId);
    setFormType(seriType);
    setFormDate(new Date().toISOString().split("T")[0]);
    setCreatedInspectionId(null);
    setPhotoFiles([]);
    setQuestionPhotos({});
    setResultOverride(null);
    setCriteriaLoading(true);
    try {
      const r = await fetch(`/api/configs/inspection-types/${seriType}/criteria`);
      const d = await r.json();
      // Seri denetimde hız için tüm kriterler "Onay" ile başlar — staff
      // sadece sorunlu olanı değiştirir, hepsini tek tek işaretlemez.
      setChecklist(d.ok ? d.data.map((c: any) => ({ label: c.label, ok: true, note: "" })) : []);
    } finally {
      setCriteriaLoading(false);
    }
    setWizardStep("seri-checklist");
  }

  async function saveAndContinueSeri() {
    setSeriSaving(true);
    setSeriError(null);
    try {
      const payload: any = {
        inspection_date: formDate,
        type: inspectionTypes.find(t => t.id === seriType)?.code || seriType,
        notes: formNotes,
        checklist,
        result: finalResult,
        company_id: seriCompanyId,
      };
      if (formCompVehicleId) payload.company_vehicle_id = formCompVehicleId;
      else payload.company_vehicle_plate = formPlate.trim().toUpperCase();

      const res = await fetch("/api/inspections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!d.ok) { setSeriError(d.error || "Kaydedilemedi"); return; }

      const donePlate = formCompVehicleId
        ? compVehicles.find(cv => cv.id === formCompVehicleId)?.plate
        : formPlate.trim().toUpperCase();
      if (donePlate) setSeriDonePlates(prev => new Set(prev).add(donePlate));

      setChecklist([]);
      setFormCompVehicleId("");
      setFormPlate("");
      setSeriManualPlate("");
      load();
      loadRecentInspections();
      setWizardStep("seri-list");
    } finally {
      setSeriSaving(false);
    }
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

  // ── Kayıttan sonra checklist/sonuç düzenleme (genişletilmiş satır) ──
  function setChecklistEditOk(idx: number, ok: boolean) {
    setChecklistEdit(cl => cl.map((c, i) => i === idx ? { ...c, ok } : c));
    setChecklistDirty(true);
  }

  function setChecklistEditNote(idx: number, note: string) {
    setChecklistEdit(cl => cl.map((c, i) => i === idx ? { ...c, note } : c));
    setChecklistDirty(true);
  }

  async function saveChecklistEdit(inspectionId: string) {
    setChecklistSaving(true);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist: checklistEdit, result: resultEdit }),
      });
      const d = await res.json();
      if (d.ok) { setChecklistDirty(false); load(); }
      else alert(d.error || "Kaydedilemedi");
    } finally { setChecklistSaving(false); }
  }

  async function uploadCriterionPhoto(inspectionId: string, criterionIndex: number, file: File) {
    setUploadingCriterionPhoto(criterionIndex);
    try {
      const fd = new FormData();
      fd.append("photos", file);
      fd.append("criterion_index_0", String(criterionIndex));
      const res = await fetch(`/api/inspections/${inspectionId}/photos`, { method: "POST", body: fd });
      const d = await res.json();
      if (d.ok) {
        const r = await fetch(`/api/inspections/${inspectionId}/photos`);
        const dr = await r.json();
        if (dr.ok) setExpandedPhotos(prev => ({ ...prev, [inspectionId]: dr.data }));
      } else {
        alert(d.error || "Fotoğraf yüklenemedi");
      }
    } finally { setUploadingCriterionPhoto(null); }
  }

  async function deleteCriterionPhoto(inspectionId: string, photoId: string) {
    const res = await fetch(`/api/inspections/${inspectionId}/photos?photo_id=${photoId}`, { method: "DELETE" });
    const d = await res.json();
    if (d.ok) {
      setExpandedPhotos(prev => ({ ...prev, [inspectionId]: (prev[inspectionId] || []).filter((p: any) => p.id !== photoId) }));
    }
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
          source_submission_id: sourceSubmissionId,
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
      loadRecentInspections();
      if (sourceSubmissionId) loadCustomerSubmissions();
      setSourceSubmissionId(null);
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
          <div className="flex gap-2">
            <button
              onClick={startSeri}
              className="bg-zinc-800 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors border border-zinc-700"
            >
              Seri Denetim Başlat
            </button>
            <button
              onClick={openForm}
              className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors"
            >
              + Denetim Ekle
            </button>
          </div>
        </div>

        {/* Müşteri portalından yüklenen denetim dosyaları */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Müşteri Denetimleri</h2>
            <div className="flex gap-1 bg-zinc-800 p-0.5 rounded-lg">
              {([["yeni", "Yeni"], ["all", "Tümü"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setCsFilter(key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${csFilter === key ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {csLoading ? (
            <p className="text-zinc-600 text-xs py-4 text-center">Yükleniyor...</p>
          ) : customerSubmissions.length === 0 ? (
            <p className="text-zinc-600 text-xs py-4 text-center">{csFilter === "yeni" ? "Bekleyen müşteri denetimi yok" : "Kayıt yok"}</p>
          ) : (
            <div className="space-y-2">
              {customerSubmissions.map(sub => (
                <div key={sub.id} className="bg-zinc-800/50 rounded-lg p-3 flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-white font-mono font-semibold text-sm">{sub.plate}</span>
                      <span className="text-zinc-500 text-xs">{sub.company_name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${sub.status === "yeni" ? "bg-amber-950 text-amber-300 border border-amber-800" : "bg-zinc-700 text-zinc-400"}`}>
                        {sub.status === "yeni" ? "Yeni" : "İncelendi"}
                      </span>
                      {sub.checklist_json && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-950 text-blue-300 border border-blue-800">
                          Checklist Dolu
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-300 text-sm">{sub.title}</p>
                    <p className="text-zinc-600 text-xs mt-0.5">
                      {new Date(sub.inspection_date + "T00:00:00").toLocaleDateString("tr-TR")} · {sub.olusturan}
                    </p>
                    {sub.note && <p className="text-zinc-500 text-xs mt-1 italic">{sub.note}</p>}
                    {sub.files?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {sub.files.map((f: any) => (
                          <a key={f.id} href={`/api/uploads/musteri-denetim/${f.filename}`} target="_blank" rel="noopener noreferrer"
                            className="text-[11px] bg-zinc-900 text-zinc-400 px-2 py-1 rounded-lg hover:text-white">
                            {f.original_name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  {hasPermission(user, "inspections:create") && sub.status === "yeni" && (
                    <button onClick={() => openFormFromSubmission(sub)}
                      className="text-xs font-semibold bg-white text-zinc-950 px-3 py-1.5 rounded-lg hover:bg-zinc-200 transition-colors shrink-0">
                      Bizim Denetimimizi Ekle
                    </button>
                  )}
                  {sub.linked_inspection_id && (
                    <span className="text-[11px] text-emerald-400 shrink-0">✓ Bağlandı</span>
                  )}
                </div>
              ))}
            </div>
          )}
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
                      if (next) {
                        setChecklistEdit(cl.map((c: any) => ({ label: c.label, ok: c.ok, note: c.note || "" })));
                        setResultEdit(ins.result);
                        setChecklistDirty(false);
                        if (!expandedPhotos[next]) {
                          fetch(`/api/inspections/${next}/photos`).then(r => r.json()).then(d => {
                            if (d.ok) setExpandedPhotos(prev => ({ ...prev, [next]: d.data }));
                          });
                        }
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
                    <div className="px-5 pb-4 border-t border-zinc-800/40" onClick={e => e.stopPropagation()}>
                      {hasPermission(user, "inspections:update") ? (
                        <>
                          {/* Sonuç — manuel değiştirilebilir */}
                          <div className="mt-3">
                            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Sonuç</label>
                            <div className="flex gap-2">
                              {(["pass", "conditional", "fail"] as const).map(r => (
                                <button key={r} onClick={() => { setResultEdit(r); setChecklistDirty(true); }}
                                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                    resultEdit === r
                                      ? r === "pass" ? "bg-emerald-950 border-emerald-800 text-emerald-300"
                                        : r === "fail" ? "bg-red-950 border-red-800 text-red-300"
                                        : "bg-yellow-950 border-yellow-800 text-yellow-300"
                                      : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700"
                                  }`}>
                                  {RESULT_BADGE[r].label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Checklist — düzenlenebilir */}
                          {checklistEdit.length > 0 && (
                            <div className="space-y-2 mt-4">
                              {checklistEdit.map((c, idx) => {
                                const itemPhotos = (expandedPhotos[ins.id] || []).filter((p: any) => p.criterion_index === idx);
                                return (
                                  <div key={idx} className="bg-zinc-800/50 rounded-lg p-3">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                      <span className="text-sm text-white flex-1">{c.label}</span>
                                      <div className="flex gap-1.5 shrink-0">
                                        <button onClick={() => setChecklistEditOk(idx, true)}
                                          className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${c.ok === true ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-500 hover:bg-emerald-950 hover:text-emerald-300"}`}>✓</button>
                                        <button onClick={() => setChecklistEditOk(idx, false)}
                                          className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${c.ok === false ? "bg-red-700 text-white" : "bg-zinc-800 text-zinc-500 hover:bg-red-950 hover:text-red-300"}`}>✗</button>
                                      </div>
                                    </div>
                                    <textarea value={c.note} onChange={e => setChecklistEditNote(idx, e.target.value)}
                                      placeholder="Not ekle..." rows={1}
                                      className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none mb-2" />
                                    <div className="flex flex-wrap gap-1.5">
                                      {itemPhotos.map((p: any) => (
                                        <div key={p.id} className="relative w-12 h-12 rounded-md overflow-hidden bg-zinc-900 group">
                                          <a href={`/api/uploads/denetim/${p.filename}`} target="_blank" rel="noopener noreferrer">
                                            <img src={`/api/uploads/denetim/${p.filename}`} alt="" className="w-full h-full object-cover" />
                                          </a>
                                          <button onClick={() => deleteCriterionPhoto(ins.id, p.id)}
                                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-400 text-xs font-bold transition-opacity">×</button>
                                        </div>
                                      ))}
                                      <label className="w-12 h-12 flex items-center justify-center rounded-md border border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 cursor-pointer text-[10px] text-center transition-colors">
                                        {uploadingCriterionPhoto === idx ? "..." : "+ Foto"}
                                        <input type="file" accept="image/*" capture="environment" className="hidden"
                                          disabled={uploadingCriterionPhoto === idx}
                                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadCriterionPhoto(ins.id, idx, f); e.target.value = ""; }} />
                                      </label>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {checklistDirty && (
                            <button onClick={() => saveChecklistEdit(ins.id)} disabled={checklistSaving}
                              className="mt-3 w-full bg-white text-zinc-950 text-sm font-semibold py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                              {checklistSaving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
                            </button>
                          )}

                          {/* Genel (soruya bağlı olmayan) fotoğraflar */}
                          {(expandedPhotos[ins.id] || []).some((p: any) => p.criterion_index === null) && (
                            <div className="mt-4">
                              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Genel Fotoğraflar</p>
                              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                {(expandedPhotos[ins.id] || []).filter((p: any) => p.criterion_index === null).map((p: any) => (
                                  <a key={p.id} href={`/api/uploads/denetim/${p.filename}`} target="_blank" rel="noopener noreferrer"
                                    className="aspect-square rounded-lg overflow-hidden bg-zinc-800 block">
                                    <img src={`/api/uploads/denetim/${p.filename}`} alt="" className="w-full h-full object-cover" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
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
                        </>
                      )}

                      {ins.notes && <p className="text-zinc-500 text-xs mt-3 italic">{ins.notes}</p>}

                      {((ins.result === "fail" || ins.result === "conditional") || hasPermission(user, "inspections:delete") || hasPermission(user, "inspections:update")) && (
                        <div className="mt-3 flex justify-end gap-2">
                          {hasPermission(user, "inspections:update") && (
                            <button
                              onClick={e => { e.stopPropagation(); openEditModal(ins); }}
                              className="text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              Kayıt Bilgilerini Düzenle
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
              <h2 className="text-lg font-bold text-white">
                {wizardStep.startsWith("seri") ? "Seri Denetim" : "Denetim Ekle"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
            </div>

            {/* ── SERİ ADIM 1: FİRMA + TÜR ── */}
            {wizardStep === "seri-company" && (
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Firma *</label>
                  <AppSelect
                    value={seriCompanyId}
                    onChange={setSeriCompanyId}
                    options={[
                      { value: "", label: "— Firma seçin —" },
                      ...uniqueCompanies.map(cv => ({ value: cv.company_id, label: cv.company_name })),
                    ]}
                    triggerClass="bg-zinc-800 border-zinc-700 w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Denetim Türü *</label>
                  <AppSelect
                    value={seriType}
                    onChange={setSeriType}
                    options={inspectionTypes.map(t => ({ value: t.id, label: t.label }))}
                    triggerClass="bg-zinc-800 border-zinc-700 w-full"
                  />
                </div>
                <p className="text-zinc-600 text-xs">
                  Firma ve tür seçince, o firmanın tüm araçlarını art arda hızlıca denetleyebilirsiniz.
                </p>
                <button
                  onClick={beginSeriList}
                  disabled={!seriCompanyId || !seriType}
                  className="w-full bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors"
                >
                  Devam Et →
                </button>
              </div>
            )}

            {/* ── SERİ ADIM 2: ARAÇ LİSTESİ ── */}
            {wizardStep === "seri-list" && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-zinc-400">
                    {uniqueCompanies.find(c => c.company_id === seriCompanyId)?.company_name}
                  </p>
                  <span className="text-xs text-zinc-600">{seriDonePlates.size} denetlendi</span>
                </div>
                {seriHiddenCount > 0 && (
                  <p className="text-xs text-zinc-600 mb-2">
                    {seriHiddenCount} araç son 10 gün içinde bu türde denetlendiği için listede gösterilmiyor.
                  </p>
                )}
                <div className="max-h-72 overflow-y-auto space-y-1.5 mb-4">
                  {seriVisibleVehicles.map(cv => {
                    const done = seriDonePlates.has(cv.plate);
                    const lastDate = seriLastDate(cv.plate);
                    return (
                      <button key={cv.id} onClick={() => startSeriChecklist(cv.plate, cv.id)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          done ? "bg-emerald-950/40 text-emerald-400" : "bg-zinc-800 text-white hover:bg-zinc-700"
                        }`}>
                        <span className="font-mono font-semibold">{cv.plate}</span>
                        {done ? (
                          <span className="text-xs">✓ Denetlendi</span>
                        ) : lastDate ? (
                          <span className="text-xs text-zinc-500">Son: {lastDate}</span>
                        ) : (
                          <span className="text-xs text-amber-500">Hiç denetlenmedi</span>
                        )}
                      </button>
                    );
                  })}
                  {seriCandidateVehicles.length === 0 && (
                    <p className="text-zinc-600 text-xs text-center py-4">Bu firmaya kayıtlı araç yok, manuel plaka girin.</p>
                  )}
                </div>

                {/* Listede olmayan araç için manuel plaka — girilen plaka
                    firmanın araç listesiyle eşleşiyorsa otomatik bağlanır. */}
                <div className="flex gap-2 mb-4">
                  <input value={seriManualPlate} onChange={e => setSeriManualPlate(e.target.value.toUpperCase())}
                    placeholder="Listede yoksa plaka gir..."
                    className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                  <button onClick={() => {
                    if (!seriManualPlate.trim()) return;
                    const matched = matchSeriVehicleByPlate(seriManualPlate);
                    if (matched) startSeriChecklist(matched.plate, matched.id);
                    else startSeriChecklist(seriManualPlate.trim(), "");
                  }}
                    disabled={!seriManualPlate.trim()}
                    className="bg-zinc-800 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-zinc-700 disabled:opacity-40 transition-colors">
                    Denetle
                  </button>
                </div>

                {seriError && <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2 mb-3">{seriError}</p>}

                <button onClick={() => setShowForm(false)}
                  className="w-full bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">
                  Seri Denetimi Bitir
                </button>
              </div>
            )}

            {/* ── SERİ ADIM 3: TEK EKRAN CHECKBOX LİSTESİ ── */}
            {wizardStep === "seri-checklist" && (
              <div className="p-6">
                <p className="text-sm text-zinc-400 mb-4">
                  <span className="font-mono font-semibold text-white">{formCompVehicleId ? compVehicles.find(cv => cv.id === formCompVehicleId)?.plate : formPlate}</span>
                  {" · "}{selectedTypeName}
                </p>
                {criteriaLoading ? (
                  <p className="text-zinc-600 text-sm text-center py-8">Kriterler yükleniyor...</p>
                ) : checklist.length === 0 ? (
                  <p className="text-zinc-600 text-sm text-center py-8">Bu denetim türüne ait kriter tanımlanmamış.</p>
                ) : (
                  <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
                    {checklist.map((c, idx) => (
                      <div key={idx} className={`rounded-lg p-3 ${c.ok === false ? "bg-red-950/30 border border-red-900" : "bg-zinc-800/50"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-white flex-1">{c.label}</span>
                          <button onClick={() => setChecklist(cl => cl.map((it, i) => i === idx ? { ...it, ok: !it.ok, note: !it.ok ? it.note : "" } : it))}
                            className={`w-9 h-9 rounded-lg text-base font-bold shrink-0 transition-colors ${
                              c.ok === true ? "bg-emerald-600 text-white" : "bg-red-700 text-white"
                            }`}>
                            {c.ok === true ? "✓" : "✗"}
                          </button>
                        </div>
                        {c.ok === false && (
                          <textarea value={c.note} onChange={e => setChecklist(cl => cl.map((it, i) => i === idx ? { ...it, note: e.target.value } : it))}
                            placeholder="Red nedeni (zorunlu)..." rows={1} autoFocus
                            className="w-full bg-zinc-900 border border-red-900 text-white text-xs px-2.5 py-1.5 rounded-lg focus:outline-none mt-2 resize-none" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {seriError && <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2 mb-3">{seriError}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setWizardStep("seri-list")}
                    className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">
                    ← Listeye Dön
                  </button>
                  <button onClick={saveAndContinueSeri}
                    disabled={seriSaving || checklist.length === 0 || checklist.some(c => c.ok === false && !c.note.trim())}
                    className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                    {seriSaving ? "Kaydediliyor..." : "Kaydet ve Devam Et"}
                  </button>
                </div>
              </div>
            )}

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

                {setupShowRecentWarning && (
                  <p className="text-amber-400 text-xs bg-amber-950/40 border border-amber-800 rounded-lg px-3 py-2">
                    {setupPlateForCheck} için bu tür denetim {setupRecentDays} gün önce ({setupRecentDate}) zaten yapılmış. Yine de devam edebilirsiniz.
                  </p>
                )}

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
