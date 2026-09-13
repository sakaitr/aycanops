# AycanOps — devam kaydı

## Çalışma sözleşmesi

CP-00–CP-18 ve kaynak rapordaki kabul koşulları bitene kadar sıralı yerel çalışma. Bir paket tamamlanınca yeniden “devam” istenmez. Üretime dağıtım, canlı veri temizliği/kurtarma ve gerçek dış sistem işlemleri yetki dışında kalır. Tamamlandı etiketi ancak paket kabul testleri, eski veri etkisi ve geri alma yolu kanıtlandığında verilir.

Heartbeat: `aycanops-plan-n-tamamla`, ACTIVE. Yeni otomasyon oluşturma. Limit gerçekten engellediğinde güncel `get_usage_limits` sonucu ile engelleyen pencerelerin en geç açıldığı zaman +60 saniyeye güncelle; kredi kullanma. Son kontrol: beş saatlik %76, haftalık %28 kullanılmış, normal kullanım açık. Plan bittiğinde heartbeat duraklatılacak.

## Paket takip tablosu

| Paket | Durum | Kalan kabul işi |
|---|---|---|
| CP-00 | Açık; canlı işlem sınırı var | Kimlik bazlı envanter; aktif test planı ve firma-araç kalıntıları için önce/sonra ve onaylı temizlik |
| CP-01 | Kısmi | Kalıcı ad/plaka/fiyat dayanağı, arşivleme ve plan uygunluğu; tam şema koruması |
| CP-02 | Kısmi | KDV/tevkifat düzeltildi; sözleşmesel kesinti ayrımı ve tüm durum/ledger geçişleri |
| CP-03 | Kısmi | Fiyatsız/0/tarih/yön kontrolleri var; bütün hesapların kalıcı fiyat sürümü |
| CP-04 | Hedef regresyonlar geçti | Tam ortam/rol doğrulaması ve hata sözleşmesinin kalan sınırları |
| CP-05 | Hedef regresyonlar geçti | Tam ortam/rol doğrulaması |
| CP-06 | Açık | İstanbul takvim/işletme günü ve gece vardiyası kabulü |
| CP-07 | Açık | Hücre/yön/hizmet önizleme ve tekrar onay idempotency |
| CP-08 | Açık | Yayın eksikleri ve kapasite/uygunluk kontrolleri |
| CP-09 | Kısmi | Oluşturma/düzenleme/mutabakat audit var; tüm kritik geçişler ve önce/sonra |
| CP-10 | Açık | Finans kaynak uzlaştırması, dağıtılmamış gider ve eski tarih analizi |
| CP-11 | Açık | 390 px filtre, boş SLA, aktiflik/uygunluk ayrımı |
| CP-12 | Açık | Kaynak kimliği, normalizasyon, aday kuyruğu ve sayaçlar |
| CP-13 | Açık | Tek hizmet, ayrı alış/satış sözleşmeleri, ikame payları |
| CP-14 | Kısmi altyapı | Onay dayanağı var; kalem bazlı itiraz, sürüm/düzeltme ve dönem kilidi |
| CP-15 | Açık | Gerçek operasyon/finans/müşteri/tedarikçi/sürücü/yolcu rol matrisi |
| CP-16 | Açık | Olay kimliği, offline kuyruk/çatışma, bildirim teslimi |
| CP-17 | Açık | 27 kişi/3 bölge talebi ve 07.45+20+5=08.10 uygunluk testi |
| CP-18 | Açık | Tam ilişkili dışa aktarım ve izole geri yükleme; rollback sınırları |

## İlk doğrulanmış taban (güncel sonuçlar aşağıda)

36 SQL/API +8 birim +3 HTTP-mock tarayıcı testi geçti; TypeScript ve webpack üretim derlemesi geçti. Ayrıntılar `financial-controls-2026-09-13.md`. Bunlar 12 tam kabul senaryosunun yerine geçmez.

