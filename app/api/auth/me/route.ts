import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    // permissions: rolün DB'deki güncel izin listesi — client tarafında hasPermission()
    // çağrıları (ör. Nav.tsx) bunu kullanınca, admin panelden yapılan izin değişiklikleri
    // client bundle'ının statik varsayılanlarına değil, gerçek/güncel veriye göre çalışır.
    const permissions = user.role === "admin" ? undefined : Array.from(getEffectivePermissions(user.role));
    return NextResponse.json({ ok: true, data: { ...user, permissions } });
  } catch {
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
