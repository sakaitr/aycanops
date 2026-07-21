import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import type { RowDataPacket } from "mysql2/promise";

// Bu kaynak için ayrı bir `:delete` action'ı tanımlı değil (Task 2'de
// finans_odeme kaynağına sadece read/create atandı) — silme işlemi,
// ödemeyi oluşturabilen kullanıcının kendi kaydını geri alabilmesinin makul
// olduğu kabulüyle finans_odeme:create iznine bağlanıyor. Ayrı bir :delete
// action'ı bu MVP'de gereksiz karmaşıklık. finans_odeme:delete izni yalnızca
// admin'e (blanket grant üzerinden) verilir — bu izne sahip kullanıcılar
// kendi oluşturmadıkları ödemeleri de silebilir; diğer herkes yalnızca
// kendi oluşturduğu kaydı silebilir (aşağıdaki created_by kontrolü).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "finans_odeme:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();

    const existing = await db.prepare(`SELECT id, created_by, cari_tip, cari_id FROM finans_odeme WHERE id = ?`).get(id) as
      { id: string; created_by: string; cari_tip: string; cari_id: string } | undefined;
    if (!existing) return NextResponse.json({ ok: false, error: "Bulunamadı" }, { status: 404 });

    if (!hasPermission(user, "finans_odeme:delete") && existing.created_by !== user.id)
      return NextResponse.json({ ok: false, error: "Sadece kendi oluşturduğunuz ödemeyi silebilirsiniz" }, { status: 403 });

    // finans_odeme'de company_id kolonu yok — finans_fatura'daki ile aynı
    // polymorphic cari_tip/cari_id şeması kullanılır: cari_tip='musteri'
    // kayıtlarında cari_id bir companies.id'dir ve firma kısıtlaması buradan
    // uygulanır. cari_tip='tedarikci' kayıtları (GET'teki ilkeyle tutarlı
    // olarak) kısıtlamaya tabi değildir. Bu kontrol yukarıdaki ownership
    // kontrolünden bağımsızdır — ikisi de geçmelidir.
    if (existing.cari_tip === "musteri" && user.allowed_companies) {
      const allowed: string[] = JSON.parse(user.allowed_companies);
      if (!allowed.includes(existing.cari_id))
        return NextResponse.json({ ok: false, error: "Bu firmaya erişim yetkiniz yok" }, { status: 403 });
    }

    await db.transaction(async (conn) => {
      // Silinecek eşleşmelerden etkilenecek faturaları önce topla.
      const [etkilenenRows] = await conn.execute<RowDataPacket[]>(
        `SELECT DISTINCT fatura_id FROM finans_odeme_fatura WHERE odeme_id = ?`,
        [id]
      );
      const etkilenenFaturaIds = (etkilenenRows as { fatura_id: string }[]).map(r => r.fatura_id);

      // İlişkili eşleşme satırlarını sil (ON DELETE CASCADE zaten hallediyor
      // olsa da, kalan eşleşme toplamını bir sonraki adımda doğru hesaplamak
      // için burada açıkça siliyoruz).
      await conn.execute(`DELETE FROM finans_odeme_fatura WHERE odeme_id = ?`, [id]);

      // Etkilenen her faturanın odeme_durumu'nu kalan eşleşme toplamına göre
      // yeniden hesapla — POST route'undaki aynı kural seti kullanılır.
      for (const faturaId of etkilenenFaturaIds) {
        const [faturaRows] = await conn.execute<RowDataPacket[]>(
          `SELECT genel_toplam FROM finans_fatura WHERE id = ?`,
          [faturaId]
        );
        const fatura = (faturaRows as { genel_toplam: number }[])[0];
        if (!fatura) continue;

        const [toplamRows] = await conn.execute<RowDataPacket[]>(
          `SELECT COALESCE(SUM(tutar), 0) AS toplam FROM finans_odeme_fatura WHERE fatura_id = ?`,
          [faturaId]
        );
        const toplam = Number((toplamRows as { toplam: number }[])[0].toplam);
        const genelToplam = Number(fatura.genel_toplam);

        let yeniDurum = "odenmedi";
        if (toplam > genelToplam) yeniDurum = "fazla_odendi";
        else if (toplam === genelToplam) yeniDurum = "odendi";
        else if (toplam > 0) yeniDurum = "kismen_odendi";

        await conn.execute(`UPDATE finans_fatura SET odeme_durumu = ? WHERE id = ?`, [yeniDurum, faturaId]);
      }

      // Son olarak ödeme satırını sil.
      await conn.execute(`DELETE FROM finans_odeme WHERE id = ?`, [id]);
    });

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
