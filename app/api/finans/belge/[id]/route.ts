import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { deleteFinansBelge } from "@/lib/uploads-finans";

// Belge içeriği değiştirilemez — sadece silinip yeniden yüklenir, bu yüzden
// bu route'ta yalnızca DELETE var (PUT/PATCH yok).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_belge:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    const belge = await db.prepare(`SELECT dosya_yolu FROM finans_belge WHERE id = ?`).get(id) as
      { dosya_yolu: string } | undefined;
    if (!belge) return NextResponse.json({ ok: false, error: "Belge bulunamadı" }, { status: 404 });

    await db.prepare(`DELETE FROM finans_belge WHERE id = ?`).run(id);
    await deleteFinansBelge(belge.dosya_yolu);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
