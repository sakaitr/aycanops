# İş Başı Check-in — Koşullu Detay Sorular + Final Soru Seti — Tasarım

## Amaç

Patron iki taslak form gönderdi ("İş Başı Formu" — dünkü değerlendirme + bugüne
dair, 11 soru; ve QR-okutma formu — trafik ışığı durumlar, 10 soru). İkisi de
mevcut `/gunluk/[date]` check-in gate'inin ("Güne Başla" bölümü) üstüne inşa
edilecek, ayrı bir sayfa/form gerekmiyor. Mevcut `gunluk_soru` /
`gunluk_cevap` altyapısı (bkz. `migrations/099_gunluk_soru.sql`,
`migrations/100_gunluk_checkin.sql`) şu an tüm soruları koşulsuz sırayla
gösteriyor — "Evet ise: ..." kalıbı yok. Bu tasarım (1) koşullu takip sorusu
desteği ekliyor, (2) iki taslağı tekilleştirip final 8 soruluk seti aynı
migration'la seed ediyor.

**Kapsam dışı:** çok katmanlı soru zincirleri (soru B, soru A'nın cevabına
göre; soru C, B'ye göre — gerek yok, her iki taslakta da tek seviye "Evet/Hayır
→ tek takip sorusu" kalıbı var). İsim/departman alanı — sistem kullanıcı
bazlı, oturum açan kişi zaten belli. Ayrı "İş Başı Yaptım" butonu — mevcut
"Kaydet ve Devam Et" zaten `checkin_at`'i dolduruyor
(`app/api/worklogs/[date]/cevaplar/route.ts:65-67`).

## Veri Modeli

**`gunluk_soru` tablosuna 5 yeni nullable kolon** (migration 104):

```sql
ALTER TABLE gunluk_soru
  ADD COLUMN bolum_baslik VARCHAR(200) NULL AFTER label,
  ADD COLUMN detay_label VARCHAR(500) NULL AFTER zorunlu,
  ADD COLUMN detay_tip ENUM('metin','uzun_metin','secim') NULL AFTER detay_label,
  ADD COLUMN detay_secenekler TEXT NULL AFTER detay_tip,
  ADD COLUMN detay_tetikleyici VARCHAR(200) NULL AFTER detay_secenekler;
```

- `bolum_baslik`: aynı değere sahip ardışık sorular check-in ekranında tek
  başlık altında gruplanır (Taslak 1'deki "— Dünkü gün değerlendirmesi —" /
  "— Bugüne dair —" ayracı). Boşsa gruplama yok, mevcut davranış.
- `detay_*`: soruya bağlı **tek** takip sorusu. `detay_tetikleyici`,
  ana sorunun hangi cevabında takip sorusunun görüneceğini tutar —
  `evet_hayir` tipinde `"true"`/`"false"`, `secim`/`checklist` tipinde seçilen
  seçeneğin metni. `detay_tip === "secim"` ise `detay_secenekler` (JSON dizi,
  `secenekler` koloniyle aynı format) zorunlu. `metin`/`uzun_metin` ana
  sorularda detay uygulanmaz (ayrık tetikleyici değeri yok) — admin panelinde
  bu tiplerde detay bloğu gösterilmez.

**`gunluk_cevap` tablosuna 1 yeni nullable kolon:**

```sql
ALTER TABLE gunluk_cevap ADD COLUMN detay_cevap TEXT NULL;
```

Mevcut `cevap_json` formatı değişmiyor (geriye dönük uyumluluk için —
var olan satırlar etkilenmez). Detay cevabı ayrı kolonda, JSON-stringify
edilmiş halde tutulur.

## API Değişiklikleri

**`lib/schemas.ts`:**
- `gunlukSoruSchema` / `gunlukSoruUpdateSchema`: `bolum_baslik`, `detay_label`
  (`shortStr(500).optional().nullable()`), `detay_tip`
  (`z.enum(["metin","uzun_metin","secim"]).optional().nullable()`),
  `detay_secenekler` (`z.array(z.string().max(200)).optional().nullable()`),
  `detay_tetikleyici` (`z.string().max(200).optional().nullable()`) eklenir.
- `gunlukCevapSubmitSchema`: her `cevaplar` elemanına
  `detay: z.union([z.string(), z.array(z.string())]).nullable().optional()`
  eklenir.

**`app/api/admin/gunluk-sorulari/route.ts` (POST):** yeni kolonlar INSERT'e
eklenir. Mevcut checklist/secim seçenek kontrolüne paralel: `detay_tip ===
"secim"` ve `detay_secenekler` boşsa 400 döner.

**`app/api/admin/gunluk-sorulari/[id]/route.ts` (PUT):** mevcut
`if (d.x !== undefined)` desenine uyularak 5 yeni alan eklenir.

**`app/api/gunluk-sorulari/route.ts` (GET, check-in için kullanılan public
liste):** `SELECT` listesine yeni kolonlar eklenir, `detay_secenekler` de
`secenekler` gibi `JSON.parse` edilir.

**`app/api/worklogs/[date]/cevaplar/route.ts` (POST):**
- `sorular` sorgusuna `detay_label, detay_tetikleyici` eklenir.
- Zorunluluk kontrolü genişler: bir sorunun `detay_label`'ı varsa VE gelen
  cevap `detay_tetikleyici` ile eşleşiyorsa (evet_hayir için `String(value)`
  karşılaştırma — `true`/`false`; secim için doğrudan eşitlik; checklist
  için `value.includes(detay_tetikleyici)`), o soru için `detay` boş olamaz
  — boşsa 400 `"Detay cevap gerekli"`.
- INSERT'e `detay_cevap` eklenir: `JSON.stringify(c.detay ?? null)`.

**`app/api/worklogs/[date]/route.ts` (GET):** `gunluk_cevap` SELECT'ine
`c.detay_cevap` eklenir, `cevaplar` map'ine `detay: c.detay_cevap ?
JSON.parse(c.detay_cevap) : null` eklenir.

## UI Değişiklikleri

**`app/admin/gunluk-sorulari/page.tsx`:**
- `EMPTY_FORM`'a `bolum_baslik: ""`, `detay_label: ""`, `detay_tip: null`,
  `detay_secenekler: []`, `detay_tetikleyici: ""` eklenir.
- Form üstüne "Bölüm Başlığı (opsiyonel)" text input.
- Ana soru alanlarından sonra, sadece `form.tip` `evet_hayir`/`secim`/
  `checklist` iken görünen "Bağlı Takip Sorusu (opsiyonel)" bloğu:
  tetikleyici cevap seçimi (evet_hayir → Evet/Hayır butonu; secim/checklist →
  `form.secenekler`'den dropdown), takip sorusu metni, takip cevap tipi
  (metin/uzun_metin/seçim), seçim ise seçenek ekleme (mevcut `addOption`
  deseniyle aynı, `detay_secenekler` için tekrar kullanılır).
- Liste görünümünde soru satırının altında `↳ takip: {detay_label}` küçük
  gri satır (varsa), bölüm başlığı bir etiket olarak gösterilir.

**`app/gunluk/[date]/page.tsx`:**
- `sorular.map` içinde, önceki sorunun `bolum_baslik`'ından farklıysa araya
  bölüm başlığı (`<p className="text-[11px] font-semibold text-zinc-600
  uppercase tracking-widest pt-2">`, "Gün Sonu Kapaması" başlığıyla aynı
  stil) eklenir.
