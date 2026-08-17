import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { finansGiderSchema } from "@/lib/schemas";
import { createGiderRecord, validateGiderFields } from "@/lib/finans-gider";
import { z } from "zod";

const bulkSchema = z.array(finansGiderSchema).min(1).max(500);

// POST /api/finans/gider/bulk — /api/finans/gider/import ile önizlenip
// onaylanan satırların toplu kaydı. Satır bazlı hata olsa da diğer satırlar
// işlenmeye devam eder; sonuçta hangi satırların başarısız olduğu döner.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_gider:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = bulkSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

    let created = 0;
    const hatalar: { index: number; hata: string }[] = [];
    for (let i = 0; i < parsed.data.length; i++) {
      const d = parsed.data[i];
      const fieldErrors = validateGiderFields(d);
      if (fieldErrors) { hatalar.push({ index: i, hata: Object.values(fieldErrors).flat().join(", ") }); continue; }
      try {
        await createGiderRecord(user.id, d);
        created++;
      } catch (e: any) {
        hatalar.push({ index: i, hata: e?.message || "Kayıt hatası" });
      }
    }

    return NextResponse.json({ ok: true, data: { created, hatalar } });
  } catch (e) { return apiError(e); }
}
