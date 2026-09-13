import { NextResponse } from "next/server";
import { RequestError } from "./request-error";
import { randomUUID } from "node:crypto";

/**
 * Standart API hata response'u.
 * Hata mesajını her zaman döndürür — bu dahili bir sistem.
 */
export function apiError(e: unknown, status = 500): NextResponse {
  if (e instanceof RequestError) {
    return NextResponse.json({ ok: false, error: e.message, details: e.details }, { status: e.status });
  }
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[API Error]", msg);
  // UNIQUE constraint → kullanıcı dostu mesaj
  if (msg.includes("UNIQUE") || msg.includes("Duplicate entry")) {
    return NextResponse.json({ ok: false, error: "Bu kayıt zaten mevcut" }, { status: 409 });
  }
  return NextResponse.json({ ok: false, error: msg || "Sunucu hatası" }, { status });
}

/** Form endpoints must not expose database/schema details on unexpected failures. */
export function safeApiError(e: unknown): NextResponse {
  if (e instanceof RequestError) return apiError(e);
  const errorId = randomUUID();
  console.error("[API Error]", errorId, e);
  const duplicate = e instanceof Error && /Duplicate entry|UNIQUE/.test(e.message);
  return NextResponse.json({ ok: false, error: duplicate ? "Bu kayıt zaten mevcut" : "Kayıt işlemi tamamlanamadı. Lütfen tekrar deneyin", errorId }, { status: duplicate ? 409 : 500 });
}