- Yeni state: `detayForm` (soru id → değer), `cevapForm`'a paralel.
- Her sorunun ana input'undan hemen sonra: `s.detay_label` varsa VE
  `cevapForm[s.id]` tetikleyiciyle eşleşiyorsa (API'deki aynı kural —
  evet_hayir `String(value)`, secim doğrudan eşitlik, checklist
  `.includes()`) takip input'u render edilir (metin=`<input>`,
  uzun_metin=`<textarea>`, secim=`<select detay_secenekler>`),
  `detayForm[s.id]`'e bağlı.
- `loadWorklog`'daki prefill döngüsüne `detayPrefill[c.soru_id] = c.detay`
  eklenir, `setDetayForm` çağrılır.
- `saveCevaplar`: payload `sorular.map(s => ({ soru_id: s.id, value:
  cevapForm[s.id] ?? null, detay: detayForm[s.id] ?? null }))`.

Trafik ışığı sorusu (🟢🟡🔴) için özel bileşen **yazılmıyor** — emoji'li
seçenekler mevcut `secim` tipinin `<select>`'i içinde düz metin olarak
çalışıyor, ekstra kod gerekmiyor. İleride "3 renkli buton" gibi görsel bir
yükseltme istenirse ayrı bir iş olarak ele alınabilir.

