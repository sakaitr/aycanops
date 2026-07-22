"use client";
import { createContext, useContext, useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "aycan_global_company";

interface Company {
  id: string;
  name: string;
}

interface CompanyContextValue {
  companies: Company[];
  loadingCompanies: boolean;
  selectedCompanyId: string;
  selectedCompanyName: string;
  setSelectedCompany: (id: string) => void;
  clearSelectedCompany: () => void;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored) setSelectedCompanyId(stored);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    // Root layout (ve bu provider) sayfa geçişlerinde yeniden mount olmuyor. Bu
    // effect ilk sayfa yüklemesinde (örn. henüz giriş yapılmamışken /login'de)
    // çalışırsa 401 alır ve firmalar hep boş kalır — login sonrası client-side
    // yönlendirmede tekrar denenmez. Başarılı olana kadar tekrar dener.
    function attempt() {
      fetch("/api/companies?limit=9999")
        .then(r => r.json())
        .then(d => {
          if (cancelled) return;
          if (d.ok) { setCompanies(d.data); setLoadingCompanies(false); }
          else timer = setTimeout(attempt, 2000);
        })
        .catch(() => { if (!cancelled) timer = setTimeout(attempt, 2000); });
    }
    attempt();

    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  const setSelectedCompany = useCallback((id: string) => {
    setSelectedCompanyId(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const clearSelectedCompany = useCallback(() => {
    setSelectedCompanyId("");
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const selectedCompanyName = companies.find(c => c.id === selectedCompanyId)?.name || "";

  return (
    <CompanyContext.Provider
      value={{ companies, loadingCompanies, selectedCompanyId, selectedCompanyName, setSelectedCompany, clearSelectedCompany }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useGlobalCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useGlobalCompany, CompanyProvider içinde kullanılmalı");
  return ctx;
}
