import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getWAState, initWAClient } from "@/lib/whatsapp-client";
import { hasPermission } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user || !hasPermission(user, "integrations:read")) {
      return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { state, qrDataUrl } = getWAState();
    return NextResponse.json({ ok: true, data: { state, qrDataUrl } });
  } catch (e) {
    console.error("[WhatsApp status]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    if (!user || !hasPermission(user, "integrations:update")) {
      return NextResponse.json({ ok: false, error: "Yetkisiz erişim" }, { status: 403 });
    }

    initWAClient();
    return NextResponse.json({ ok: true, message: "WhatsApp bağlantısı başlatıldı" });
  } catch (e) {
    console.error("[WhatsApp init]", e);
    return NextResponse.json({ ok: false, error: "Sunucu hatası" }, { status: 500 });
  }
}
