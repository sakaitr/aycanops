"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

export default function AdminPage() {
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const router = useRouter();

  // Manuel bildirim
  const [users, setUsers] = useState<any[]>([]);
  const [notifForm, setNotifForm] = useState({ user_id: "", title: "", body: "", link: "" });
  const [sendingNotif, setSendingNotif] = useState(false);
  const [notifResult, setNotifResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok || d.data?.role !== "admin") { router.replace("/"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetch("/api/users").then(r => r.json()),
      fetch("/api/companies").then(r => r.json()),
      fetch("/api/vehicles").then(r => r.json()),
      fetch("/api/departments").then(r => r.json()),
    ]).then(([u, c, v, d]) => {
      setStats({
        users: u.ok ? u.data.length : 0,
        activeUsers: u.ok ? u.data.filter((x: any) => x.is_active).length : 0,
        companies: c.ok ? (c.meta?.total ?? c.data.length) : 0,
        vehicles: v.ok ? (v.meta?.total ?? v.data.length) : 0,
        departments: d.ok ? d.data.length : 0,
      });
      if (u.ok) setUsers(u.data.filter((x: any) => x.is_active));
    });
  }, [user]);

  async function sendNotification() {
    if (!notifForm.title.trim()) return;
    setSendingNotif(true);
    setNotifResult(null);
    try {
      const r = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: notifForm.user_id || undefined,
          title: notifForm.title,
          body: notifForm.body || undefined,
          link: notifForm.link || undefined,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setNotifResult({ ok: true, msg: d.data?.broadcast ? `${d.data.count} kişiye gönderildi` : "Gönderildi" });
        setNotifForm({ user_id: "", title: "", body: "", link: "" });
      } else {
        setNotifResult({ ok: false, msg: typeof d.error === "string" ? d.error : "Hata oluştu" });
      }
    } catch {
      setNotifResult({ ok: false, msg: "Sunucuya bağlanılamadı" });
    } finally {
      setSendingNotif(false);
    }
  }

  if (!user) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><p className="text-zinc-500">Yükleniyor...</p></div>;

  const cards = [
    {
      href: "/admin/kullanicilar",
      icon: "👤",
      title: "Kullanıcılar",
      desc: "Kullanıcı ekleme, rol/departman değiştirme, sayfa ve firma izinleri",
      stat: stats ? `${stats.activeUsers} aktif / ${stats.users} toplam` : "...",
      color: "border-blue-800/50 hover:border-blue-700",
    },
    {
      href: "/admin/departmanlar",
      icon: "🏗",
      title: "Departmanlar",
      desc: "Departman ekleme, düzenleme ve silme",
      stat: stats ? `${stats.departments} departman` : "...",
      color: "border-purple-800/50 hover:border-purple-700",
    },
    {
      href: "/admin/firmalar",
      icon: "🏢",
      title: "Firmalar",
      desc: "Firma ekleme, düzenleme ve silme",
      stat: stats ? `${stats.companies} firma` : "...",
      color: "border-emerald-800/50 hover:border-emerald-700",
    },
    {
      href: "/admin/araclar",
      icon: "🚗",
      title: "Araçlar",
      desc: "Servis araçları silme (düzenleme için Araçlar sayfası)",
      stat: stats ? `${stats.vehicles} araç` : "...",
      color: "border-amber-800/50 hover:border-amber-700",
    },
    {
      href: "/admin/denetim-turleri",
      icon: "🔍",
      title: "Denetim Türleri",
      desc: "Denetim türü ve her türe ait kontrol kriterleri yönetimi",
      stat: "",
      color: "border-cyan-800/50 hover:border-cyan-700",
    },
    {
      href: "/admin/gunluk-sorulari",
      icon: "📋",
      title: "Günlük Soruları",
      desc: "İşe başlama check-in'inde sorulacak sorular ve cevap tipleri",
      stat: "",
      color: "border-teal-800/50 hover:border-teal-700",
    },
    {
      href: "/admin/is-giris-qr",
      icon: "📱",
      title: "İşe Başlama QR",
      desc: "Ofis girişine asılacak, günlük check-in'i açan QR poster",
      stat: "",
      color: "border-sky-800/50 hover:border-sky-700",
    },
    {
      href: "/admin/uyarilar",
      icon: "⚠️",
      title: "Uyarılar",
      desc: "Plaka ve şöför bazlı uyarı kayıtları, termin takibi",
      stat: "",
      color: "border-red-800/50 hover:border-red-700",
    },
    {
      href: "/admin/hizli-gorev",
      icon: "⚡",
      title: "Hızlı Görev Ata",
      desc: "Plaka ve firma bilgisiyle personele anında görev oluştur ve bildirim gönder",
      stat: "",
      color: "border-orange-800/50 hover:border-orange-700",
    },
    {
      href: "/admin/whatsapp",
      icon: "💬",
      title: "WhatsApp Yönetimi",
      desc: "Şirket WA Business hattını QR ile bağla, bildirim kanalını yönet",
      stat: "",
      color: "border-green-800/50 hover:border-green-700",
    },
    {
      href: "/admin/bildirim-kurallari",
      icon: "🔔",
      title: "Bildirim Kuralları",
      desc: "Araç belgesi, sürücü belgesi, bakım ve sözleşme uyarıları için otomatik bildirim kuralları",
      stat: "",
      color: "border-blue-800/50 hover:border-blue-700",
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Sistem Yönetimi</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Tüm sistem bileşenlerini buradan yönetebilirsiniz</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map(card => (
            <Link
              key={card.href}
              href={card.href}
              className={`bg-zinc-900 border ${card.color} rounded-2xl p-6 flex flex-col gap-3 transition-colors group`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{card.icon}</span>
                <div>
                  <p className="text-white font-semibold group-hover:text-white">{card.title}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{card.stat}</p>
                </div>
              </div>
              <p className="text-sm text-zinc-500">{card.desc}</p>
              <span className="text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors">Yönet →</span>
            </Link>
          ))}
        </div>

        {/* Manuel Bildirim Gönder */}
        <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Manuel Bildirim Gönder</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Alıcı</label>
              <select
                value={notifForm.user_id}
                onChange={e => setNotifForm(f => ({ ...f, user_id: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
              >
                <option value="">— Tüm Kullanıcılar (Broadcast) —</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Başlık *</label>
              <input
                value={notifForm.title}
                onChange={e => setNotifForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Bildirim başlığı"
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Mesaj</label>
              <textarea
                value={notifForm.body}
                onChange={e => setNotifForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Bildirim mesajı (opsiyonel)"
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Link</label>
              <input
                value={notifForm.link}
                onChange={e => setNotifForm(f => ({ ...f, link: e.target.value }))}
                placeholder="/gorevler (opsiyonel)"
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500"
              />
            </div>
            {notifResult && (
              <div className={`px-3 py-2 rounded-lg text-sm flex items-center justify-between ${notifResult.ok ? "bg-emerald-950 border border-emerald-800 text-emerald-300" : "bg-red-950 border border-red-800 text-red-300"}`}>
                <span>{notifResult.ok ? "✓ " : "✗ "}{notifResult.msg}</span>
                <button onClick={() => setNotifResult(null)} className="ml-3 opacity-60 hover:opacity-100">×</button>
              </div>
            )}
            <button
              onClick={sendNotification}
              disabled={sendingNotif || !notifForm.title.trim()}
              className="bg-white text-zinc-950 text-sm font-semibold px-5 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors"
            >
              {sendingNotif ? "Gönderiliyor..." : "🔔 Gönder"}
            </button>
          </div>
        </div>

        {/* Quick info + backup */}
        <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Oturum Bilgisi</p>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div><span className="text-zinc-500">Kullanıcı: </span><span className="text-white">{user.full_name}</span></div>
            <div><span className="text-zinc-500">Rol: </span><span className="text-white">Admin</span></div>
            <div><span className="text-zinc-500">Kullanıcı adı: </span><span className="text-zinc-300 font-mono">{user.username}</span></div>
            <div className="ml-auto">
              <a
                href="/api/admin/backup"
                download
                className="inline-flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                ↓ Veritabanı Yedeği Al
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
