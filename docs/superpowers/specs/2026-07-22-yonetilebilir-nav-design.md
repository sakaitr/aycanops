# Yönetilebilir Nav Yapısı — Tasarım

## Amaç

`components/Nav.tsx`'teki sidebar navigasyon yapısı (8 grup, ~50 link) şu an
kod içinde sabit (`BUGUN_LINKS`, `ARACLAR_LINKS`, ... `NAV_PERMISSION_BY_HREF`
sabit dizileri). Yeni bir link eklemek, sırasını değiştirmek veya bir grubu
gizlemek için kod değişikliği + deploy gerekiyor. Bu tasarım, nav yapısının
admin panelinden düzenlenebilmesini sağlar: görünürlük/sıra değişikliği,
etiket düzenleme ve tamamen özel (kod dışı) link ekleme.

**Kapsam dışı:** kullanıcı bazlı kişiselleştirme (her admin/yönetici için
farklı nav — tek, sistem geneli bir yapı var), rol bazlı ayrı nav ağaçları
(mevcut per-link `permission` alanı zaten her kullanıcı için filtreleme
yapıyor, config sadece "yapıyı" tanımlıyor).

## Mimari

**Yeni tablo — `nav_config`** (tek satır, JSON config deposu):

```sql
CREATE TABLE nav_config (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  config_json JSON NOT NULL,
  updated_by VARCHAR(36) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
);
```

Tek satır tutulur (uygulama katmanında `SELECT ... LIMIT 1` / `UPDATE` ile
yönetilir, birden fazla satır oluşmasını engelleyen bir iş kuralı yeterlidir
— ayrı bir constraint gerekmez).

**API:**
- `GET /api/admin/nav-config` — mevcut config'i döner. Herkes (giriş yapmış
  her kullanıcı) okuyabilir, çünkü Nav.tsx her sayfada bunu fetch edecek.
- `PUT /api/admin/nav-config` — tüm config ağacını değiştirir. Sadece
  `admin` rolü (yeni bir permission tanımlamaya gerek yok, mevcut
  `user.role === "admin"` kontrolü — bu depoda zaten `hasPermission`'ın
  admin bypass'ı var, ama PUT özelinde ekstra bir `nav_config:update`
  permission'ı da PERMISSIONS kataloğuna eklenir ki ileride farklı bir role
  yetki verilmek istenirse kod değişikliği gerekmesin).
- `GET /api/admin/permissions/catalog` — `lib/permissions.ts`'teki
  `PERMISSIONS` objesini `["finans_fatura:read", "finans_fatura:create", ...]`
  şeklinde düz bir string dizisine çevirip döner (admin panelindeki izin
  seçici dropdown'u için).

**Yeni sayfa — `/admin/nav-yapisi`:**
Grup listesi (açılır/kapanır kartlar), her grubun içinde link listesi.
Sürükle-bırak ile grup içi link sırası, gruplar arası sıra, ve bir linkin
başka bir gruba taşınması (link'i bir grubun listesinden çekip başka bir
grubun listesine bırakma) desteklenir.
Her grup/link için aç/kapat (is_active) toggle'ı. "Grup Ekle" / "Link Ekle"
butonları. Link formu: href (serbest metin), label (serbest metin), ikon
(sabit registry'den seçim, canlı önizleme), permission (mevcut katalogdan
arama yapılabilir dropdown). Grup formu: label, minRole (Herkes / Yönetici /
Admin). "Kaydet" butonu tüm ağacı tek `PUT` isteğiyle gönderir.

**`components/Nav.tsx` değişikliği:**
Mevcut 8 sabit dizi ve `NAV_PERMISSION_BY_HREF` kalkar. Bunların yerine:
1. Component mount olduğunda `GET /api/admin/nav-config` çağrılır.
2. Başarılıysa dönen `config_json` render için kullanılır.
3. Başarısızsa (network hatası, 500, veya config satırı hiç yoksa) kod
   içinde sabit tutulan `DEFAULT_NAV_CONFIG` (mevcut 8 grubun bugünkü hali)
   fallback olarak kullanılır — nav hiçbir durumda boş kalmaz.
4. Her link, config'ten gelen kendi `permission` alanına göre mevcut
   `hasPermission(user, permission)` ile filtrelenir (aynı `canShowLink`
   mantığı, artık `NAV_PERMISSION_BY_HREF` yerine config'in kendi
   `item.permission` alanını okuyor). Grup, kendi `minRole` alanına göre
   (varsa) ek bir kapıdan geçer (`minRole === "admin"` ise `isAdmin`,
   `"yetkili"` ise `isManager` yani `isAtLeast(role,"yetkili")`, `null` ise
   kapı yok) — bugünkü
   `isManager ? filterByAllowed(...) : []` deseninin veri-tabanlı hali.

## Veri Şeması (JSON)

```json
{
  "groups": [
    {
      "key": "finans",
      "label": "Finans",
      "sortOrder": 5,
      "isActive": true,
      "minRole": null,
      "items": [
        {
          "id": "b3f1...",
          "href": "/finans/faturalar",
          "label": "Faturalar",
          "icon": "IconDocument",
          "permission": "finans_fatura:read",
          "isActive": true,
          "sortOrder": 0,
          "isCustom": false
        }
      ]
    }
  ]
}
```

- `key`: grubun sabit tanımlayıcısı (mevcut gruplar için bugünkü isimlerin
  kebab-case hali: `bugun`, `araclar`, `insan`, `rota`, `finans`,
  `gorevler`, `yonetim`, `yonetim-teknik`; yeni gruplar admin panelinde
  otomatik üretilen bir uuid alır).
- `minRole`: `null | "yetkili" | "admin"` — grup seviyesinde ekstra kapı.
- **Ek (planlama sırasında bulunan gerçek durum):** bugünkü "Yönetim" grubunda
  tüm linkler aynı role gerektirmiyor ("Toplu İşlem" `isAtLeast(role,"yetkili")`
  yeterli, diğer 9 link sadece admin), tek grup seviyesinde `minRole` bunu ifade
  edemez. Bu yüzden `item.minRole` de opsiyonel olarak eklendi — verilirse
  grubun `minRole`'ünü o link için ezer (override), verilmezse grubun
  `minRole`'ü geçerli olur. Admin panelinde her linkin kendi rol alanı da
  (opsiyonel, "Grubun varsayılanını kullan" seçeneğiyle) düzenlenebilir.
- `item.permission`: `PERMISSIONS` kataloğundaki tam `"resource:action"`
  string'i. Boş/geçersiz permission girilirse (admin formda serbest metin
  yerine dropdown'dan seçtiği için bu normalde olmaz, ama API tarafında da
  `Object.keys(PERMISSIONS)`'a karşı doğrulanır) `PUT` isteği 400 döner.
- `item.isCustom`: sadece bilgi amaçlı (admin panelinde "özel eklenen link"
  rozetini göstermek için) — render mantığını etkilemez.

## İkon Kaydı

`components/Icons.tsx`'te zaten export edilen tüm ikon component'leri bir
`ICON_REGISTRY: Record<string, React.ComponentType>` objesinde toplanır
(mevcut export'ları referans alan ek bir sabit — Icons.tsx'in kendisi
değişmez). Nav.tsx render sırasında `ICON_REGISTRY[item.icon]` ile
component'i bulur; bulunamazsa (registry'de olmayan bir isim, örn. eski bir
export silinmiş) sessizce genel bir varsayılan ikona (`IconCircle` gibi)
düşer, hata fırlatmaz.

