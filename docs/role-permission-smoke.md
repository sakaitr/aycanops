# Rol / Yetki Smoke Checklist

MVP-1 permission guard standardizasyonundan sonra hızlı manuel kontrol listesi.

## Roller

- `admin`: tüm menüleri ve tüm API işlemlerini görebilmeli/yapabilmeli.
- `yonetici`: operasyonel CRUD, rapor, bütçe, firma, araç, sürücü, güzergah ve toplu işlem ekranlarını kullanabilmeli; sistem ayarları/kullanıcı yönetimi gibi admin alanları sınırlı kalmalı.
- `yetkili`: operasyonel okuma ve saha veri girişi yapabilmeli; kullanıcı/sistem/audit alanlarına girememeli.
- `personel`: sadece giriş kontrol odaklı ekranları kullanabilmeli; genel operasyon API'leri 403 dönmeli.

## API smoke senaryoları

Her rol ile oturum açıp aşağıdaki uçları kontrol et:

| Endpoint | `personel` | `yetkili` | `yonetici` | `admin` |
| --- | --- | --- | --- | --- |
| `GET /api/vehicles` | 403 | 200 | 200 | 200 |
| `POST /api/vehicles` | 403 | 200/201 | 200/201 | 200/201 |
| `DELETE /api/vehicles/:id` | 403 | 403 | 200 | 200 |
| `GET /api/routes` | 403 | 200 | 200 | 200 |
| `PUT /api/routes/:id` | 403 | 200 | 200 | 200 |
| `GET /api/yolcular` | 403 | 200 | 200 | 200 |
| `POST /api/yolcular/import` | 403 | 200 | 200 | 200 |
| `GET /api/suruculer` | 403 | 200 | 200 | 200 |
| `POST /api/suruculer` | 403 | 200/201 | 200/201 | 200/201 |
| `GET /api/companies` | 403 | 200 (scope'lu) | 200 | 200 |
| `POST /api/companies` | 403 | 403 | 200/201 | 200/201 |
| `GET /api/reports/data?report=1` | 403 | 200 | 200 | 200 |
| `GET /api/reports/export?report=1` | 403 | 200 | 200 | 200 |

## UI smoke senaryoları

1. `personel` ile `/araclar`, `/guzergahlar`, `/yolcular`, `/suruculer`, `/raporlar` adreslerine direkt git: `/yetkisiz` veya 403 beklenir.
2. `yetkili` ile operasyon menülerinin görünürlüğünü ve yazma işlemlerini kontrol et.
3. `yonetici` ile firma/araç/sürücü/güzergah CRUD ve rapor export kontrol et.
4. `admin` ile kullanıcı yönetimi, izin kapsamları ve tüm operasyon ekranlarını kontrol et.
5. Yeni kullanıcı oluştururken `allowed_pages`, `allowed_companies`, `whatsapp_phone` alanlarının kaybolmadığını doğrula.
