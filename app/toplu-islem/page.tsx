"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";

const MODULES = [
  { value: "companies", label: "Firmalar" },
  { value: "vehicles", label: "Araçlar" },
  { value: "drivers", label: "Sürücüler" },
  { value: "passengers", label: "Yolcular/Personeller" },
  { value: "routes", label: "Güzergahlar" },
];

export default function TopluIslemPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<any>(null);
  const [module, setModule] = useState("vehicles");
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d.ok) setUser(d.data); else router.replace("/login"); }).catch(() => router.replace("/login"));
  }, [router]);

  async function loadJobs() {
    const d = await fetch("/api/imports").then(r => r.json()).catch(() => null);
    if (d?.ok) setJobs(d.data);
  }

  useEffect(() => { loadJobs(); }, []);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error("Excel dosyası seçin"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("module", module);
      fd.append("file", file);
      const d = await fetch("/api/imports", { method: "POST", body: fd }).then(r => r.json());
      if (!d.ok) { toast.error(d.error || "Yükleme başarısız"); return; }
      toast.success("Import önizlemesi oluşturuldu");
      await loadJobs();
      await openJob(d.data.id);
      if (fileRef.current) fileRef.current.value = "";
    } finally { setUploading(false); }
  }

  async function openJob(id: string) {
    const d = await fetch(`/api/imports/${id}`).then(r => r.json());
    if (!d.ok) { toast.error(d.error || "Önizleme alınamadı"); return; }
    setSelectedJob(d.data.job);
    setPreview(d.data);
  }

  async function executeJob() {
    if (!selectedJob) return;
    setExecuting(true);
    try {
      const d = await fetch(`/api/imports/${selectedJob.id}/execute`, { method: "POST" }).then(r => r.json());
      if (!d.ok) { toast.error(d.error || "Import çalıştırılamadı"); return; }
      toast.success(`Import tamamlandı: ${d.data.inserted} yeni, ${d.data.updated} güncellendi`);
      await loadJobs();
      await openJob(selectedJob.id);
    } finally { setExecuting(false); }
  }

  async function rollbackJob() {
    if (!selectedJob) return;
    if (!confirm("Bu import ile yeni eklenen kayıtlar geri alınsın mı? Güncellenen kayıtlar güvenlik için otomatik geri alınmaz.")) return;
    setRollingBack(true);
    try {
      const d = await fetch(`/api/imports/${selectedJob.id}/rollback`, { method: "POST" }).then(r => r.json());
      if (!d.ok) { toast.error(d.error || "Geri alma başarısız"); return; }
      toast.success(`Geri alma tamamlandı: ${d.data.rolledBack} kayıt silindi, ${d.data.skipped} satır atlandı`);
      await loadJobs();
      await openJob(selectedJob.id);
    } finally { setRollingBack(false); }
  }

  const jobRows = preview?.rows || [];
  const hasErrors = jobRows.some((r: any) => r.errors?.length > 0);

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">MVP-2</p>
          <h1 className="mt-1 text-2xl font-bold text-white">Excel Import ve Toplu İşlem Merkezi</h1>
          <p className="mt-1 text-sm text-zinc-500">Şablon indir, dosya yükle, satır bazlı hata önizle ve onayla.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
              <h2 className="font-semibold text-white">Yeni import</h2>
              <div className="mt-4 space-y-3">
                <select value={module} onChange={e => setModule(e.target.value)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-600">
                  {MODULES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <a href={`/api/imports/templates?module=${module}`} className="block rounded-xl border border-zinc-700 px-3 py-2 text-center text-sm font-semibold text-zinc-200 hover:bg-zinc-800">Şablon indir</a>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" />
                <button disabled={uploading} onClick={upload} className="w-full rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50">{uploading ? "Yükleniyor..." : "Yükle ve doğrula"}</button>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
              <h2 className="font-semibold text-white">Son job'lar</h2>
              <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {jobs.map(job => (
                  <button key={job.id} onClick={() => openJob(job.id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedJob?.id === job.id ? "border-sky-600 bg-sky-950/40" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-white">{MODULES.find(m => m.value === job.module)?.label || job.module}</span>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">{job.status}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-zinc-500">{job.file_name}</p>
                    <p className="mt-1 text-[11px] text-zinc-600">{job.total_rows} satır · {job.error_rows} hata</p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            {!preview ? (
              <div className="flex min-h-[420px] items-center justify-center text-center text-sm text-zinc-500">Bir Excel yükleyin veya soldan job seçin.</div>
            ) : (
              <div>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-white">Önizleme</h2>
                    <p className="text-xs text-zinc-500">{selectedJob?.total_rows} satır · {selectedJob?.valid_rows} geçerli · {selectedJob?.error_rows} hatalı</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(selectedJob?.status === "completed" || selectedJob?.status === "partial") && (
                      <button disabled={rollingBack} onClick={rollbackJob} className="rounded-xl border border-amber-700 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-950 disabled:cursor-not-allowed disabled:opacity-40">
                        {rollingBack ? "Geri alınıyor..." : "Yeni kayıtları geri al"}
                      </button>
                    )}
                    <button disabled={executing || hasErrors || selectedJob?.status === "completed" || selectedJob?.status === "rolled_back"} onClick={executeJob} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">
                      {selectedJob?.status === "completed" ? "Tamamlandı" : selectedJob?.status === "rolled_back" ? "Geri alındı" : executing ? "Çalışıyor..." : "Onayla ve import et"}
                    </button>
                  </div>
                </div>

                {hasErrors && <div className="mb-3 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">Hatalı satırlar var. Execute kapalı; dosyayı düzeltip yeniden yükleyin.</div>}

                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="text-zinc-500">
                      <tr className="border-b border-zinc-800">
                        <th className="px-3 py-2">Satır</th>
                        <th className="px-3 py-2">Durum</th>
                        <th className="px-3 py-2">Veri</th>
                        <th className="px-3 py-2">Hata/Uyarı</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobRows.slice(0, 200).map((row: any) => (
                        <tr key={row.id} className="border-b border-zinc-800/60 align-top">
                          <td className="px-3 py-2 text-zinc-400">{row.row_no}</td>
                          <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 ${row.errors?.length ? "bg-red-950 text-red-300" : row.warnings?.length ? "bg-amber-950 text-amber-300" : "bg-emerald-950 text-emerald-300"}`}>{row.status}</span></td>
                          <td className="max-w-[460px] px-3 py-2 text-zinc-300"><pre className="whitespace-pre-wrap font-mono text-[11px]">{JSON.stringify(row.normalized, null, 2)}</pre></td>
                          <td className="px-3 py-2 text-zinc-400">
                            {[...(row.errors || []), ...(row.warnings || [])].map((m: string) => <div key={m}>{m}</div>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