## Şu anki çalışma: hakediş işlem bütünlüğü (CP-02/09)

Kapsam: `app/api/hakedis/[id]/route.ts`, toplu tahakkuk, `lib/finans-hareket.ts`, işlem/denetim yardımcıları ve SQL regresyon fixture'ı. Girişler hakediş ve tahakkuk sayfaları; çıkışlar `hakedis`, `isleten_cari`, `finans_hareket`, `audit_log`.

Kök neden: durum okumaları kilitsiz, durum/cari/tek defter yazıları ayrı bağlantılarda. Aynı kayıt eşzamanlı onaylanabilir veya sonraki SQL hatası önceki durum değişikliğini bırakarak yarım işlem üretebilir. Ortak defter yardımcısı diğer belge türleri tarafından da çağrılır; geriye uyumlu isteğe bağlı transaction bağlantısı kullanılacak. Üretim DB'ye bağlanılmaz. Önce gerçek SQL üzerinde hata enjeksiyonu ve çift onay/ödeme testi.

Sonraki sıra: atomik hakediş geçişleri → kalıcı hizmet/hesap dayanağı ve arşiv → diğer bağımsız paketler. Canlı işlem veya ürün kararı gerektiren eksiklerde bağımsız işleri sürdür; kapsamı tamamlandı sayma.

## 13 Eylül — sonraki ilerleme

- Hakediş PUT/DELETE satır kilidi altında tek transaction kullanıyor. Cari, tek defter ve audit aynı transaction'a katılıyor. Toplu tahakkuk kayıt başına atomik (önceden başarılan diğer kayıtlar sonraki hata ile geri alınmaz). Eksik eski cari/defter dayanağı ödeme işaretlemeyi 409 ile durduruyor; otomatik geçmiş onarımı yok.
- `113_financial_snapshots.sql`: bağımsız JSON mali dayanak tablosu. Yeni hakediş oluşturma, mutabakat oluşturma/yeniden hesaplama/onay aynı transaction'da ekler. SQL UPDATE/DELETE trigger ile engellenir. Kaynak varlıklara FK yok; cascade ve audit temizliği bu tabloyu silmez. Yetkili DDL/TRUNCATE veya DB yöneticisine karşı WORM garantisi değildir; uygulama DB kullanıcısı için DDL yetkileri üretim öncesi sınırlandırılmalıdır.
- Hakediş ayrıntısı oluşturma snapshot'ındaki hizmetleri, yeni onaylı mutabakat ayrıntısı onay snapshot'ını kullanır. Eski kayıtlar mevcut audit/canlı fallback ve eksik kanıt işaretiyle korunur; geri doldurma yapılmadı.
- Yeni kanıt: 47 SQL/API testi, TypeScript ve değişen mali işlem dosyalarında hedefli ESLint geçti. Bunlara 7 atomiklik/yarış testi ve 4 snapshot testi dahil. Son değişikliklerden sonra tarayıcı/build henüz tekrar edilmedi.
- Migration rollback: uygulama kodu geri alınabilir; `financial_snapshots` tablosunu ve satırlarını KORU. Tam şema migration/backup provası hâlâ açık. Migration trigger yetkisi gerektirir; üretimde çalıştırılmadı.
- Güncel limit kontrolü: beş saatlik %18, haftalık %34 kullanılmış. Mevcut heartbeat 13 Eylül 13:37:49 İstanbul'a (güncel beş saatlik yenilenme +60 sn) güncellendi; id değişmedi.
- Şu an: CP-01/08 plan arşiv/yayın incelemesi. `route-plans/[id]/publish` sadece rota sayısını kontrol ediyor, aktif planlar PUT ile arşivlenemiyor. Kapsam/bağımlılık incelemesinden sonra eksik kaynak/durak/kapasite ve açık arşiv yolu için test yazılacak.

### Plan yayın/arşiv ve CP-11 alt düzeltmeleri

