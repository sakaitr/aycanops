"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

const ROLE_LABELS: Record<string, { label: string; cls: string }> = {
  admin:    { label: "Admin",     cls: "text-red-300 bg-red-950 border-red-800" },
  yonetici: { label: "Yönetici",  cls: "text-purple-300 bg-purple-950 border-purple-800" },
  yetkili:  { label: "Yetkili",   cls: "text-blue-300 bg-blue-950 border-blue-800" },
  personel: { label: "Personel",  cls: "text-zinc-400 bg-zinc-800 border-zinc-700" },
};

const ALL_PAGES = [
  { href: "/", label: "Panel" },
  { href: "/gunluk", label: "Günlük" },
  { href: "/gorevler", label: "İş Takibi" },
  { href: "/seferler", label: "Ek Mesai" },
  { href: "/giris-kontrol", label: "Giriş Kontrol" },
  { href: "/sofor-degerlendirme", label: "Şöför Değerlendirme" },
  { href: "/araclar", label: "Araçlar" },
  { href: "/guzergahlar", label: "Güzergahlar" },
  { href: "/denetimler", label: "Denetimler" },
  { href: "/surucu-sicil", label: "Sürücü Sicil" },
  { href: "/raporlar", label: "Raporlar" },
];

// Rol bazlı varsayılan sayfa izinleri (kısıtlama açıldığında ön seçili gelir)
const ROLE_PAGE_DEFAULTS: Record<string, string[]> = {
  personel: ["/", "/gorevler", "/seferler", "/giris-kontrol"],
  yetkili:  ["/", "/gunluk", "/gorevler", "/seferler", "/giris-kontrol", "/sofor-degerlendirme", "/araclar", "/guzergahlar", "/denetimler", "/surucu-sicil"],
  yonetici: ALL_PAGES.map(p => p.href),
  admin:    ALL_PAGES.map(p => p.href),
};

const EMPTY_FORM = {
  username: "", password: "", full_name: "", role: "personel", department_id: "", is_active: true,
  restricted_pages: false, allowed_pages: [] as string[],
  restricted_companies: false, allowed_companies: [] as string[],
};

