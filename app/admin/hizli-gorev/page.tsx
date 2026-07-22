"use client";
import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

export default function HizliGorevPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);

  const [personel, setPersonel] = useState("");
  const [firma, setFirma] = useState("");
  const [plaka, setPlaka] = useState("");
  const [sorun, setSorun] = useState("");
  const [termin, setTermin] = useState("");
  const [reminderCount, setReminderCount] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok || d.data?.role !== "admin") { router.replace("/"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/users?simple=1").then(r => r.json()).then(d => { if (d.ok) setUsers(d.data); });
  }, [user]);

  function resetForm() {
    setPersonel(""); setFirma(""); setPlaka(""); setSorun(""); setTermin("");
    setReminderCount(4); setError(null); setSuccess(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!personel || !sorun.trim()) return;
    setSubmitting(true);
    setError(null);

    const parts = [firma, plaka, sorun].filter(Boolean);
    const title = parts.join(" — ").slice(0, 200);
    const description = [
      firma ? `Firma: ${firma}` : null,
      plaka ? `Plaka: ${plaka}` : null,
      `Sorun: ${sorun}`,
    ].filter(Boolean).join("\n");

    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        priority_code: "high",
        assigned_to: personel,
        due_date: termin || null,
        reminder_daily_max: reminderCount,
      }),
    });
    const d = await res.json();
    if (!d.ok) { setError(d.error || "Görev oluşturulamadı"); setSubmitting(false); return; }

    setSuccess(true);
    setSubmitting(false);
  }

  if (!user) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><p className="text-zinc-500">Yükleniyor...</p></div>;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 mb-1">
          <a href="/admin" className="text-zinc-500 hover:text-white text-sm transition-colors">Yönetim</a>
          <span className="text-zinc-700">/</span>
          <span className="text-white text-sm">Hızlı Görev Ata</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-6">⚡ Hızlı Görev Ata</h1>

        {success ? (
          <div className="bg-emerald-950 border border-emerald-800 rounded-2xl p-8 text-center">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-emerald-300 font-semibold text-lg mb-1">Görev oluşturuldu</p>
            <p className="text-zinc-400 text-sm mb-6">Personele bildirim gönderildi.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={resetForm}
                className="bg-zinc-800 text-zinc-300 text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">
                Yeni Görev
              </button>
              <a href="/gorevler"
                className="bg-white text-zinc-950 text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-zinc-200 transition-colors">
                Görevlere Git →
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
            {/* Personel */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Personel *</label>
              <select value={personel} onChange={e => setPersonel(e.target.value)} required
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                <option value="">— Personel seçin —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name}{u.role ? ` (${u.role})` : ""}</option>
                ))}
              </select>
            </div>

            {/* Firma + Plaka */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Firma</label>
                <input type="text" value={firma} onChange={e => setFirma(e.target.value)}
                  placeholder="Firma adı"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 placeholder-zinc-600" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Plaka</label>
                <input type="text" value={plaka} onChange={e => setPlaka(e.target.value.toUpperCase())}
                  placeholder="34 ABC 123"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 font-mono uppercase tracking-widest placeholder-zinc-600" />
              </div>
            </div>

            {/* Sorun */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Sorun Açıklaması *</label>
              <textarea value={sorun} onChange={e => setSorun(e.target.value)} required rows={4}
                placeholder="Sorunun detaylı açıklaması..."
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none placeholder-zinc-600" />
            </div>

            {/* Termin + Hatırlatma */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Termin Tarihi</label>
                <input type="date" value={termin} onChange={e => setTermin(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Günlük Hatırlatma</label>
                <select value={reminderCount} onChange={e => setReminderCount(Number(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  <option value={1}>1x / gün</option>
                  <option value={2}>2x / gün</option>
                  <option value={4}>4x / gün</option>
                  <option value={8}>8x / gün</option>
                </select>
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <a href="/admin" className="flex-shrink-0 bg-zinc-800 text-zinc-300 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">
                İptal
              </a>
              <button type="submit" disabled={submitting || !personel || !sorun.trim()}
                className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors">
                {submitting ? "Oluşturuluyor..." : "⚡ Görev Oluştur ve Bildir"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
