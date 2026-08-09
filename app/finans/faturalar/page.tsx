"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Faturalar ekranı "Gider" ile birleştirildi — eski veri finans_fatura
// tablosunda korunuyor, sadece bu ekran artık kullanılmıyor.
export default function FaturalarPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/finans/gider"); }, [router]);
  return null;
}