export default function KullanicilarPage() {
  const [user, setUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const router = useRouter();

  const [showForm, setShowForm] = useState(false);
  const [formTab, setFormTab] = useState<"temel" | "izinler">("temel");
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [resetPassId, setResetPassId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok || d.data?.role !== "admin") { router.replace("/"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/"));
    fetch("/api/departments").then(r => r.json()).then(d => { if (d.ok) setDepartments(d.data); });
    fetch("/api/companies").then(r => r.json()).then(d => { if (d.ok) setCompanies(d.data); });
  }, [router]);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/users");
      const d = await r.json();
      if (d.ok) setUsers(d.data);
    } finally { setLoading(false); }
  }

  function parsePermUser(u: any) {
    let ap: string[] | null = null;
    let ac: string[] | null = null;
    try { if (u.allowed_pages) ap = JSON.parse(u.allowed_pages); } catch {}
    try { if (u.allowed_companies) ac = JSON.parse(u.allowed_companies); } catch {}
    return { ap, ac };
  }

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setFormTab("temel");
    setShowForm(true);
  }

  function openEdit(u: any) {
    setEditing(u);
    const { ap, ac } = parsePermUser(u);
    setForm({
      username: u.username,
      password: "",
      full_name: u.full_name,
      role: u.role,
      department_id: u.department_id || "",
      is_active: u.is_active === 1,
      restricted_pages: ap !== null,
      allowed_pages: ap ?? [],
      restricted_companies: ac !== null,
      allowed_companies: ac ?? [],
    });
    setFormError(null);
    setFormTab("temel");
    setShowForm(true);
  }

  function togglePage(href: string) {
    setForm(f => ({
      ...f,
      allowed_pages: f.allowed_pages.includes(href)
        ? f.allowed_pages.filter(p => p !== href)
        : [...f.allowed_pages, href],
    }));
  }

  function toggleCompany(id: string) {
    setForm(f => ({
      ...f,
      allowed_companies: f.allowed_companies.includes(id)
        ? f.allowed_companies.filter(c => c !== id)
        : [...f.allowed_companies, id],
    }));
  }

  async function save() {
    setFormError(null);
    if (!form.full_name.trim()) { setFormError("Ad soyad zorunlu"); return; }
    if (!editing && !form.username.trim()) { setFormError("Kullanıcı adı zorunlu"); return; }
    if (!editing && (!form.password || form.password.length < 6)) { setFormError("Şifre en az 6 karakter olmalı"); return; }
    setSaving(true);
    try {
      const body: any = {
        full_name: form.full_name,
        role: form.role,
        department_id: form.department_id || null,
        is_active: form.is_active,
        allowed_pages: form.restricted_pages ? form.allowed_pages : null,
        allowed_companies: form.restricted_companies ? form.allowed_companies : null,
      };
      if (!editing) { body.username = form.username; body.password = form.password; }
      else if (form.password) { body.password = form.password; }

      const url = editing ? `/api/users/${editing.id}` : "/api/users";
      const method = editing ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.ok) { setShowForm(false); load(); }
      else setFormError(d.error || "Kayıt başarısız");
    } finally { setSaving(false); }
  }

  async function toggleActive(u: any) {
    if (u.id === user?.id) return;
    setTogglingId(u.id);
    try {
      const r = await fetch(`/api/users/${u.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: u.is_active !== 1 }),
      });
      const d = await r.json();
      if (d.ok) load(); else alert(d.error);
    } finally { setTogglingId(null); }
  }

  async function resetPassword() {
    if (!resetPassId || newPassword.length < 6) return;
    setResetting(true);
    try {
      const r = await fetch(`/api/users/${resetPassId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const d = await r.json();
      if (d.ok) { setResetPassId(null); setNewPassword(""); alert("Şifre güncellendi"); }
      else alert(d.error);
    } finally { setResetting(false); }
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.full_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || (u.department_name || "").toLowerCase().includes(q);
    const matchRole = !filterRole || u.role === filterRole;
    return matchSearch && matchRole;
  });

  if (!user) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><p className="text-zinc-500">Yükleniyor...</p></div>;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a href="/admin" className="text-zinc-500 hover:text-white text-sm transition-colors">Yönetim</a>
              <span className="text-zinc-700">/</span>
              <span className="text-white text-sm">Kullanıcılar</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Kullanıcılar</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{users.filter(u => u.is_active).length} aktif, {users.filter(u => !u.is_active).length} pasif</p>
          </div>
          <button onClick={openNew} className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors whitespace-nowrap">
            + Kullanıcı Ekle
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">🔍</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Ad, kullanıcı adı veya departman ara..."
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm pl-8 pr-4 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
            />
          </div>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
            <option value="">Tüm Roller</option>
            <option value="admin">Admin</option>
            <option value="yonetici">Yönetici</option>
            <option value="yetkili">Yetkili</option>
            <option value="personel">Personel</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-5 py-3">Ad Soyad</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Kullanıcı Adı</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Rol</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Departman</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Kısıtlamalar</th>
                  <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 py-3">Durum</th>
                  <th className="px-4 py-3 w-36"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-zinc-600">Kullanıcı bulunamadı</td></tr>
                ) : filtered.map(u => {
                  const roleInfo = ROLE_LABELS[u.role] || ROLE_LABELS.personel;
                  const isSelf = u.id === user?.id;
                  const { ap, ac } = parsePermUser(u);
                  return (
                    <tr key={u.id} className={`border-b border-zinc-800/50 last:border-0 ${!u.is_active ? "opacity-50" : ""}`}>
                      <td className="px-5 py-3.5">
                        <div className="text-white font-medium">{u.full_name}</div>
                        {isSelf && <div className="text-xs text-zinc-600 mt-0.5">Ben</div>}
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <span className="font-mono text-zinc-300 text-xs">{u.username}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex text-xs font-medium border px-2.5 py-0.5 rounded-full ${roleInfo.cls}`}>{roleInfo.label}</span>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell text-zinc-400 text-xs">{u.department_name || "—"}</td>
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {ap !== null && <span className="text-xs bg-amber-950 border border-amber-800 text-amber-300 px-2 py-0.5 rounded-full">{ap.length} sayfa</span>}
                          {ac !== null && <span className="text-xs bg-blue-950 border border-blue-800 text-blue-300 px-2 py-0.5 rounded-full">{ac.length} firma</span>}
                          {ap === null && ac === null && <span className="text-zinc-700 text-xs">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {u.is_active
                          ? <span className="text-xs text-emerald-400">● Aktif</span>
                          : <span className="text-xs text-zinc-600">● Pasif</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(u)}
                            className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2.5 py-1 rounded-lg transition-colors">
                            Düzenle
                          </button>
                          <button onClick={() => { setResetPassId(u.id); setNewPassword(""); }}
                            className="text-xs text-zinc-500 hover:text-amber-400 border border-zinc-700 hover:border-amber-800 px-2.5 py-1 rounded-lg transition-colors">
                            🔑
                          </button>
                          {!isSelf && (
                            <button onClick={() => toggleActive(u)} disabled={togglingId === u.id}
                              className={`text-xs border px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 ${u.is_active ? "text-zinc-600 hover:text-red-400 border-zinc-700 hover:border-red-800" : "text-zinc-500 hover:text-emerald-400 border-zinc-700 hover:border-emerald-800"}`}>
                              {togglingId === u.id ? "..." : u.is_active ? "Pasif" : "Aktif"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg my-auto">
            <div className="flex items-center justify-between px-6 pt-6">
              <h2 className="text-lg font-bold text-white">{editing ? "Kullanıcıyı Düzenle" : "Yeni Kullanıcı"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 px-6 pt-4 border-b border-zinc-800">
              {(["temel", "izinler"] as const).map(tab => (
                <button key={tab} onClick={() => setFormTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors -mb-px ${formTab === tab ? "text-white border-white" : "text-zinc-500 border-transparent hover:text-zinc-300"}`}>
                  {tab === "temel" ? "Temel Bilgiler" : "Erişim İzinleri"}
                </button>
              ))}
            </div>
            <div className="p-6">
              {formTab === "temel" && (
                <div className="space-y-3">
                  {!editing && (
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Kullanıcı Adı *</label>
                      <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, "") }))} placeholder="ahmet.yilmaz" className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 font-mono" />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Ad Soyad *</label>
                    <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                      placeholder="Ahmet Yılmaz" className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Rol *</label>
                      <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                        <option value="personel">Personel</option>
                        <option value="yetkili">Yetkili</option>
                        <option value="yonetici">Yönetici</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Departman</label>
                      <select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                        <option value="">— Seçin —</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                      {editing ? "Şifre (boş bırakırsanız değişmez)" : "Şifre * (min. 6 karakter)"}
                    </label>
                    <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder={editing ? "Değiştirmek için doldurun" : "En az 6 karakter"}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
                  </div>
                  {editing && (
                    <div className="flex items-center gap-3 py-1">
                      <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Durum</label>
                      <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.is_active ? "bg-emerald-600" : "bg-zinc-700"}`}>
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${form.is_active ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                      </button>
                      <span className="text-xs text-zinc-400">{form.is_active ? "Aktif" : "Pasif"}</span>
                    </div>
                  )}
                </div>
              )}

              {formTab === "izinler" && (
                <div className="space-y-5">
                  {/* Page restrictions */}
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <button type="button" onClick={() => setForm(f => ({ ...f, restricted_pages: !f.restricted_pages, allowed_pages: !f.restricted_pages ? (ROLE_PAGE_DEFAULTS[f.role] ?? []) : [] }))}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.restricted_pages ? "bg-amber-600" : "bg-zinc-700"}`}>
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${form.restricted_pages ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                      </button>
                      <div>
                        <p className="text-sm font-semibold text-white">Sayfa Kısıtlaması</p>
                        <p className="text-xs text-zinc-500">{form.restricted_pages ? `${form.allowed_pages.length} sayfa seçili` : "Kısıtlama yok — tüm sayfalar erişilebilir"}</p>
                      </div>
                    </div>
                    {form.restricted_pages && (
                      <div>
                      <button type="button" onClick={() => setForm(f => ({ ...f, allowed_pages: ROLE_PAGE_DEFAULTS[f.role] ?? [] }))}
                        className="mb-2 text-xs text-amber-400 hover:text-amber-300 transition-colors">
                        ↺ Varsayılanları Yükle ({(ROLE_PAGE_DEFAULTS[form.role] ?? []).length} sayfa)
                      </button>
                      <div className="grid grid-cols-2 gap-1.5 bg-zinc-800/50 rounded-xl p-3">
                        {ALL_PAGES.map(pg => (
                          <label key={pg.href} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${form.allowed_pages.includes(pg.href) ? "bg-amber-950 border border-amber-800/60" : "hover:bg-zinc-700/50"}`}>
                            <input type="checkbox" checked={form.allowed_pages.includes(pg.href)} onChange={() => togglePage(pg.href)}
                              className="accent-amber-500 w-4 h-4 flex-shrink-0" />
                            <span className="text-sm text-zinc-300">{pg.label}</span>
                          </label>
                        ))}
                      </div>
                      </div>
                    )}
                  </div>
                  {/* Company restrictions */}
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <button type="button" onClick={() => setForm(f => ({ ...f, restricted_companies: !f.restricted_companies, allowed_companies: [] }))}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.restricted_companies ? "bg-blue-600" : "bg-zinc-700"}`}>
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${form.restricted_companies ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                      </button>
                      <div>
                        <p className="text-sm font-semibold text-white">Firma Kısıtlaması</p>
                        <p className="text-xs text-zinc-500">{form.restricted_companies ? `${form.allowed_companies.length} firma seçili` : "Kısıtlama yok — tüm firmalar görünür"}</p>
                      </div>
                    </div>
                    {form.restricted_companies && (
                      companies.length === 0 ? <p className="text-xs text-zinc-600 px-3">Firma bulunamadı</p> : (
                        <div className="flex flex-col gap-1 bg-zinc-800/50 rounded-xl p-3">
                          {companies.map(c => (
                            <label key={c.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${form.allowed_companies.includes(c.id) ? "bg-blue-950 border border-blue-800/60" : "hover:bg-zinc-700/50"}`}>
                              <input type="checkbox" checked={form.allowed_companies.includes(c.id)} onChange={() => toggleCompany(c.id)}
                                className="accent-blue-500 w-4 h-4 flex-shrink-0" />
                              <span className="text-sm text-zinc-300">{c.name}</span>
                              <span className="ml-auto text-xs text-zinc-600">{c.vehicle_count} araç</span>
                            </label>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {formError && <p className="mt-3 text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2">{formError}</p>}
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
                <button onClick={save} disabled={saving} className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPassId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Şifre Sıfırla</h2>
              <button onClick={() => { setResetPassId(null); setNewPassword(""); }} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <p className="text-zinc-400 text-sm mb-4">
              <span className="text-white font-medium">{users.find(u => u.id === resetPassId)?.full_name}</span> kullanıcısının şifresi güncellenir.
            </p>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Yeni Şifre *</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="En az 6 karakter" autoFocus
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500" />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setResetPassId(null); setNewPassword(""); }} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={resetPassword} disabled={resetting || newPassword.length < 6}
                className="flex-1 bg-amber-500 text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors">
                {resetting ? "Güncelleniyor..." : "Şifreyi Güncelle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
