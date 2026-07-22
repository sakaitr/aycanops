import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

// Sürücülerin doğum günlerini, bugünden itibaren yaklaşan sıraya göre listeler
// (yıl farkını yok sayıp ay/gün bazında sıralar — "yıl dönümü" mantığı).
export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "drivers:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    // Bu yılki (veya geçtiyse gelecek yılki) doğum günü tarihini hesaplayıp
    // ona göre sıralar — en yakın doğum günü en üstte.
    const rows = await getDb().prepare(
      `SELECT id, name, birth_date, phone, company_id
       FROM drivers
       WHERE birth_date IS NOT NULL AND status = 'aktif'
       ORDER BY
         CASE
           WHEN DATE_ADD(birth_date, INTERVAL (YEAR(CURDATE()) - YEAR(birth_date)) YEAR) >= CURDATE()
           THEN DATE_ADD(birth_date, INTERVAL (YEAR(CURDATE()) - YEAR(birth_date)) YEAR)
           ELSE DATE_ADD(birth_date, INTERVAL (YEAR(CURDATE()) - YEAR(birth_date) + 1) YEAR)
         END ASC`
    ).all();

    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}
