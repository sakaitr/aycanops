"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminMusterilerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); })
      .catch(() => router.replace("/login"));
  }, [router]);

  const [users, setUsers] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ company_id: "", email: "", full_name: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [editUser, setEditUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", is_active: true, password: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/companies?limit=999")
      .then(r => r.json())
      .then(d => { if (d.ok) setCompanies(d.data); })
      .catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const params = companyFilter ? `?company_id=${companyFilter}` : "";
      const res = await fetch(`/api/admin/musteriler${params}`);
      const d = await res.json();
      if (d.ok) setUsers(d.data);
    } catch {}
    finally { setLoading(false); }
  }
  useEffect(() => { if (user) load(); }, [user, companyFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.company_id || !form.email || !form.full_name || !form.password) {
      setFormError("Tüm alanlar zorunludur");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/musteriler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (d.ok) {
        setShowForm(false);
        setForm({ company_id: "", email: "", full_name: "", password: "" });
        load();
      } else {
        setFormError(d.error || "Hata oluştu");
      }
    } catch {
      setFormError("Bağlantı hatası");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditError("");
    if (!editUser) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/admin/musteriler", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editUser.id, ...editForm }),
      });
      const d = await res.json();
      if (d.ok) { setEditUser(null); load(); }
      else setEditError(d.error || "Hata oluştu");
    } catch {
      setEditError("Bağlantı hatası");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu müşteri kullanıcısını silmek istediğinizden emin misiniz?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/admin/musteriler?id=${id}`, { method: "DELETE" });
      load();
    } catch {}
    finally { setDeleting(null); }
  }

  if (!user) return null;
  const isAdmin = user.role === "admin";

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <Nav user={user} />
      <main className="flex-1 lg:ml-56 pt-14 lg:pt-0 p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5 max-w-4xl mx-auto"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[var(--foreground)]">Müşteri Portal Kullanıcıları</h1>
              <p className="text-xs text-[var(--t-text-500)] mt-0.5">
                Müşteri firmalarının portal erişimlerini yönetin ·{" "}
                <a href="/portal" target="_blank" className="text-[var(--t-accent)] hover:underline">
                  Portale git →
                </a>
              </p>
            </div>
            <button
              onClick={() => setShowForm(v => !v)}
              className="bg-[var(--t-accent)] hover:opacity-90 text-white text-sm font-medium rounded-xl px-4 py-2.5 min-h-[44px] transition-all"
            >
              + Yeni Kullanıcı
            </button>
          </div>

          {/* Yeni Kullanıcı Formu */}
          <AnimatePresence>
            {showForm && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleCreate}
                className="overflow-hidden"
              >
                <div className="bg-[var(--t-800)] border border-[var(--t-border-700)] rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">Yeni Müşteri Kullanıcısı</h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--t-text-500)] mb-1 block">Firma *</label>
                      <select
                        value={form.company_id}
                        onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}
                        className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
                      >
                        <option value="">Firma seçin...</option>
                        {companies.map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--t-text-500)] mb-1 block">Ad Soyad *</label>
                      <input
                        type="text"
                        value={form.full_name}
                        onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                        placeholder="Yetkili kişi adı"
                        className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] rounded-xl px-3 py-2.5 text-[16px] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--t-text-500)] mb-1 block">E-posta *</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="firma@ornek.com"
                        className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] rounded-xl px-3 py-2.5 text-[16px] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--t-text-500)] mb-1 block">Şifre *</label>
                      <input
                        type="password"
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        placeholder="Min. 8 karakter"
                        className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] rounded-xl px-3 py-2.5 text-[16px] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
                      />
                    </div>
                  </div>

                  {formError && (
                    <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                      {formError}
                    </p>
                  )}

                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowForm(false)} className="text-sm text-[var(--t-text-400)] px-4 py-2.5 min-h-[40px]">
                      İptal
                    </button>
                    <button type="submit" disabled={saving} className="bg-[var(--t-accent)] hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-5 py-2.5 min-h-[40px]">
                      {saving ? "Kaydediliyor..." : "Kaydet"}
                    </button>
                  </div>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Filtre */}
          <div className="flex gap-3">
            <select
              value={companyFilter}
              onChange={e => setCompanyFilter(e.target.value)}
              className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
            >
              <option value="">Tüm Firmalar</option>
              {companies.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Kullanıcı Listesi */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-[var(--t-accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-[var(--t-text-500)] text-sm bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl">
              Müşteri kullanıcısı bulunamadı
            </div>
          ) : (
            <div className="bg-[var(--t-800)] border border-[var(--t-border-800)] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="border-b border-[var(--t-border-800)]">
                      <th className="text-left px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Ad Soyad</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">E-posta</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Firma</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Durum</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">Son Giriş</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-[var(--t-text-500)]">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => (
                      <tr key={u.id} className={`border-b border-[var(--t-border-800)] ${i === users.length - 1 ? "border-0" : ""}`}>
                        <td className="px-4 py-3">
                          <p className="text-[var(--foreground)] font-medium text-xs">{u.full_name}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--t-text-400)]">{u.email}</td>
                        <td className="px-4 py-3 text-xs text-[var(--t-text-400)]">{u.company_name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${u.is_active ? "text-green-400 bg-green-400/10" : "text-zinc-500 bg-zinc-500/10"}`}>
                            {u.is_active ? "Aktif" : "Pasif"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--t-text-500)]">
                          {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString("tr-TR") : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditUser(u);
                                setEditForm({ full_name: u.full_name, is_active: !!u.is_active, password: "" });
                                setEditError("");
                              }}
                              className="text-[11px] text-[var(--t-text-400)] hover:text-[var(--t-accent)] px-2 py-1.5 min-h-[32px]"
                            >
                              Düzenle
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleDelete(u.id)}
                                disabled={deleting === u.id}
                                className="text-[11px] text-[var(--t-text-400)] hover:text-red-400 px-2 py-1.5 min-h-[32px] disabled:opacity-40"
                              >
                                {deleting === u.id ? "..." : "Sil"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </motion.div>
      </main>

      {/* Edit Modal */}
      <AnimatePresence>
        {editUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setEditUser(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-[var(--t-800)] border border-[var(--t-border-700)] rounded-2xl p-5 w-full max-w-sm"
            >
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">Kullanıcı Düzenle</h3>
              <form onSubmit={handleEdit} className="space-y-3">
                <div>
                  <label className="text-xs text-[var(--t-text-500)] mb-1 block">Ad Soyad</label>
                  <input
                    type="text"
                    value={editForm.full_name}
                    onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] rounded-xl px-3 py-2.5 text-[16px] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--t-text-500)] mb-1 block">Yeni Şifre (boş bırakılırsa değişmez)</label>
                  <input
                    type="password"
                    value={editForm.password}
                    onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 8 karakter"
                    className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] rounded-xl px-3 py-2.5 text-[16px] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)]"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.is_active}
                    onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-[var(--foreground)]">Aktif</span>
                </label>
                {editError && (
                  <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {editError}
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setEditUser(null)} className="text-sm text-[var(--t-text-400)] px-4 py-2.5 min-h-[40px]">
                    İptal
                  </button>
                  <button type="submit" disabled={editSaving} className="bg-[var(--t-accent)] hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-5 py-2.5 min-h-[40px]">
                    {editSaving ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