Admin panelindeki ikon seçici, `ICON_REGISTRY`'nin anahtarlarını listeleyen
küçük bir grid — her birinin yanında gerçek render'ı gösterilir (seçilen
ikonun ne olduğu görsel olarak doğrulanır).

## Migration / Seed

Yeni migration dosyası `nav_config` tablosunu oluşturur VE tek bir `INSERT`
ile bugünkü Nav.tsx'in tam halini (8 grup, tüm linkler, bugünkü sıra,
bugünkü `NAV_PERMISSION_BY_HREF` eşlemeleri, bugünkü isManager/isAdmin
kapıları `minRole`'e çevrilmiş hali) JSON olarak seed eder. Bu sayede özellik
devreye girdiği an görünüm hiç değişmez — sadece artık admin panelinden
düzenlenebilir hale gelir.

## Hata Yönetimi

- `GET /api/admin/nav-config` config satırı yoksa (migration çalışmadıysa
  veya silindiyse) `DEFAULT_NAV_CONFIG` fallback'ini döndürmek yerine 404
  döner — Nav.tsx bu durumda zaten kendi fallback'ini kullanır, sunucu
  tarafında ayrıca bir "varsayılanı otomatik oluştur" mantığına gerek yok
  (migration zaten seed ettiği için pratikte hiç olmaz, ama olursa nav yine
  çalışır durumda kalır).
- `PUT` isteği admin olmayan biri tarafından yapılırsa 403.
- `PUT` gövdesindeki herhangi bir `item.permission` katalogda yoksa,
  herhangi bir `item.icon` registry'de yoksa, veya href boşsa 400 (hangi
  alanın geçersiz olduğu response'ta belirtilir).
- Admin panelinde kaydet başarısız olursa (400/403/500) mevcut ekrandaki
  değişiklikler kaybolmaz (form state korunur), hata mesajı gösterilir.

## Test

Bu depoda birim test çalıştırıcısı yok. Doğrulama: `tsc --noEmit` + canlı
tarayıcı testi (gerçek admin girişiyle): (1) `/admin/nav-yapisi`'nde bir
linki gizle, kaydet, ilgili linkin sidebar'dan kalktığını doğrula; (2) yeni
özel bir link ekle (örn. rastgele bir href + mevcut bir permission), kaydet,
sidebar'da göründüğünü ve tıklanabildiğini doğrula; (3) bir grubu yeniden
sırala, kaydet, sidebar'da yeni sırayla göründüğünü doğrula; (4) config
satırını geçici olarak DB'den silip Nav.tsx'in `DEFAULT_NAV_CONFIG`
fallback'ine düştüğünü ve sidebar'ın boş kalmadığını doğrula, sonra seed'i
geri yükle; (5) `admin` olmayan bir rolle `/admin/nav-yapisi`'ne erişimin
engellendiğini doğrula.