- Plan yayın/aktivasyon: firma satırı kilidiyle aynı firmadaki aktivasyonlar sıralanıyor; kayıtlı aktif vardiya/saat, en az bir koordinatlı durak, firma kapsamındaki aktif araç ve kapasite kontrol ediliyor. Optimizer çalıştırma şartı yok. Önceki aktif planın arşiv izi ve yeni yayın audit'i aynı işlemde.
- Mevcut publish endpoint'ine `archive: true, reason` eklendi. Aktif/bozuk planlar gerekçeyle arşivlenebilir, rota/durak geçmişi silinmez. Arayüzde Arşivle ve yeni plan için vardiya seçicisi var. Üretimde CP-00 kimlikleri üzerinde çalıştırılmadı.
- Yedi plan SQL testi ve iki yeni plan tarayıcı testi geçti. Sürücü uygunluğu, iki yönün ayrı zamanları, tüm gün araç çakışmaları, sonradan ana kayıt pasifleştirmesi ve edit/optimize yarışları hâlâ açık; CP-08 bütünü tamamlanmadı.
- CP-00 kimlik bazlı salt okunur sorgular `scripts/e2e-residue-inventory-readonly.sql` dosyasında hazır; canlı sonuç/temizlik/öncesi-sonrası yok.
- CP-11: 390 px ekranda 671 px filtre taşması ve SLA 0/0→%100 hatası testle üretildi. Filtre genişliği sınırlandı; SLA yüzdesi gözlem yoksa null, sorgu hatasında ayrı unavailable durumu. UI yüzde yerine Veri yok/Veri alınamadı/Yetki gerekli gösterir. Son tam doğrulama sürüyor.
- Sonraki öncelik: plan düzenle/optimize durum yarışını kilitle, yeni kullanılan vardiya API'sinde firma kapsamını ve plan oluşturma kapsamını kapat; ardından CP-06/07 ve kalan kabul senaryoları. `113` migration tam şema provası/geri yükleme de açık.

### Devam — plan yarışları, tarih ve çetele işlem bütünlüğü

- Plan düzenleme ve optimizasyon, yazmadan önce planın firma/durum/sürümünü satır kilidi altında tekrar doğruluyor; arada aktifleştirilmiş plan 409 ile korunuyor. Audit aynı transaction içinde. İki gerçek SQL yarış testi geçti.
- Plan oluşturma ve vardiya GET/POST/PUT/DELETE firma kapsamı kontrolleri eklendi. Tam rol/tenant matrisi tamamlanmış değildir.
- Günlük rapor varsayılan ve maksimum tarihi İstanbul gününü kullanıyor; 23:59, 00:00, 00:15, 03:00 tarayıcı senaryoları geçti. KPI günlük giriş grafiğinin DATE dönüşümü düzeltildi. Diğer tarih tüketicileri ve gece vardiyası iş günü kimliği hâlâ açık.
- CP-07: sekiz eşzamanlı toplu çetele isteğinin sekiz kopya üretmesi gerçek SQL testiyle görüldü. Güzergah satırı kilidi ve kilitli mevcut hizmet sorgusuyla tek kayıt korunuyor. Toplu işlemde tüm kayıtlar/kalıcı araç eşleştirmesi/audit aynı transaction'a katılıyor; audit hatasında geri alınıyor. Bekleyen mevcut kaydın kimliği ve durumu açıkça dönüyor, otomatik onaylanmıyor.
- Güzergahlı manuel çetele oluşturma aynı kilidi kullanıyor; toplu onaylı hizmeti yeniden oluşturmak 409. Ortak araç üzerinden başka firmanın güzergahına kayıt açmak 403. Manuel oluşturma audit hatasında geri alınıyor. Yedi yeni testle toplam 69 SQL/API testi geçti.
- Son tarayıcı doğrulaması 8 HTTP-mock testi; bu oturumdaki çetele değişiklikleri arayüz testi eklemedi. Üretim MariaDB tam şeması, gerçek oturumlar ve son değişikliklerle üretim derlemesi hâlâ ayrıca doğrulanmalı.
- Sınır: güzergahsız kayıtlar, başka yazıcılar/importlar, çetele düzenleme/onay/iptal/silme yarışları ve finansal hesaba bağlanmış hizmetin iptali henüz korunmuş sayılmaz. CP-07 bütünü tamamlanmadı. Toplu önizleme ve hücre/yön/adet gösterimi de açık.
- Sonraki iş: çetele PUT/DELETE işlemlerini finansal bağlantı, gerekçe, audit ve satır kilidiyle koru; takvim iptal/araç değiştirme işlemlerinin API hatalarını başarı gibi göstermesini düzelt. Ardından tam migration/backup ve kalan CP paketleri. Üretim verisine dokunulmadı, yayın/push yapılmadı.
- Mevcut heartbeat kimliği korundu; sonraki çalışma güncel beş saatlik reset +60 saniyeye ayarlandı. Limit kontrolünde beş saatlik %36, haftalık %66 kullanılmıştı; kredi tüketilmedi.
- Son doğrulama: 69/69 SQL/API, 8/8 birim testi ve TypeScript geçti. Test çıktısındaki synthetic audit/ledger/snapshot failure kayıtları beklenen hata enjeksiyonlarıdır.