## Migration 104 — Final Soru Seti (seed)

Şema değişiklikleriyle aynı migration dosyasında (`082_finans_fatura_fis_
detay.sql`'deki ALTER+INSERT deseniyle aynı), 8 final soru INSERT edilir —
`INSERT IGNORE`, `sort_order` 0'dan başlar:

1. *[Dünün Değerlendirmesi]* Dün işini eksiksiz tamamladın mı? — evet_hayir,
   zorunlu → detay (Hayır): "Ne eksik kaldı?" (metin)
2. *[Dünün Değerlendirmesi]* Açık/eksik güzergah var mı? — evet_hayir,
   zorunlu → detay (Evet): "Hangi güzergah, ne eksik?" (metin)
3. *[Dünün Değerlendirmesi]* Dünden bugüne devreden acil/önemli bir konu var
   mı? — evet_hayir, zorunlu → detay (Evet): "Konu nedir, kimden destek
   gerekiyor?" (metin)
4. *[Bugüne Dair]* Bugün yapılacak öncelikli 1-2 iş nedir? — metin, zorunlu
5. *[Bugüne Dair]* Bugün acil çözülmesi gereken bir konu var mı? —
   evet_hayir, zorunlu → detay (Evet): "Konu nedir?" (metin)
6. *[Bugüne Dair]* Destek/yönlendirme ihtiyacım var — evet_hayir, zorunlu →
   detay (Evet): "Kimden?" (secim: Operasyon/Muhasebe/Pazarlama/İnsan
   Kaynakları/Yönetim/Diğer)
7. *[Bugüne Dair]* Genel gün durumu (dün+bugün) — secim, zorunlu, seçenekler:
   "🟢 Planlandığı gibi" / "🟡 Takip gerekiyor" / "🔴 Yönetici müdahalesi
   gerekiyor"
8. *[Bugüne Dair]* Eklemek istediğiniz başka bir not var mı? — uzun_metin,
   zorunlu değil

## Test Planı

- `node node_modules/typescript/bin/tsc --noEmit` — tip hatası olmamalı.
- Migration'ı çalıştırıp (`lib/migrate.ts` uygulama açılışında otomatik
  çalışıyor) `gunluk_soru`/`gunluk_cevap` kolonlarını ve 8 satırın
  eklendiğini DB'den doğrula.
- `/admin/gunluk-sorulari`: yeni soru ekle (detay bloğuyla), düzenle, sil —
  detay alanları doğru kaydedilip yükleniyor mu.
- `/gunluk/<bugün>`: check-in gate'te 8 soru + 2 bölüm başlığı görünüyor mu;
  "Hayır" seçince Q1'in detay input'u açılıyor mu, boş bırakınca 400 dönüyor
  mu; "Kaydet ve Devam Et" sonrası `checkin_at` doluyor mu; sayfayı
  yenileyince cevaplar + detaylar prefill oluyor mu.
- Var olan (bu özellikten önce oluşmuş) günlükler için `detay_cevap` NULL
  kalmalı, sayfa hata vermemeli (geriye dönük uyumluluk).
