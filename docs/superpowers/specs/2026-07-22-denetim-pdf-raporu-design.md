# Denetim PDF Raporu — Tasarım

## Amaç

"Araç Denetim Raporu" (rapor kataloğu #8, slug `arac-denetim`) şu an tek
araç seçilmeden çalışmıyor (plaka zorunlu gibi davranıyor) ve çıktısı
sadece düz bir veri tablosu. Bu tasarım: (1) plaka zorunluluğunu kaldırır
— sadece firma+tarih aralığı yeterli olur, (2) bu raporun PDF çıktısını
her denetim kaydı için ayrı bir sayfa gösteren, checklist + fotoğrafları
içeren zengin bir belgeye çevirir, (3) denetim oluşturma sihirbazına
soru başına fotoğraf ekleme ve "evet" cevabında da not düşebilme
yeteneklerini ekler.

**Kapsam dışı:** diğer 30 rapor değişmiyor. XLSX çıktısı (aynı rapor
için) düz tablo olarak kalıyor — sadece PDF çıktısı zenginleşiyor.

## Mimari

**1. Rapor kataloğu düzeltmesi**

`lib/reports/catalog.ts`'te #8 kaydından `needsVehicle: true` kaldırılır.
Rapor formu artık sadece Firma + Tarih Aralığı istiyor.

**2. Şema değişikliği**

`inspection_photos` tablosuna `criterion_index INT NULL` kolonu eklenir
(migration). `NULL` = genel/toplu fotoğraf (bugünkü davranış, değişmez).
Sayı = o denetimin `checklist_json` dizisindeki ilgili sorunun index'i.

**3. Denetim oluşturma sihirbazı (`app/denetimler/page.tsx`)**

- `setCheckOk`'taki `note: ok ? "" : c.note` satırı kaldırılır — "evet"
  seçilse de not alanı temizlenmez, kullanıcı her zaman not girebilir.
- Checklist adımında her soru satırına küçük bir "📷" fotoğraf ekleme
  kontrolü eklenir. Seçilen dosya, o sorunun index'iyle birlikte lokal
  state'te (`questionPhotos: Record<number, File>`) tutulur — genel
  `photoFiles` dizisinden ayrı.
- `save()` fonksiyonu: denetim + genel fotoğraflar başarıyla
  kaydedildikten sonra, `questionPhotos`'taki her dosya da aynı
  `/api/inspections/[id]/photos` endpoint'ine (her istek için tek dosya,
  `criterion_index` form alanıyla birlikte) yüklenir.

**4. API — `/api/inspections/[id]/photos` genişletmesi**

POST handler'ı, formData'daki her dosya için opsiyonel bir
`criterion_index` alanı okur (tek istekte hem genel hem soru-bazlı
fotoğraf karışık gönderilebilir — her `photos` dosyasına karşılık gelen
`criterion_index_N` alanı, N dosyanın sırası). `inspection_photos`
INSERT'ine bu değer eklenir (yoksa NULL).

**5. PDF üretici — yeni `lib/reports/inspection-pdf.ts`**

Playwright ile HTML→PDF. Girdi: firma id'leri + tarih aralığı (mevcut
export route'tan). Süreç:
1. `inspections` tablosundan bu filtrelere uyan tüm kayıtları çek
   (checklist_json, notes, result, vehicle bilgisi dahil).
2. Her kayıt için `inspection_photos`'tan fotoğrafları çek
   (`criterion_index` NULL olanlar "genel", dolu olanlar ilgili soruya
   eşlenir).
3. Bir HTML string oluştur: her denetim için bir `<div class="page">`
   (CSS `page-break-after: always`), içinde: başlık (firma, plaka, tarih,
   tür, sonuç rozeti), checklist tablosu (soru, cevap ikonu, not, varsa
   küçük fotoğraf thumbnail — fotoğraf `data:` URI olarak gömülür, ayrı
   dosya sunucusuna istek atmadan), sonda varsa genel fotoğraflar galerisi.
   **Bellek/boyut güvenliği:** orijinal fotoğraflar (8MB'a kadar) direkt
   gömülmez — HTML'e eklenmeden önce `sharp` (zaten `package.json`'da
   kurulu) ile ~400px genişliğe küçültülüp JPEG kalitesi düşürülerek
   gömülür. Bu hem PDF üretim belleğini hem çıktı dosya boyutunu (birden
   fazla denetim/fotoğraf içeren bir PDF için önemli) küçük tutar.
4. Playwright ile bu HTML'i yükle, `page.pdf({format:"A4"})` ile PDF
   üret, browser'ı `finally` içinde kapat.
5. Aynı anda birden fazla PDF üretimini engelleyen basit bir modül
   seviyesi kilit (bir `Promise` tabanlı mutex) — VPS'in bellek
   sınırlarını zorlamamak için.

**6. Export route entegrasyonu**

`app/api/reports/export/route.ts`: `format === "pdf"` VE
`def.slug === "arac-denetim"` ise yeni `inspection-pdf.ts`'teki
üreticiyi çağır; başka her durumda mevcut `buildPdf`/`buildXlsx` akışı
aynen çalışmaya devam eder.

## Hata Yönetimi

- Playwright/Chromium başlatma başarısız olursa (örn. bellek yetersiz)
  500 + "PDF oluşturulamadı" — kullanıcıya XLSX alternatifi önerilir.
- Filtrelere uyan hiç denetim yoksa tek sayfalık "Kayıt bulunamadı" PDF'i
  döner (mevcut generic `buildPdf`'in boş-veri davranışıyla tutarlı).
- Soru-bazlı fotoğraf yüklemesi başarısız olursa (örn. body-size), genel
  fotoğraf yüklemesindeki gibi davranır: denetim kaydı zaten oluşmuştur,
  hata gösterilir, "Kaydet"e tekrar basmak mükerrer kayıt YARATMAZ (Task
  öncesi düzeltilen `createdInspectionId` mekanizması zaten bunu koruyor).

## Test

Birim test çalıştırıcısı yok. Doğrulama: `tsc --noEmit` + canlı testler:
(1) yeni bir denetim oluştur, 2 soruya fotoğraf ekle, genel 1 fotoğraf
ekle, "evet" cevaplı bir soruya not düş, kaydet — DB'de
`inspection_photos`'ta doğru `criterion_index` değerleriyle 3 satır ve
checklist_json'da notun korunduğunu doğrula; (2) `/raporlar`'da Araç
Denetim Raporu'nu SADECE firma+tarih ile (plaka seçmeden) PDF olarak
indir, birden fazla denetim kaydı varsa PDF'in o kadar sayfa içerdiğini,
fotoğrafların göründüğünü doğrula; (3) XLSX çıktısının hâlâ düz tablo
olduğunu doğrula (regresyon yok).
