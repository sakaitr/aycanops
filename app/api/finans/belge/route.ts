import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { v4 as uuidv4 } from "uuid";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import {
  isAllowedFinansMime, extForFinansMime, saveFinansBelge, deleteFinansBelge, computeFileHash, MAX_BELGE_BYTES,
} from "@/lib/uploads-finans";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_belge:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const iliskiliTip = searchParams.get("iliskili_tip");
    const iliskiliId = searchParams.get("iliskili_id");
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (iliskiliTip) { conditions.push("iliskili_tip = ?"); params.push(iliskiliTip); }
    if (iliskiliId) { conditions.push("iliskili_id = ?"); params.push(iliskiliId); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await getDb().prepare(
      `SELECT id, dosya_adi, dosya_yolu, mime_type, boyut_bayt, ocr_tarih, ocr_tutar, ocr_firma,
              ocr_vergi_no, ocr_belge_no, versiyon, iliskili_tip, iliskili_id, created_at
       FROM finans_belge ${where} ORDER BY created_at DESC`
    ).all(...params);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_belge:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const formData = await req.formData();
    const file = formData.get("dosya");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Dosya bulunamadı" }, { status: 400 });
    if (!isAllowedFinansMime(file.type))
      return NextResponse.json({ ok: false, error: `Desteklenmeyen dosya türü: ${file.type}` }, { status: 400 });
    if (file.size > MAX_BELGE_BYTES)
      return NextResponse.json({ ok: false, error: "Dosya 15MB'ı geçemez" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = computeFileHash(buffer);

    const db = getDb();
    const existing = await db.prepare(`SELECT id, dosya_adi FROM finans_belge WHERE dosya_hash = ?`).get(hash) as
      { id: string; dosya_adi: string } | undefined;
    if (existing) {
      return NextResponse.json(
        { ok: false, error: `Bu dosya zaten yüklenmiş: "${existing.dosya_adi}"`, mukerrer_belge_id: existing.id },
        { status: 409 }
      );
    }

    const iliskiliTip = formData.get("iliskili_tip") as string | null;
    const iliskiliId = formData.get("iliskili_id") as string | null;

    const filename = `${uuidv4()}.${extForFinansMime(file.type)}`;
    const id = uuidv4();
    const now = nowIso();

    try {
      await saveFinansBelge(filename, buffer);
      await db.prepare(
        `INSERT INTO finans_belge
           (id, dosya_adi, dosya_yolu, mime_type, boyut_bayt, dosya_hash, versiyon,
            iliskili_tip, iliskili_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
      ).run(id, file.name, filename, file.type, file.size, hash, iliskiliTip || null, iliskiliId || null, user.id, now);
    } catch (e: any) {
      if (e?.message?.includes("Duplicate") || e?.code === "ER_DUP_ENTRY") {
        // Eşzamanlı yükleme yarışı: pre-check SELECT'ten sonra başka bir istek
        // aynı hash'i INSERT etti. Az önce yazdığımız dosyayı temizle ve
        // gerçek (diğer isteğin) kaydı bul.
        await deleteFinansBelge(filename);
        const raced = await db.prepare(`SELECT id, dosya_adi FROM finans_belge WHERE dosya_hash = ?`).get(hash) as
          { id: string; dosya_adi: string } | undefined;
        return NextResponse.json(
          {
            ok: false,
            error: raced ? `Bu dosya zaten yüklenmiş: "${raced.dosya_adi}"` : "Bu dosya zaten yüklenmiş",
            mukerrer_belge_id: raced?.id,
          },
          { status: 409 }
        );
      }
      throw e;
    }

    return NextResponse.json({ ok: true, data: { id, filename } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
