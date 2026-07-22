"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import Image from "next/image";

type WAState = "initializing" | "qr" | "ready" | "disconnected";

const STATE_LABEL: Record<WAState, { label: string; color: string; dot: string }> = {
  initializing: { label: "Başlatılıyor...", color: "text-yellow-400", dot: "bg-yellow-400 animate-pulse" },
  qr:           { label: "QR Bekleniyor", color: "text-blue-400",   dot: "bg-blue-400 animate-pulse" },
  ready:        { label: "Bağlı",          color: "text-emerald-400", dot: "bg-emerald-400" },
  disconnected: { label: "Bağlı Değil",   color: "text-red-400",    dot: "bg-red-500" },
};

export default function WhatsAppAdminPage() {
  const [user, setUser] = useState<any>(null);
  const [state, setState] = useState<WAState>("disconnected");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok || d.data?.role !== "admin") { router.replace("/"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user]);

  async function poll() {
    try {
      const r = await fetch("/api/admin/whatsapp/status");
      const d = await r.json();
      if (d.ok) {
        setState(d.data.state as WAState);
        setQrDataUrl(d.data.qrDataUrl ?? null);
      }
    } catch {
      // ignore transient errors
    }
  }

  async function handleInit() {
    setLoading(true);
    try {
      await fetch("/api/admin/whatsapp/status", { method: "POST" });
      setState("initializing");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("WhatsApp bağlantısını kesmek istediğinizden emin misiniz?")) return;
    setLoading(true);
    try {
      await fetch("/api/admin/whatsapp/disconnect", { method: "POST" });
      setState("disconnected");
      setQrDataUrl(null);
    } finally {
      setLoading(false);
    }
  }

  if (!user) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">Yükleniyor...</p>
    </div>
  );

  const { label, color, dot } = STATE_LABEL[state] ?? STATE_LABEL.disconnected;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">WhatsApp Yönetimi</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            Şirket WhatsApp Business hattını QR kod ile bağlayın
          </p>
        </div>

        {/* Status card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${dot}`} />
              <div>
                <p className={`font-semibold ${color}`}>{label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {state === "ready"
                    ? "Mesajlar aktif olarak gönderilecek"
                    : state === "qr"
                    ? "WhatsApp uygulamasından QR'ı tarayın"
                    : state === "initializing"
                    ? "Chromium başlatılıyor, birkaç saniye bekleyin..."
                    : "Bağlantı yok — başlatmak için butona tıklayın"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {(state === "disconnected") && (
                <button
                  onClick={handleInit}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {loading ? "..." : "Bağlan"}
                </button>
              )}
              {(state === "ready" || state === "qr" || state === "initializing") && (
                <button
                  onClick={handleDisconnect}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-red-900/60 hover:bg-red-800 text-red-300 text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {loading ? "..." : "Bağlantıyı Kes"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* QR code */}
        {state === "qr" && qrDataUrl && (
          <div className="bg-zinc-900 border border-blue-800/40 rounded-2xl p-6 flex flex-col items-center gap-4">
            <p className="text-sm text-zinc-300 text-center">
              WhatsApp uygulamanızda → <strong>Bağlı Cihazlar</strong> → <strong>Cihaz Bağla</strong> seçin ve bu QR'ı tarayın
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="WhatsApp QR Kodu"
              className="w-64 h-64 rounded-xl border border-zinc-700"
            />
            <p className="text-xs text-zinc-500">QR kod 3 saniyede bir yenilenir</p>
          </div>
        )}

        {/* Info box */}
        <div className="mt-6 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-500 space-y-1">
          <p>• Bağlantı kurulduktan sonra sunucu yeniden başlatılsa bile oturum korunur.</p>
          <p>• Kullanıcı profillerinde <strong className="text-zinc-400">WhatsApp Numarası</strong> girilmiş olanlara bildirim gönderilir.</p>
          <p>• Numara formatı: <code className="text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded">905XXXXXXXXX</code> (+ işareti olmadan)</p>
          <p>• Telegram veya SMS gibi ek kanallar eklenene kadar bu hat birincil bildirim kanalıdır.</p>
        </div>
      </main>
    </div>
  );
}
