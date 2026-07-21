# Finans / Muhasebe Modülü — Master Tasarım

Durum: onaylandı (2026-07-21). Faz 1 implementasyon planı bir sonraki adım.

## Amaç ve kapsam

AycanOps'a genel bir finans/muhasebe modülü ekleniyor: cari hesap yönetimi, gelir-gider
takibi, iç fatura/fiş süreçleri, kasa-banka, bütçe, tam çift taraflı muhasebe (mizan,
bilanço, gelir tablosu, nakit akış) ve bunları özetleyen bir finans paneli.

Kaynak: kullanıcının verdiği genel ERP finans spesifikasyonu (12 bölüm). Bu belge o
spesifikasyonu AycanOps'un mevcut veri modeline uyarlar; bire bir kopya değildir.

## Kapsam dışı (kalıcı, bilinçli karar)

- **E-Fatura / E-Arşiv / E-İrsaliye gönderimi, GİB entegrasyonu.** Bunlar devlet
  API'sine bağlıdır, dış API kullanılmayacağı için hiçbir biçimde ele alınmıyor —
  ne gönderim, ne de dosya üretimi. Resmi e-belge süreci mali müşavir/özel
  entegratör üzerinden, sistem dışında yürütülmeye devam eder.
- **Banka API entegrasyonu, OCR, otomatik eşleştirme motoru.** Banka hareketleri
  CSV/Excel ile manuel içeri alınır; fatura-ödeme eşleştirmesi kullanıcı tarafından
  manuel yapılır. İleride ayrı bir faz olarak değerlendirilebilir, bu tasarımın
  parçası değil.

## Kapsam içi (onaylanan büyük karar)

Tam çift taraflı muhasebe (hesap planı, yevmiye, mizan, büyük defter, bilanço, gelir
tablosu, nakit akış tablosu) dahildir — bunlar tamamen iç hesaplama, dış API
gerektirmez.

## Mevcut sistemle ilişki (yeniden kullanılanlar)

- `companies` — müşteri cari kartı olarak genişletilir (yeni tablo açılmaz).
- `isleten` — tedarikçi/araç sahibi cari kartı olarak genişletilir.
- `hakedis` — tedarikçiye gider tahakkuku olarak muhasebe altyapısına bağlanır
  (brüt/kdv/tevkifat/net alanları zaten var); yeni "alış faturası" akışıyla
  birebir aynı değildir ama aynı cari/ödeme mantığını paylaşır.
- `firma_mutabakat` — müşteri mutabakatı, yeni cari ekstre/yaşlandırma
  raporlarıyla birlikte çalışacak şekilde genişletilir.
- `budget_entries` — Faz 3'teki gelişmiş bütçe modelinin temeli, department/proje/
  masraf merkezi kırılımlarıyla genişletilir.
- `departments` — masraf merkezi/departman kırılımında doğrudan kullanılır.
- `audit_log` — Faz 4'teki finansal denetim izinin temeli, finans-özel alanlarla
  genişletilir.
