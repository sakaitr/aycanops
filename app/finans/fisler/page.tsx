"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Fişler ekranı "Gider" ile birleştirildi — eski veri finans_fis
// tablosunda korunuyor, sadece bu ekran artık kullanılmıyor.
export default function FislerPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/finans/gider"); }, [router]);
  return null;
}
