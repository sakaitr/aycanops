import { NextResponse } from "next/server";

/**
 * Standart API hata response'u.
 * Hata mesajını her zaman döndürür — bu dahili bir sistem.
 */
export function apiError(e: unknown, status = 500): NextResponse {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[API Error]", msg);
  // UNIQUE constraint → kullanıcı dostu mesaj
  if (msg.includes("UNIQUE") || msg.includes("Duplicate entry")) {
    return NextResponse.json({ ok: false, error: "Bu kayıt zaten mevcut" }, { status: 409 });
  }
  return NextResponse.json({ ok: false, error: msg || "Sunucu hatası" }, { status });
}
