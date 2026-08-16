"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import Nav from "@/components/Nav";

export default function IsGirisQrPage() {
  const [user, setUser] = useState<any>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok) { router.replace("/login"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/login"));
  }, [router]);

  useEffect(() => {
    const target = `${window.location.origin}/is-giris`;
    setUrl(target);
    QRCode.toDataURL(target, { width: 480, margin: 2 }).then(setDataUrl);
  }, []);

  if (!user) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">Yükleniyor...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="print:hidden">
        <Nav user={user} />
      </div>
      <main className="max-w-md mx-auto px-4 py-12 print:py-0 print:max-w-none">
        <div className="flex items-center gap-2 mb-6 print:hidden">
          <a href="/admin" className="text-zinc-500 hover:text-white text-sm transition-colors">Yönetim</a>
          <span className="text-zinc-700">/</span>
          <span className="text-white text-sm">İşe Başlama QR</span>
        </div>

        <div className="bg-white rounded-2xl p-8 text-center print:shadow-none print:rounded-none">
          <p className="text-zinc-900 text-lg font-bold mb-1">Aycan Turizm</p>
          <p className="text-zinc-600 text-sm mb-6">İşe başlarken bu QR'ı okutun</p>
          {dataUrl && <img src={dataUrl} alt="İşe Başlama QR" className="mx-auto" />}
          <p className="text-zinc-400 text-xs mt-6 break-all">{url}</p>
        </div>

        <button onClick={() => window.print()}
          className="w-full mt-4 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 transition-colors print:hidden">
          Yazdır
        </button>
      </main>
    </div>
  );
}
