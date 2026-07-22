import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { destroyWAClient } from "@/lib/whatsapp-client";
import { hasPermission } from "@/lib/permissions";

export async function POST() {
  try {
    const user = await requireUser();
    if (!user || !hasPermission(user, "integrations:update")) {
      return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 403 });
    }

    await destroyWAClient();
    return NextResponse.json({ ok: true, message: "Bağlantı kesildi" });
  } catch (e) {
    console.error("[WhatsApp disconnect]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
