"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function PortalGirisPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.ok) {
        router.push("/portal");
      } else {
        setError(data.error || "Giriş başarısız");
      }
    } catch {
      setError("Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="relative w-full max-w-[360px]">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[var(--t-accent)] flex items-center justify-center shadow-lg">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 8l9-5 9 5v8l-9 5-9-5V8z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M12 3v18M3 8l9 5 9-5" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-[var(--foreground)]">Aycan Müşteri Portalı</h1>
            <p className="text-[var(--t-text-500)] text-sm mt-0.5">Firma hesabınızla giriş yapın</p>
          </div>
        </div>

        {/* Kart */}
        <div className="bg-[var(--t-800)] border border-[var(--t-border-700)] rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--t-text-400)] uppercase tracking-wide">
                E-posta
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] rounded-xl px-3 py-2.5 text-[16px] text-[var(--foreground)] placeholder-[var(--t-text-600)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)] transition-all"
                placeholder="firma@ornek.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--t-text-400)] uppercase tracking-wide">
                Şifre
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[var(--t-900)] border border-[var(--t-border-800)] rounded-xl px-3 py-2.5 text-[16px] text-[var(--foreground)] placeholder-[var(--t-text-600)] focus:outline-none focus:ring-2 focus:ring-[var(--t-accent)] transition-all"
                placeholder="••••••••"
              />
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--t-accent)] hover:opacity-90 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-3 text-sm transition-all min-h-[44px]"
            >
              {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[var(--t-text-600)] mt-6">
          Hesap oluşturmak için yöneticinizle iletişime geçin.
        </p>
      </div>
    </div>
  );
}
