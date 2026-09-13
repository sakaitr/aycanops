import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { RequestError } from "@/lib/request-error";
import { cancelCeteleMany } from "@/lib/cetele-cancel";

// Bir hücrenin birden çok kaydını (örn. giriş+çıkış) TEK transaction'da iptal eder.
// Takvim'de tek tek PUT çağrısı yapmanın yerine — biri reddedilirse (örn. hakedişe
// bağlı) hiçbiri iptal olmaz, önceki başarılı iptaller sonraki hatayla geri alınmaz.
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "cetele:cancel"))
      return NextResponse.json({ ok: false, error: "İptal yetkiniz yok" }, { status: 403 });

    const body = await req.json();
    const ids: unknown = body.ids;
    if (!Array.isArray(ids) || ids.some(id => typeof id !== "string") || ids.length === 0)
      throw new RequestError("Kayıt seçilmedi");

    await cancelCeteleMany(ids as string[], body.geri_alma_nedeni, user);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
