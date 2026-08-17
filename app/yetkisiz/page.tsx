"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";

type CurrentUser = {
  full_name: string;
  role: string;
  allowed_pages?: string | null;
  landing_page?: string | null;
};

const ROLE_HOME: Record<string, string> = {
  personel: "/giris-kontrol",
  yetkili: "/",
  yonetici: "/",
  admin: "/",
};

export default function YetkisizPage() {
  return (
    <Suspense fallback={<YetkisizFallback />}>
      <YetkisizContent />
    </Suspense>
  );
}

function YetkisizFallback() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <main className="max-w-xl mx-auto px-4 py-16">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 shadow-2xl">
          <div className="h-5 w-48 rounded bg-amber-500/20 animate-pulse" />
          <div className="mt-4 h-4 w-full rounded bg-zinc-800 animate-pulse" />
          <div className="mt-2 h-4 w-3/4 rounded bg-zinc-800 animate-pulse" />
        </div>
      </main>
    </div>
  );
}

function YetkisizContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<CurrentUser | null>(null);

  const next = searchParams.get("next") || "";
  const homePath = useMemo(
    () => user?.landing_page || ROLE_HOME[user?.role || "personel"] || "/",
    [user?.role, user?.landing_page]
  );

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setUser(d.data);
        else router.replace("/login");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Nav user={user} />
      <main className="max-w-xl mx-auto px-4 py-16">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-2xl mb-4">
            ⚠️
          </div>
          <h1 className="text-xl font-bold text-white">Bu sayfaya erişim yetkiniz yok</h1>
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
            Kullanıcı rolünüz veya size tanımlanan sayfa/firma kapsamı bu ekranı görüntülemek için yeterli değil.
            Erişimin gerekli olduğunu düşünüyorsanız yöneticinizden yetki talep edin.
          </p>

          {next && (
            <div className="mt-4 rounded-xl bg-zinc-900/80 border border-zinc-800 px-3 py-2">
              <p className="text-[11px] text-zinc-500 mb-0.5">Engellenen sayfa</p>
              <p className="text-xs text-zinc-300 break-all">{next}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button
              onClick={() => router.replace(homePath)}
              className="flex-1 rounded-xl bg-white text-zinc-950 text-sm font-semibold px-4 py-2.5 hover:bg-zinc-200 transition-colors"
            >
              Yetkili ana ekrana dön
            </button>
            <button
              onClick={() => router.back()}
              className="flex-1 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-medium px-4 py-2.5 hover:bg-zinc-800 transition-colors"
            >
              Geri dön
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}