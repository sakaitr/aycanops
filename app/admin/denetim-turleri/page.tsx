"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

export default function DenetimTurleriPage() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Criteria per type
  const [criteria, setCriteria] = useState<Record<string, any[]>>({});
  const [criteriaLoading, setCriteriaLoading] = useState<Record<string, boolean>>({});

  // Add type modal
  const [showAddType, setShowAddType] = useState(false);
  const [addTypeForm, setAddTypeForm] = useState({ label: "", code: "" });
  const [savingType, setSavingType] = useState(false);

  // Edit type
  const [editTypeId, setEditTypeId] = useState<string | null>(null);
  const [editTypeForm, setEditTypeForm] = useState({ label: "", code: "" });
  const [savingEditType, setSavingEditType] = useState(false);

  // Delete type
  const [deletingTypeId, setDeletingTypeId] = useState<string | null>(null);

  // Add criterion
  const [addCriterionFor, setAddCriterionFor] = useState<string | null>(null);
  const [newCriterionLabel, setNewCriterionLabel] = useState("");
  const [savingCriterion, setSavingCriterion] = useState(false);

  // Edit criterion
  const [editCriterionId, setEditCriterionId] = useState<string | null>(null);
  const [editCriterionLabel, setEditCriterionLabel] = useState("");
  const [savingEditCriterion, setSavingEditCriterion] = useState(false);

  // Delete criterion
  const [deletingCriterionId, setDeletingCriterionId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok || d.data?.role !== "admin") { router.replace("/"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => { if (user) loadTypes(); }, [user]);

  async function loadTypes() {
    setLoading(true);
    try {
      const r = await fetch("/api/configs/inspection-types");
      const d = await r.json();
      if (d.ok) setTypes(d.data);
    } finally { setLoading(false); }
  }

  async function loadCriteria(typeId: string) {
    setCriteriaLoading(l => ({ ...l, [typeId]: true }));
    try {
      const r = await fetch(`/api/configs/inspection-types/${typeId}/criteria`);
      const d = await r.json();
      if (d.ok) setCriteria(c => ({ ...c, [typeId]: d.data }));
    } finally {
      setCriteriaLoading(l => ({ ...l, [typeId]: false }));
    }
  }

  function toggleExpand(typeId: string) {
    if (expanded === typeId) { setExpanded(null); return; }
    setExpanded(typeId);
    if (!criteria[typeId]) loadCriteria(typeId);
  }

  // Auto-generate code from label
  function onAddLabelChange(label: string) {
    const code = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 50);
    setAddTypeForm({ label, code });
  }

  async function addType() {
    if (!addTypeForm.label.trim() || !addTypeForm.code.trim()) return;
    setSavingType(true);
    try {
      const r = await fetch("/api/configs/inspection-types", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addTypeForm),
      });
      const d = await r.json();
      if (d.ok) { setShowAddType(false); setAddTypeForm({ label: "", code: "" }); loadTypes(); }
      else alert(d.error);
    } finally { setSavingType(false); }
  }

  async function saveEditType() {
    if (!editTypeId || !editTypeForm.label.trim()) return;
    setSavingEditType(true);
    try {
      const r = await fetch(`/api/configs/inspection-types/${editTypeId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editTypeForm),
      });
      const d = await r.json();
      if (d.ok) { setEditTypeId(null); loadTypes(); }
      else alert(d.error);
    } finally { setSavingEditType(false); }
  }

  async function deleteType(id: string) {
    if (!confirm("Bu denetim türünü silmek istediğinizden emin misiniz?")) return;
    setDeletingTypeId(id);
    try {
      const r = await fetch(`/api/configs/inspection-types/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) { if (expanded === id) setExpanded(null); loadTypes(); }
      else alert(d.error);
    } finally { setDeletingTypeId(null); }
  }

  async function addCriterion(typeId: string) {
    if (!newCriterionLabel.trim()) return;
    setSavingCriterion(true);
    try {
      const r = await fetch(`/api/configs/inspection-types/${typeId}/criteria`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newCriterionLabel }),
      });
      const d = await r.json();
      if (d.ok) { setAddCriterionFor(null); setNewCriterionLabel(""); loadCriteria(typeId); }
      else alert(d.error);
    } finally { setSavingCriterion(false); }
  }

  async function saveEditCriterion(typeId: string) {
    if (!editCriterionId || !editCriterionLabel.trim()) return;
    setSavingEditCriterion(true);
    try {
      const r = await fetch(`/api/configs/inspection-criteria/${editCriterionId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editCriterionLabel }),
      });
      const d = await r.json();
      if (d.ok) { setEditCriterionId(null); loadCriteria(typeId); }
      else alert(d.error);
    } finally { setSavingEditCriterion(false); }
  }

  async function deleteCriterion(criterionId: string, typeId: string) {
    setDeletingCriterionId(criterionId);
    try {
      const r = await fetch(`/api/configs/inspection-criteria/${criterionId}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) loadCriteria(typeId);
      else alert(d.error);
    } finally { setDeletingCriterionId(null); }
  }

  if (!user) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">Yükleniyor...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a href="/admin" className="text-zinc-500 hover:text-white text-sm transition-colors">Yönetim</a>
              <span className="text-zinc-700">/</span>
              <span className="text-white text-sm">Denetim Türleri</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Denetim Türleri</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{types.length} tür tanımlı</p>
          </div>
          <button
            onClick={() => { setShowAddType(true); setAddTypeForm({ label: "", code: "" }); }}
            className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors whitespace-nowrap"
          >
            + Tür Ekle
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
        ) : types.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Henüz denetim türü eklenmedi</div>
        ) : (
          <div className="space-y-2">
            {types.map(type => (
              <div key={type.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                {/* Type header */}
                <div className="flex items-center gap-3 px-5 py-4">
                  {editTypeId === type.id ? (
                    <div className="flex flex-1 gap-2 flex-wrap">
                      <input
                        value={editTypeForm.label}
                        onChange={e => setEditTypeForm(f => ({ ...f, label: e.target.value }))}
                        placeholder="Tür adı"
                        className="flex-1 min-w-0 bg-zinc-800 border border-zinc-600 text-white text-sm px-3 py-1.5 rounded-lg focus:outline-none focus:border-zinc-400"
                        autoFocus
                        onKeyDown={e => { if (e.key === "Enter") saveEditType(); if (e.key === "Escape") setEditTypeId(null); }}
                      />
                      <input
                        value={editTypeForm.code}
                        onChange={e => setEditTypeForm(f => ({ ...f, code: e.target.value }))}
                        placeholder="kod"
                        className="w-32 bg-zinc-800 border border-zinc-600 text-white text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:border-zinc-400 font-mono"
                      />
                      <button onClick={saveEditType} disabled={savingEditType || !editTypeForm.label.trim()}
                        className="bg-white text-zinc-950 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                        {savingEditType ? "..." : "Kaydet"}
                      </button>
                      <button onClick={() => setEditTypeId(null)} className="text-zinc-500 hover:text-white px-2 transition-colors">✕</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => toggleExpand(type.id)} className="flex-1 flex items-center gap-3 text-left">
                        <span className="text-white font-semibold">{type.label}</span>
                        <span className="text-xs text-zinc-600 font-mono">{type.code}</span>
                        <span className="ml-auto text-xs text-zinc-500 shrink-0">{type.criteria_count} kriter</span>
                        <span className="text-zinc-600 text-xs ml-2">{expanded === type.id ? "▲" : "▼"}</span>
                      </button>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => { setEditTypeId(type.id); setEditTypeForm({ label: type.label, code: type.code }); }}
                          className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          Düzenle
                        </button>
                        <button
                          onClick={() => deleteType(type.id)}
                          disabled={deletingTypeId === type.id}
                          className="text-xs text-zinc-600 hover:text-red-400 border border-zinc-700 hover:border-red-800 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {deletingTypeId === type.id ? "..." : "Sil"}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Criteria list */}
                {expanded === type.id && (
                  <div className="border-t border-zinc-800 px-5 py-4">
                    {criteriaLoading[type.id] ? (
                      <p className="text-zinc-600 text-xs py-2">Yükleniyor...</p>
                    ) : (
                      <div className="space-y-1 mb-3">
                        {(criteria[type.id] ?? []).length === 0 && (
                          <p className="text-zinc-600 text-xs py-1">Henüz kriter eklenmedi.</p>
                        )}
                        {(criteria[type.id] ?? []).map((c, idx) => (
                          <div key={c.id} className="flex items-center gap-2">
                            <span className="text-zinc-600 text-xs w-5 text-right shrink-0">{idx + 1}.</span>
                            {editCriterionId === c.id ? (
                              <>
                                <input
                                  value={editCriterionLabel}
                                  onChange={e => setEditCriterionLabel(e.target.value)}
                                  autoFocus
                                  className="flex-1 bg-zinc-800 border border-zinc-600 text-white text-sm px-2 py-1 rounded-lg focus:outline-none focus:border-zinc-400"
                                  onKeyDown={e => { if (e.key === "Enter") saveEditCriterion(type.id); if (e.key === "Escape") setEditCriterionId(null); }}
                                />
                                <button onClick={() => saveEditCriterion(type.id)} disabled={savingEditCriterion}
                                  className="text-xs bg-white text-zinc-950 px-2.5 py-1 rounded-lg font-semibold hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                                  {savingEditCriterion ? "..." : "Kaydet"}
                                </button>
                                <button onClick={() => setEditCriterionId(null)} className="text-zinc-500 hover:text-white transition-colors">✕</button>
                              </>
                            ) : (
                              <>
                                <span className="flex-1 text-zinc-300 text-sm">{c.label}</span>
                                <button
                                  onClick={() => { setEditCriterionId(c.id); setEditCriterionLabel(c.label); }}
                                  className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors px-1"
                                >
                                  Düzenle
                                </button>
                                <button
                                  onClick={() => deleteCriterion(c.id, type.id)}
                                  disabled={deletingCriterionId === c.id}
                                  className="text-xs text-zinc-700 hover:text-red-400 transition-colors px-1 disabled:opacity-40"
                                >
                                  {deletingCriterionId === c.id ? "..." : "✕"}
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add criterion inline */}
                    {addCriterionFor === type.id ? (
                      <div className="flex gap-2 mt-2">
                        <input
                          value={newCriterionLabel}
                          onChange={e => setNewCriterionLabel(e.target.value)}
                          placeholder="Kriter adı..."
                          autoFocus
                          className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-1.5 rounded-lg focus:outline-none focus:border-zinc-500"
                          onKeyDown={e => { if (e.key === "Enter") addCriterion(type.id); if (e.key === "Escape") { setAddCriterionFor(null); setNewCriterionLabel(""); } }}
                        />
                        <button onClick={() => addCriterion(type.id)} disabled={savingCriterion || !newCriterionLabel.trim()}
                          className="bg-white text-zinc-950 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                          {savingCriterion ? "..." : "Ekle"}
                        </button>
                        <button onClick={() => { setAddCriterionFor(null); setNewCriterionLabel(""); }}
                          className="text-zinc-500 hover:text-white px-2 transition-colors">✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddCriterionFor(type.id); setNewCriterionLabel(""); }}
                        className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        + Kriter Ekle
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add Type Modal */}
      {showAddType && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Denetim Türü Ekle</h2>
              <button onClick={() => setShowAddType(false)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tür Adı *</label>
                <input
                  value={addTypeForm.label}
                  onChange={e => onAddLabelChange(e.target.value)}
                  placeholder="Örn: Aylık Denetim"
                  autoFocus
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Kod *</label>
                <input
                  value={addTypeForm.code}
                  onChange={e => setAddTypeForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                  placeholder="aylik_denetim"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 font-mono"
                />
                <p className="text-xs text-zinc-600 mt-1">Küçük harf, alt çizgi. Sonradan değiştirilemez.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddType(false)}
                className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">
                İptal
              </button>
              <button onClick={addType} disabled={savingType || !addTypeForm.label.trim() || !addTypeForm.code.trim()}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {savingType ? "Kaydediliyor..." : "Ekle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