### Devam — hakediş bağlantılı hizmet iptali ve onay

- `lib/cetele-cancel.ts`: iptal gerekçesi zorunlu. Hizmet satırı hakediş oluşturmayla aynı kilit altında okunur; herhangi bir hakediş bağlantısı varsa 409, tekrar iptalde ilk gerekçe korunarak 409. İptal ve önce/sonra audit tek transaction'da. Güzergahlı hizmetin firma kapsamı araç ortaklığından değil güzergahından kontrol edilir.
- Çetele PUT onay ve genel düzenleme okumaları satır kilidi altında; onay audit'i aynı transaction'da. Beş eşzamanlı onayın beşinin de başarılı dönmesi testte üretildi ve tek başarılı geçişe indirildi. Onay audit hatası bekliyor durumunu korur.
- Takvimde iptal ve araç değiştir eylemleri HTTP durumunu ve JSON ok alanını kontrol eder. Sunucu reddinde hata gösterilir, matris yenilenir ve araç değiştirme penceresi açılmaz. Gerekçe alanı zorunlu olarak etiketlendi. Çok kayıtlı hücre iptali hâlâ kayıt başına işlem yapar: önceki başarılı iptaller sonraki hata ile geri alınmaz. Tüm hücre/araç değiştirme atomikliği henüz tamamlanmadı.
- Gerçek tarayıcıda HTTP 409 yanıtının success toast oluşturduğu önce gösterildi; düzeltmeden sonra 9/9 HTTP-mock tarayıcı testi geçti. API hata enjeksiyonu, tekrar iptal, bağlı hizmet, firma kapsamı, onay yarışı ve hakediş/iptal yarış testleri eklendi.
- Kalan kritik sınırlar: firma-mutabakat döneminin iptale karşı kilitlenmesi, çetele DELETE yarış/finansal bağ koruması, genel düzenlemede yeni firma/güzergah kapsamı ve hizmet tekilliği, bütün yazıcıların ortak kimliği. Hakediş koruması tüm mali hesaplar korunuyor anlamına gelmez. CP-07/09/13–18 ve bütün plan açık kalıyor.
- Sonraki öncelik: DELETE koruması ve mutabakat onayıyla iptal yarışını ortak kilit düzeniyle çöz; ardından tüm hücre için atomik iptal/araç değiştirme. Üretime erişilmedi veya yayın yapılmadı.
- Güncel doğrulama: 77/77 SQL/API, 9/9 HTTP-mock tarayıcı, 8/8 birim testi; TypeScript, yeni iptal yardımcısında hedefli ESLint ve git diff --check geçti. Tam üretim derlemesi ve MariaDB tam şema provası bu turda yapılmadı.