- Yetki sistemi: yeni `finans_*` kaynak/aksiyon çiftleri mevcut `lib/permissions.ts`
  kataloğuna eklenir, mevcut dinamik rol sistemiyle (bkz. görev #48) uyumlu çalışır.

## Faz 1 — Temel Tanımlar + Cari + Gelir-Gider Çekirdeği

**Yeni tablolar:**
- `finans_hesap_plani` (chart of accounts) — id, kod, ad, üst_hesap_id (hiyerarşi),
  tip (varlık/borç/özkaynak/gelir/gider), is_active
- `finans_kategori` — id, ad, tip (gelir/gider), hesap_id (FK → hesap planı; kategori
  ile hesap ayrı kavramlar, kullanıcı kategoriyi görür, arka planda hesaba düşer)
- `finans_masraf_merkezi` — id, ad, company_id (opsiyonel, firma-özel olabilir)
- `finans_proje` — id, ad, kod, company_id, başlangıç/bitiş, durum
- `finans_kasa_banka_hesabi` — id, ad, tip (kasa/banka/kredi kartı/pos), banka_adı,
  iban, para_birimi, açılış_bakiyesi, company_id
- `finans_para_birimi` — id, kod (TRY/USD/EUR...), ad (Faz 1'de sadece TRY/USD/EUR
  seed edilir, salt-okunur kullanılır; günlük kur girişi ve kur farkı Faz 3'e ait —
  bkz. aşağıda `finans_kur`)
- `finans_vergi_kodu` — id, ad, oran, geçerlilik_başlangıç/bitiş (tarih aralıklı,
  koda sabit değer gömülmez)
- `finans_odeme_yontemi` — id, ad (nakit/havale/çek/kredi kartı...)
- `finans_gelir_gider` — asıl işlem tablosu: id, tur (gelir/gider), belge_tarihi,
  kayit_tarihi, tahakkuk_tarihi, vade_tarihi, cari_tip (musteri/tedarikci),
  cari_id, kategori_id, net_tutar, vergi_tutari, brut_tutar, para_birimi_kod, kur,
  company_id, department_id, proje_id, masraf_merkezi_id, odeme_durumu, belge_dosya_id
  (FK → belge tablosu, Faz 2'de eklenir), aciklama, etiketler (JSON), tekrarlama_json,
  created_by, approved_by, created_at, updated_at

**API/UI:** her tanım için basit CRUD sayfası (`/admin/finans/*` altında), gelir-gider
kaydı için liste+form sayfası (`/finans/gelir-gider`).

**Onay:** mevcut `hasPermission` deseniyle, `finans_gelir_gider:approve` — kaydı
oluşturan kendi kaydını onaylayamaz (Faz 4'te netleşecek dört-göz kuralının ilk hali).

### Masraf talebi (satın alma öncesi onay)

Personelin harcama yapmadan önce talep açtığı ayrı bir akış — "bilgisayarıma X
alacağım" gibi, henüz para harcanmadan önce onay istenen durumlar. Faz 2'deki
"fatura/fiş" işlemlerinden farkı: bunlar henüz gerçekleşmemiş, tahmini tutarlı
taleplerdir; onaylanınca gerçek harcamaya (Faz 2 fiş veya Faz 1 gelir-gider kaydı)
dönüştürülür.

- `finans_masraf_talebi` — id, talep_eden_user_id, tarih, baslik, aciklama,
  tahmini_tutar, para_birimi_kod, kategori_id, department_id, proje_id,
  masraf_merkezi_id, durum (bekliyor/onaylandi/reddedildi/tamamlandi),
  onaylayan_user_id, onay_tarihi, red_nedeni, iliskili_gelir_gider_id (onaylanıp
  gerçek harcama girildiğinde bağlanır), created_at, updated_at
- **Sayfa:** `/finans/masraf-talebi` — personel "+ Talep Oluştur" ile yeni talep
  açar (başlık, açıklama, tahmini tutar, kategori, gerekirse departman/proje).
  Kendi taleplerini ve durumlarını görür. Onay yetkisi olanlar (yönetici/admin,
  `finans_masraf_talebi:approve`) bekleyen talepleri onaylar/reddeder — kaydı
  oluşturan kendi talebini onaylayamaz.
- Onaylanan talep otomatik olarak taslak durumda bir `finans_gelir_gider` kaydına
  dönüşür (tutar hâlâ tahmini, gerçek fiş/fatura geldiğinde güncellenir); reddedilen
  talep sadece durum+red_nedeni ile kapanır, kayıt oluşturmaz.
- Bildirim: talep açıldığında onaylayacak role, onaylandığında/reddedildiğinde
  talep edene bildirim gider (mevcut `notifications` altyapısı kullanılır).

## Faz 2 — Fatura + Fiş/Belge + Kasa-Banka-Ödeme

**Yeni tablolar:**
- `finans_belge_turu` — id, ad, numara_serisi_prefix, sonraki_numara (Faz 1'den
  taşındı — ilk gerçek kullanıcısı buradaki `fatura_no` üretimi)
- `finans_fatura` — id, tur (satis/alis), durum (taslak/onay_bekliyor/onaylandi/
  muhasebelesti/iptal), fatura_no (belge_turu seri), cari_id, tarih, vade_tarihi,
  para_birimi_kod, kur, ara_toplam, vergi_toplam, genel_toplam, odeme_durumu
  (odenmedi/kismen/odendi/fazla_odendi), iliskili_fatura_id (iade/fark faturası için),
  tekrarlama_json
- `finans_fatura_kalemi` — id, fatura_id, urun_hizmet_adi, miktar, birim_fiyat,
  vergi_kodu_id, tutar, masraf_merkezi_id, proje_id, department_id
- `finans_fis` — id, tip (gider_fisi/tahsilat_makbuzu/tediye_makbuzu/kasa_giris/
  kasa_cikis/banka_islem/virman/mahsup/acilis_kapanis/personel_masraf), tarih,
  tutar, kasa_banka_hesabi_id, karsi_hesap_id (virman için), aciklama, belge_dosya_id
- `finans_belge` — id, dosya_yolu, dosya_hash (mükerrerlik kontrolü), ocr_tarih/
  ocr_tutar/ocr_firma/ocr_vergi_no/ocr_belge_no (manuel girilir veya boş kalır —
  OCR motoru yok, alanlar ileride bir OCR eklenirse kullanılmak üzere hazır durur),
  yorum_json, versiyon, created_by
- `finans_odeme` — id, tutar, tarih, kasa_banka_hesabi_id, odeme_yontemi_id, cari_id
- `finans_odeme_fatura` — N:N ilişki tablosu: odeme_id, fatura_id, tutar (bir ödeme
  birden fazla faturayı, bir fatura birden fazla ödemeyi kapatabilir)
- `finans_banka_hareketi` — CSV import edilen ham banka satırları + eşleşen
  fatura/ödeme id (manuel eşleştirme sonrası doldurulur)

**API/UI:** `/finans/faturalar` (satış/alış sekmeli), `/finans/fisler`,
`/finans/belgeler` (yükleme + mükerrerlik uyarısı), `/finans/kasa-banka` (hesap
hareketleri + CSV import + manuel eşleştirme ekranı).

## Faz 3 — Cari Detay + Bütçe + Tam Muhasebe

**Cari:**
- Mevcut `companies`/`isleten` için hesaplanmış görünüm: bakiye (fatura toplamı −
  ödeme toplamı), açık faturalar, yaşlandırma (0-30/31-60/61-90/90+ gün), risk
  limiti alanı, mahsuplaştırma işlemi (`finans_mahsup` tablosu).

**Bütçe:**
- `budget_entries` genişletilir: department_id, proje_id, masraf_merkezi_id,
  kategori_id, hesap_id, para_birimi_kod, versiyon, senaryo (iyimser/normal/
  kötümser), onay_durumu. Kullanılabilir bütçe formülü:
  `onaylı_bütçe − gerçekleşen − taahhüt_edilen`.

**Tam muhasebe:**
- `finans_kur` — id, para_birimi_kod, tarih, kur (Faz 1'den taşındı — günlük resmi
  kur girişi ve kur farkı hesaplaması burada gerçek bir tüketicisine kavuşuyor)
- `finans_yevmiye` — id, tarih, aciklama, donem_id, kaynak_tip (gelir_gider/fatura/
  fis/manuel), kaynak_id
- `finans_yevmiye_satiri` — id, yevmiye_id, hesap_id, borc, alacak (her yevmiyede
  toplam borç = toplam alacak kontrolü uygulama katmanında zorunlu)
- `finans_donem` — id, baslangic, bitis, durum (acik/kapali) — kapalı döneme yeni
  yevmiye satırı eklenemez (uygulama katmanında engellenir)
- Faturalar ve gelir-gider kayıtları onaylandığında otomatik yevmiye satırı üretir
  (kategori→hesap eşleştirme kuralı burada devreye girer)
- Raporlar: mizan (hesap bazlı borç/alacak/bakiye), büyük defter (hesap detay
  dökümü), bilanço, gelir tablosu, nakit akış tablosu — hepsi seçilen dönem için
  yevmiye verisinden hesaplanır, ayrı bir "gerçek" muhasebe yazılımı entegrasyonu
  gerekmez.

## Faz 4 — Dashboard + Raporlar + Onay/Denetim

**Finans ana paneli** (`/finans` kök sayfa): kasa/banka bakiyeleri, toplam alacak/
borç, vadesi geçenler, bugün/hafta ödeme takvimi, aylık gelir/gider/kâr, bütçe-
gerçekleşen, nakit akış tahmini (basit: açık faturaların vade tarihine göre
projeksiyon), onay bekleyenler, eksik belgeli işlemler, kritik bildirimler. Şirket/
şube/tarih/proje/departman/para birimi filtreleri — mevcut `GlobalCompanySelector`
deseni genişletilir.

**Rapor seti:** kullanıcının 16 maddelik listesinin tamamı, her biri Excel/PDF
export + tarih karşılaştırma + detaya inme ile. Mevcut `app/api/reports/export`
altyapısı (zaten Excel export deseni var) genişletilir.

**Onay/yetki/denetim:**
- Tutar bazlı onay limitleri (`finans_onay_limiti` — rol/kullanıcı × tutar aralığı)
- Dört göz: oluşturan kendi kaydını onaylayamaz (uygulama katmanında kontrol)
- Muhasebeleşmiş kayıt silinemez, sadece ters kayıtla (storno) düzeltilir
- `audit_log` finans tabloları için de otomatik doldurulur (mevcut deseni takip
  eder — hangi kullanıcı, ne zaman, hangi alanı değiştirdi)

## Yetkilendirme

Her yeni kaynak (`finans_gelir_gider`, `finans_fatura`, `finans_fis`, `finans_kasa_
banka`, `finans_butce` — mevcut `budget` ile birleştirilebilir, `finans_muhasebe`,
`finans_raporlar`) `lib/permissions.ts`'teki `PERMISSIONS` kataloğuna eklenir,
`DEFAULT_ROLE_PERMISSIONS`'ta uygun stok rollere (yönetici/admin ağırlıklı,
finans onay yetkisi sadece yönetici+admin) dağıtılır. Dinamik rol sistemi (görev
#48) sayesinde ileride "Muhasebeci" gibi özel roller admin panelden tanımlanabilir.

## Sıralama gerekçesi

Faz 1 olmadan hiçbir üst katman çalışmaz (kategori/hesap/cari olmadan fatura/fiş
anlamsız). Faz 2 günlük operasyonel kaydı sağlar. Faz 3 daha derin analiz ve resmi
muhasebe ihtiyacını karşılar — Faz 1-2 verisi üzerine kurulur. Faz 4 hepsini
görünür kılar — dashboard ve raporlar son fazda çünkü altlarındaki veri modelleri
oturmadan anlamlı bir panel kurulamaz.

## Sonraki adım

Faz 1 için detaylı implementasyon planı (writing-plans skill) çıkarılacak: migration
dosyaları, API route'ları, sayfa bileşenleri, permission eklemeleri, test senaryoları.
