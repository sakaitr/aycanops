"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";

const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "application/xml": "XML",
  "text/xml": "XML",
};

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

function formatBoyut(bytes: unknown): string {
  const b = Number(bytes || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTarih(v: unknown): string {
  if (!v) return "—";
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" });
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5 text-zinc-400">
      <path d="M5 2.5h7l3 3v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M12 2.5v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5 text-zinc-400">
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="7" cy="8" r="1.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 14.5 8 10.5 11 13l2-2 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function BelgelerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    });
  }, []);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/finans/belge");
      const d = await r.json();
      if (d.ok) setRows(d.data);
    } finally { setLoading(false); }
  }

  async function upload() {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("dosya", selectedFile);
      const res = await fetch("/api/finans/belge", { method: "POST", body: formData });
      const d = await res.json();
      if (!d.ok) {
        if (res.status === 409) {
          toast.error(typeof d.error === "string" ? d.error : "Bu dosya zaten yüklenmiş");
        } else {
          toast.error(typeof d.error === "string" ? d.error : "Yükleme başarısız");
        }
        return;
      }
      toast.success("Belge yüklendi");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } finally { setUploading(false); }
  }

  async function remove(row: any) {
    if (!confirm(`"${row.dosya_adi}" silinsin mi?`)) return;
    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/finans/belge/${row.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Silme başarısız"); return; }
      toast.success("Belge silindi");
      load();
    } finally { setDeletingId(null); }
  }

  const canCreate = hasPermission(user, "finans_belge:create");
  const canDelete = hasPermission(user, "finans_belge:delete");

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Belgeler</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{rows.length} kayıt</p>
          </div>

          {canCreate && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4 mb-6">
              <span className="text-zinc-400 text-xs font-medium mb-2 block">Yeni Belge Yükle</span>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.xml,application/pdf,image/jpeg,image/png,image/webp,application/xml,text/xml"
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  className="text-sm text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:text-zinc-200 file:text-sm file:font-medium hover:file:bg-zinc-700 file:cursor-pointer"
                />
                <button
                  onClick={upload}
                  disabled={!selectedFile || uploading}
                  className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {uploading ? "Yükleniyor..." : "Yükle"}
                </button>
              </div>
              <p className="text-zinc-600 text-xs mt-2">PDF, JPEG, PNG, WEBP veya XML. En fazla 15MB.</p>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-zinc-600">Henüz belge yok</div>
          ) : (
            <div className="space-y-2">
              {rows.map(row => (
                <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="shrink-0">
                    {isImageMime(row.mime_type) ? <ImageIcon /> : <DocumentIcon />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium text-sm truncate">{row.dosya_adi}</span>
                      <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-zinc-800 text-zinc-400 shrink-0">
                        {MIME_LABELS[row.mime_type] || row.mime_type}
                      </span>
                    </div>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      {formatBoyut(row.boyut_bayt)} · {formatTarih(row.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`/api/uploads/finans-belge/${row.dosya_yolu}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
                    >
                      İndir/Görüntüle
                    </a>
                    {canDelete && (
                      <button
                        onClick={() => remove(row)}
                        disabled={deletingId === row.id}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-950 text-red-300 hover:bg-red-900 disabled:opacity-50 transition-colors"
                      >
                        Sil
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
