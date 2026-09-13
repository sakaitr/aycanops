# AycanOps mali kontroller — yerel uygulama ve doğrulama

Tarih: 13 Eylül 2026. Dal: `codex/aycanops-p0-controls`; başlangıç: `4d62ac1`.
Bu dosya ilk teslimin kaydıdır. Sonraki geliştirmelerin güncel durumu `plan-progress.md` içindedir; aşağıdaki eski sınırların bazıları sonraki çalışmada kapatılmıştır.
12 Eylül inceleme raporunun CP01–CP05 öncelikleri kapsamında uygulanan yerel değişikliklerdir; tüm iş paketlerinin tamamlandığı veya üretime hazır olduğu anlamına gelmez. Üretim verisi, ortam dosyası ve dağıtım değiştirilmedi. Eski mali kayıtlar topluca yeniden hesaplanmadı.

## Uygulananlar

- Araç/güzergah silme, firma içinden kalıcı araç silme ve içe aktarma geri alma girişlerinde hizmet, hakediş, atama veya plan bağı olan kayıtlar korunur. Kontrol ve silme aynı işlemde yapılır; kullanılmamış kayıt silinebilir.
- KDV tevkifatı hesaplanan KDV üzerinden alınır; yarım kuruş dahil tam sayı aritmetiği kullanılır. Tarih, dönem, tutar ve oran doğrulamaları eklendi. Açıklama düzenlemesi eski mali değerleri sessizce değiştirmez; tutarsız eski hesap tahakkuka geçirilemez.
- Yeni hakedişte seçili hizmetler kilitlenir; sahiplik, dönem, onay, firma kapsamı ve mevcut bağlantılar doğrulanır. Başlık, hizmet bağlantıları ve oluşturma denetim kaydı tek işlemde yazılır. Kısmi seçim sessizce kabul edilmez.
- Çetele, hakediş ve firma mutabakatı ortak fiyat seçimi kullanır: hareket tipi, yön, araç/plaka, tarih geçerliliği ve fiyat önceliği korunur. Eksik fiyat ile açık sıfır fiyat ayrılır. Farklı para birimleri sessizce toplanmaz.
- Mutabakat hesaplama ve onay dayanakları denetim kaydına eklenir. Aynı toplamla sonuçlansa bile dayanak değişikliği yeniden hesaplama gerektirir. Yeni onayların ayrıntıları sonradan fiyat değişse de saklanan dayanağı gösterir. Eski onaylarda dayanak yokluğu API'de açıkça işaretlenir.
- Araç formunun alan hatası metne dönüştürülür; yolcu formu sunucu/ağ hatasında açık kalır ve girdileri korur. Boş isteğe bağlı ilişki/barkod değerleri normalize edilir. Yolcu API'sinin beklenmeyen hataları SQL ayrıntılarını istemciye vermez.
- Güzergah araç seçicisi firma kapsamında sunucuda arama, sayfalama, seçili kaydı ayrıca yükleme, hata ve tekrar deneme durumları kullanır; ilk 100 kayda bağımlılık kaldırılır.

## Doğrulama

- 36 gerçek MySQL/API regresyon testi geçti. Kimlik doğrulama taklit edilir; gerçek route handler ve SQL çalışır. Şema küçük bir fixture'dır, tüm migration zinciri değildir.
- 8 birim testi geçti: hesap, yarım kuruş, tarih ve sayı doğrulaması.
- 3 Playwright tarayıcı testi geçti: araç alan hatası, yolcu sunucu/ağ hatası, araç seçicisi arama/sayfalama. React/Next arayüzü gerçektir; HTTP yanıtları kontrollü taklit edilir. Gerçek giriş ve rol uçtan uca testi değildir.
- `npx tsc --noEmit` geçti. Yeni yardımcı modüller, `VehicleSelect` ve hesap modülünde hedefli ESLint geçti; tüm depo için temiz lint iddiası yoktur.
- `npm run build` geçti (299 statik sayfa). İzole/geçersiz yerel DB ayarları kullanıldı. Next middleware yapılandırması, Node deprecation ve Sentry/OpenTelemetry bağımlılık uyarıları devam ediyor; derleme hatası yok.
- `scripts/financial-integrity-readonly.sql` içindeki dört salt okunur sorgu izole fixture üzerinde çalıştırıldı. Canlı veri üzerinde çalıştırılmadı; eksiksiz mali denetim değildir.

Tekrarlama:

```sh
npm run test:unit
# Yalnızca atılabilir, yerel MySQL sunucusu kullanın; test kendi veritabanını oluşturup siler.
AYCANOPS_TEST_MYSQL_PORT=33317 npm run test:api
# Ayrı terminalde yerel Next sunucusu çalışmalıdır; üretim ortam dosyalarını kullanmayın.
AYCANOPS_UI_TEST_URL=http://127.0.0.1:33319 npm run test:ui
npx tsc --noEmit
```

## Üretim öncesi kalanlar

- CP00 canlı test verisi temizliği yapılmadı. Silinmiş geçmiş ancak uygun yedek ve ayrı onaylı kurtarma çalışmasıyla incelenebilir.
- Koruma uygulama girişlerindedir; tüm ilişkileri kapsayan yabancı anahtar/soft-delete migration'ı ve bağımsız değiştirilemez mali snapshot tablosu eklenmedi. Yeni mutabakat kanıtının saklanması `audit_log` saklama politikasına bağlıdır.
- Eski onaylarda eksik dayanak yeniden üretilemez. Salt okunur sorgu sonuçları muhasebe sorumlusu tarafından incelenmeden toplu düzeltme yapılmamalıdır. Mevcut firma-araç yetim ilişkileri ve diğer operasyon geçmişi ayrıca denetlenmelidir.
- Hakedişin mevcut ödeme/cari hareket ve tekil/toplu durum geçişlerinin tamamı atomik hale getirilmedi. Güzergah silme denetim kaydı mevcut yapıda silme işlemi dışında yazılır. Genel audit/ledger bütünlüğü ayrı iş paketidir.
- Üretim benzeri tam şema üzerinde migration provası, gerçek oturum/rol matrisi ve eşzamanlı fiyat/hizmet güncellemesi senaryoları gereklidir. UI fiyat ve dönem kontrollerinin tüm varyasyonları tarayıcı testine alınmadı.
- CP06 ve sonraki takvim, operasyon planlama ve diğer iş paketleri bu değişikliklerin tamamlanmış kapsamı değildir. Dağıtım/push yapılmadı.
