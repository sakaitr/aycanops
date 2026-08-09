"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function FinansGirisPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.ok) {
        router.push("/finans");
      } else {
        setError(data.error || "Giriş başarısız");
      }
    } catch {
      setError("Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="relative w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/branding/aycan-logo.png" alt="Aycan" className="h-14 w-auto object-contain" />
          <div className="text-center">
            <h1 className="text-xl font-semibold text-white tracking-tight">Aycan Finans</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Finans Departmanı Paneli</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl shadow-black/40">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400" htmlFor="username">
                Kullanıcı Adı
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                spellCheck={false}
                className="w-full h-10 px-3.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/50 transition-all text-sm"
                placeholder="kullanici.adi"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400" htmlFor="password">
                Şifre
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full h-10 px-3.5 pr-10 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/50 transition-all text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors text-xs"
                  tabIndex={-1}
                >
                  {showPassword ? "Gizle" : "Göster"}
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  key={error}
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -4, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2.5 bg-red-950/60 border border-red-900/60 text-red-300 text-sm px-3.5 py-2.5 rounded-lg">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {error}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="w-full h-10 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm mt-1 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
                  </svg>
                  Giriş yapılıyor...
                </>
              ) : "Giriş Yap"}
            </button>
          </form>
        </div>

        <p className="text-center text-zinc-700 text-xs mt-6">Aycan Turizm · Finans Paneli</p>
      </div>
    </div>
  );
}
