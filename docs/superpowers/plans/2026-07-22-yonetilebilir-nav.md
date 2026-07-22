# Yönetilebilir Nav Yapısı Implementasyon Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `components/Nav.tsx`'teki sabit link/grup dizilerini (`BUGUN_LINKS`
... `YONETIM_TEKNIK_LINKS`, `NAV_PERMISSION_BY_HREF`) DB'de tutulan, tek bir
admin sayfasından (`/admin/nav-yapisi`) düzenlenebilen bir yapıya çevirmek.

**Architecture:** Yeni `nav_config` tablosu tek bir JSON satır tutar (tüm
grup+link ağacı). `Nav.tsx` bu config'i `GET /api/admin/nav-config` ile
çeker; başarısız olursa kod içindeki `DEFAULT_NAV_CONFIG` sabitine düşer
(nav asla boş kalmaz). Admin `PUT /api/admin/nav-config` ile tüm ağacı tek
seferde günceller. İkonlar string isim olarak saklanır, render'da
`ICON_REGISTRY`'den component'e çevrilir.

**Tech Stack:** Next.js App Router, TypeScript, MySQL/MariaDB (mysql2),
Zod, Tailwind. Bu depoda birim test çalıştırıcısı yok — doğrulama
`node node_modules/typescript/bin/tsc --noEmit` + canlı DB/tarayıcı testi.

## Global Constraints

- Migration dosyası numarası: **079** (son mevcut: 078).
- ID'ler `VARCHAR(36)`, zaman damgaları `VARCHAR(30)` ISO string
  (`nowIso()` yardımcı fonksiyonu, `lib/time.ts`).
- `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`.
- API route deseni: `requireUser()` → 401 → `hasPermission(user, "...")`
  → 403 → Zod `safeParse` → 400 → SQL (parametrized) → `apiError(e)` catch.
- **Kapsam dışı (bu planda değişmez):** `BOTTOM_NAV` (mobil alt bar, 4
  sabit link) — sadece sidebar/drawer grupları config'e taşınıyor.
  Bildirim paneli, kullanıcı menüsü, scroll-restore mantığı, top bar,
  mobil "Daha Fazla" drawer'ın genel iskeleti — bunların hiçbiri
  değişmiyor, sadece hangi grup/link verisini kullandıkları değişiyor.
- Tünel/dev server komutları (SSH tüneli düşerse): `sshpass -p 'kayra123'
  ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -f -N -L
  3307:172.22.0.3:3306 root@212.64.201.150` sonra `npm run dev`. DB:
  `host=127.0.0.1 port=3307 user=aycanops password=Kayra2190.
  database=aycanops_db`. Gerçek test girişi: `admin1`/`admin1`
  (`POST /api/auth/login`, dönen `opsdesk_session` cookie'sini kullan,
  mutasyon isteklerinde `Origin: http://localhost:3000` header'ı da
  gerekli yoksa CSRF middleware 403 döner). Bu kimlik bilgilerini hiçbir
  rapor/commit mesajında tekrar etme.
- **Session forge YASAK.** Gerçek login akışı dışında hiçbir şekilde
  `sessions` tablosuna doğrudan satır yazmayın.
- Bu repo'nun git ağacında her zaman yüzlerce ilgisiz değişmiş/untracked
  dosya vardır — `git add -A`/`git add .` KULLANMAYIN, sadece bu task'ın
  değiştirdiği tam dosya yollarını `git add` edin.

---

## Dosya Yapısı Özeti

```
migrations/079_nav_config.sql                 (yeni — Task 1)
lib/permissions.ts                             (değişiklik — Task 2)
lib/schemas.ts                                 (değişiklik — Task 3)
lib/nav-icons.ts                               (yeni — Task 4)
app/api/admin/nav-config/route.ts              (yeni — Task 5)
app/api/admin/permissions/catalog/route.ts     (yeni — Task 5)
components/Nav.tsx                             (değişiklik — Task 6)
app/admin/nav-yapisi/page.tsx                  (yeni — Task 7)
```

---

### Task 1: Migration — `nav_config` tablosu + seed

**Files:**
- Create: `migrations/079_nav_config.sql`

**Interfaces:**
- Produces: `nav_config` tablosu, tek satır (`id = 'singleton'`),
  `config_json` kolonu — sonraki tüm task'lar bu satırı okur/yazar.

- [ ] **Step 1: Migration dosyasını yaz**

Aşağıdaki JSON, bugünkü `components/Nav.tsx`'in TAM karşılığıdır (8 grup,
tüm linkler, bugünkü `NAV_PERMISSION_BY_HREF` eşlemeleri, bugünkü
`isManager`/`isAdmin` kapıları `minRole`'e çevrilmiş hali —
`isManager` → `"yetkili"`, `isAdmin` → `"admin"`). `YONETIM_TEKNIK_LINKS`
bugün "Yönetim" grubunun içinde iç içe "Teknik" alt-başlığı olarak
render ediliyordu; bu planda kendi başlığı olan ayrı bir üst-seviye grup
oluyor (görsel olarak artık kendi aç/kapat başlığına sahip, "Yönetim"
grubunun bir alt bölümü değil — kasıtlı bir sadeleştirme, veri modelini
düz `groups[].items[]` tutmak için iç içe alt-grup eklenmiyor). "Yönetim"
grubundaki "Toplu İşlem" linki `item.minRole: "yetkili"` ile diğer 9
linkten (`item.minRole: "admin"`) ayrı bir eşiğe sahip — grubun kendi
`minRole`'ü `null` (item seviyesinde belirleniyor).

`/admin/hizli-gorev` bugün `NAV_PERMISSION_BY_HREF`'te hiç yoktu (sadece
grup seviyesindeki `isAdmin` kapısıyla korunuyordu) — seed'de
`"dashboard:read"` (herkeste var olan, zararsız bir katalog anahtarı)
kullanılıyor çünkü asıl erişim kontrolü zaten `item.minRole: "admin"`
tarafından sağlanıyor.

```sql
-- Migration: 079_nav_config
-- Tarih: 2026-07-22
-- Açıklama: Nav.tsx'teki sabit link/grup yapısını admin panelinden
-- düzenlenebilir hale getiren tek-satırlık JSON config tablosu.

CREATE TABLE IF NOT EXISTS nav_config (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  config_json JSON NOT NULL,
  updated_by VARCHAR(36) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO nav_config (id, config_json, updated_by, updated_at)
VALUES (
  'singleton',
  JSON_PRETTY('{
    "groups": [
      {
        "key": "bugun", "label": "Bugün", "sortOrder": 0, "isActive": true, "minRole": null,
        "items": [
          {"id":"bugun-1","href":"/","label":"Panel","icon":"IconHome","permission":"dashboard:read","isActive":true,"sortOrder":0,"isCustom":false},
          {"id":"bugun-2","href":"/gunluk","label":"Günlük","icon":"IconClipboard","permission":"dashboard:read","isActive":true,"sortOrder":1,"isCustom":false},
          {"id":"bugun-3","href":"/giris-kontrol","label":"Giriş Kontrol","icon":"IconTrafficCone","permission":"arrivals:read","isActive":true,"sortOrder":2,"isCustom":false},
          {"id":"bugun-4","href":"/transferler","label":"Transfer","icon":"IconClock","permission":"transfers:read","isActive":true,"sortOrder":3,"isCustom":false},
          {"id":"bugun-5","href":"/cetele","label":"Çetele","icon":"IconClipboard2","permission":"cetele:read","isActive":true,"sortOrder":4,"isCustom":false}
        ]
      },
      {
        "key": "araclar", "label": "Araçlar", "sortOrder": 1, "isActive": true, "minRole": "yetkili",
        "items": [
          {"id":"araclar-1","href":"/araclar","label":"Araçlar","icon":"IconCar","permission":"vehicles:read","isActive":true,"sortOrder":0,"isCustom":false},
          {"id":"araclar-2","href":"/bakim","label":"Araç Bakım","icon":"IconWrench","permission":"maintenance:read","isActive":true,"sortOrder":1,"isCustom":false},
          {"id":"araclar-3","href":"/belgeler","label":"Belgeler","icon":"IconDocument","permission":"documents:read","isActive":true,"sortOrder":2,"isCustom":false},
          {"id":"araclar-4","href":"/denetimler","label":"Denetimler","icon":"IconSearch","permission":"vehicles:read","isActive":true,"sortOrder":3,"isCustom":false},
          {"id":"araclar-5","href":"/filo/kazalar","label":"Kazalar","icon":"IconAlertTriangle","permission":"fleet_accidents:read","isActive":true,"sortOrder":4,"isCustom":false},
          {"id":"araclar-6","href":"/filo/cezalar","label":"Cezalar","icon":"IconAlertTriangle","permission":"fleet_penalties:read","isActive":true,"sortOrder":5,"isCustom":false},
          {"id":"araclar-7","href":"/filo/arizalar","label":"Arızalar","icon":"IconWrench","permission":"fleet_breakdowns:read","isActive":true,"sortOrder":6,"isCustom":false},
          {"id":"araclar-8","href":"/filo/sigortalar","label":"Sigortalar","icon":"IconDocument","permission":"fleet_insurances:read","isActive":true,"sortOrder":7,"isCustom":false},
          {"id":"araclar-9","href":"/filo/lastikler","label":"Lastikler","icon":"IconCar","permission":"fleet_tires:read","isActive":true,"sortOrder":8,"isCustom":false},
          {"id":"araclar-10","href":"/admin/gps-cihazlari","label":"GPS Cihazları","icon":"IconMap","permission":"gps_devices:read","isActive":true,"sortOrder":9,"isCustom":false},
          {"id":"araclar-11","href":"/yakit-kartlari","label":"Yakıt Kartları","icon":"IconZap","permission":"fuel_cards:read","isActive":true,"sortOrder":10,"isCustom":false},
          {"id":"araclar-12","href":"/admin/hgs-ogs","label":"HGS/OGS","icon":"IconCoin","permission":"hgs_ogs:read","isActive":true,"sortOrder":11,"isCustom":false}
        ]
      },
      {
        "key": "insan", "label": "İnsan", "sortOrder": 2, "isActive": true, "minRole": "yetkili",
        "items": [
          {"id":"insan-1","href":"/suruculer","label":"Sürücüler","icon":"IconUsers","permission":"drivers:read","isActive":true,"sortOrder":0,"isCustom":false},
          {"id":"insan-2","href":"/yolcular","label":"Yolcular","icon":"IconUsers","permission":"passengers:read","isActive":true,"sortOrder":1,"isCustom":false},
          {"id":"insan-3","href":"/izin-talepleri","label":"İzin Talepleri","icon":"IconCalendar","permission":"leave_requests:read","isActive":true,"sortOrder":2,"isCustom":false},
          {"id":"insan-4","href":"/sofor-degerlendirme","label":"Sürücü Değerlendirme","icon":"IconStar","permission":"drivers:read","isActive":true,"sortOrder":3,"isCustom":false},
          {"id":"insan-5","href":"/rehberler","label":"Rehberler","icon":"IconUsers","permission":"rehberler:read","isActive":true,"sortOrder":4,"isCustom":false}
        ]
      },
      {
        "key": "rota", "label": "Rota", "sortOrder": 3, "isActive": true, "minRole": "yetkili",
        "items": [
          {"id":"rota-1","href":"/guzergahlar","label":"Güzergahlar","icon":"IconMap","permission":"routes:read","isActive":true,"sortOrder":0,"isCustom":false},
          {"id":"rota-2","href":"/acik-guzergahlar","label":"Açık Güzergahlar","icon":"IconAlertTriangle","permission":"routes:read","isActive":true,"sortOrder":1,"isCustom":false},
          {"id":"rota-3","href":"/rota-planlama","label":"Rota Planlama","icon":"IconCalendar","permission":"routes:optimize","isActive":true,"sortOrder":2,"isCustom":false},
          {"id":"rota-4","href":"/operasyon-haritasi","label":"Operasyon Haritası","icon":"IconMap","permission":"map:read","isActive":true,"sortOrder":3,"isCustom":false},
          {"id":"rota-5","href":"/guzergah-fiyatlari","label":"Güzergah Fiyatları","icon":"IconCoin","permission":"route_prices:read","isActive":true,"sortOrder":4,"isCustom":false}
        ]
      },
      {
        "key": "finans", "label": "Finans", "sortOrder": 4, "isActive": true, "minRole": null,
        "items": [
          {"id":"finans-1","href":"/isletenler","label":"İşletenler (Araç Tedarikçileri)","icon":"IconBuilding","permission":"isleten:read","isActive":true,"sortOrder":0,"isCustom":false},
          {"id":"finans-2","href":"/hakedis","label":"Hakediş","icon":"IconCoin","permission":"hakedis:read","isActive":true,"sortOrder":1,"isCustom":false},
          {"id":"finans-3","href":"/mutabakat","label":"Firma Mutabakat","icon":"IconCoin","permission":"firma_mutabakat:read","isActive":true,"sortOrder":2,"isCustom":false},
          {"id":"finans-4","href":"/kar-zarar","label":"Kâr-Zarar","icon":"IconBarChart","permission":"reports:read","isActive":true,"sortOrder":3,"isCustom":false},
          {"id":"finans-5","href":"/butce","label":"Bütçe & Maliyet","icon":"IconCoin","permission":"budget:read","isActive":true,"sortOrder":4,"isCustom":false},
          {"id":"finans-6","href":"/firmalar","label":"Firmalar (Müşteriler)","icon":"IconBuilding","permission":"companies:read","isActive":true,"sortOrder":5,"isCustom":false},
          {"id":"finans-7","href":"/raporlar","label":"Raporlar","icon":"IconBarChart","permission":"reports:read","isActive":true,"sortOrder":6,"isCustom":false},
          {"id":"finans-8","href":"/finans/gelir-gider","label":"Gelir-Gider","icon":"IconCoin","permission":"finans_gelir_gider:read","isActive":true,"sortOrder":7,"isCustom":false},
          {"id":"finans-9","href":"/finans/masraf-talebi","label":"Masraf Talebi","icon":"IconClipboard2","permission":"finans_masraf_talebi:read","isActive":true,"sortOrder":8,"isCustom":false},
          {"id":"finans-10","href":"/finans/faturalar","label":"Faturalar","icon":"IconDocument","permission":"finans_fatura:read","isActive":true,"sortOrder":9,"isCustom":false},
          {"id":"finans-11","href":"/finans/fisler","label":"Fişler","icon":"IconClipboard2","permission":"finans_fis:read","isActive":true,"sortOrder":10,"isCustom":false},
          {"id":"finans-12","href":"/finans/belgeler","label":"Finans Belgeleri","icon":"IconDocument","permission":"finans_belge:read","isActive":true,"sortOrder":11,"isCustom":false},
          {"id":"finans-13","href":"/finans/odemeler","label":"Ödemeler","icon":"IconCoin","permission":"finans_odeme:read","isActive":true,"sortOrder":12,"isCustom":false},
          {"id":"finans-14","href":"/finans/banka-hareketleri","label":"Banka Hareketleri","icon":"IconActivity","permission":"finans_banka_hareketi:read","isActive":true,"sortOrder":13,"isCustom":false}
        ]
      },
      {
        "key": "gorevler", "label": "Görevler", "sortOrder": 5, "isActive": true, "minRole": null,
        "items": [
          {"id":"gorevler-1","href":"/gorevler","label":"İş Takibi","icon":"IconCheckSquare","permission":"dashboard:read","isActive":true,"sortOrder":0,"isCustom":false},
          {"id":"gorevler-2","href":"/oneriler","label":"Öneri/Talep","icon":"IconLightbulb","permission":"suggestions:read","isActive":true,"sortOrder":1,"isCustom":false},
          {"id":"gorevler-3","href":"/notlar","label":"Notlar","icon":"IconFileText","permission":"dashboard:read","isActive":true,"sortOrder":2,"isCustom":false},
          {"id":"gorevler-4","href":"/surucu-sicil","label":"Sürücü Sicil","icon":"IconClipboard2","permission":"driver_records:read","isActive":true,"sortOrder":3,"isCustom":false}
        ]
      },
      {
        "key": "yonetim", "label": "Yönetim", "sortOrder": 6, "isActive": true, "minRole": null,
        "items": [
          {"id":"yonetim-1","href":"/toplu-islem","label":"Toplu İşlem","icon":"IconClipboard2","permission":"bulk_actions:preview","isActive":true,"sortOrder":0,"isCustom":false,"minRole":"yetkili"},
          {"id":"yonetim-2","href":"/admin/musteriler","label":"Müşteri Portalı","icon":"IconUsers","permission":"portal_requests:read","isActive":true,"sortOrder":1,"isCustom":false,"minRole":"admin"},
          {"id":"yonetim-3","href":"/admin/hizli-gorev","label":"Hızlı Görev","icon":"IconZap","permission":"dashboard:read","isActive":true,"sortOrder":2,"isCustom":false,"minRole":"admin"},
          {"id":"yonetim-4","href":"/admin/uyarilar","label":"Uyarılar","icon":"IconAlertTriangle","permission":"warnings:read","isActive":true,"sortOrder":3,"isCustom":false,"minRole":"admin"},
          {"id":"yonetim-5","href":"/admin/izin-onaylayicilar","label":"İzin Onaylayıcıları","icon":"IconShield","permission":"users:read","isActive":true,"sortOrder":4,"isCustom":false,"minRole":"admin"},
          {"id":"yonetim-6","href":"/admin/kara-liste","label":"Kara Liste","icon":"IconAlertTriangle","permission":"kara_liste:read","isActive":true,"sortOrder":5,"isCustom":false,"minRole":"admin"},
          {"id":"yonetim-7","href":"/admin/duyurular","label":"Duyurular","icon":"IconBell","permission":"duyurular:read","isActive":true,"sortOrder":6,"isCustom":false,"minRole":"admin"},
          {"id":"yonetim-8","href":"/admin/anketler","label":"Anketler","icon":"IconClipboard","permission":"anketler:read","isActive":true,"sortOrder":7,"isCustom":false,"minRole":"admin"},
          {"id":"yonetim-9","href":"/admin/dogum-gunleri","label":"Doğum Günleri","icon":"IconStar","permission":"drivers:read","isActive":true,"sortOrder":8,"isCustom":false,"minRole":"admin"}
        ]
      },
      {
        "key": "yonetim-teknik", "label": "Yönetim (Teknik)", "sortOrder": 7, "isActive": true, "minRole": "admin",
        "items": [
          {"id":"teknik-1","href":"/admin/yakit-fiyatlari","label":"Yakıt Fiyatları","icon":"IconCoin","permission":"yakit_fiyatlari:read","isActive":true,"sortOrder":0,"isCustom":false},
          {"id":"teknik-2","href":"/admin/otoyol-fiyatlari","label":"Otoyol/Köprü Fiyatları","icon":"IconCoin","permission":"otoyol_fiyatlari:read","isActive":true,"sortOrder":1,"isCustom":false},
          {"id":"teknik-3","href":"/admin/arac-gruplari","label":"Araç Grupları","icon":"IconCar","permission":"arac_gruplari:read","isActive":true,"sortOrder":2,"isCustom":false},
          {"id":"teknik-4","href":"/admin/sigorta-sirketleri","label":"Sigorta Şirketleri","icon":"IconDocument","permission":"sigorta_sirketleri:read","isActive":true,"sortOrder":3,"isCustom":false},
          {"id":"teknik-5","href":"/admin/banka-tanimlari","label":"Banka Tanımları","icon":"IconBuilding","permission":"banka_tanimlari:read","isActive":true,"sortOrder":4,"isCustom":false},
          {"id":"teknik-6","href":"/admin/donem-tanimlari","label":"Dönem Tanımları","icon":"IconCalendar","permission":"donem_tanimlari:read","isActive":true,"sortOrder":5,"isCustom":false},
          {"id":"teknik-7","href":"/admin/api-keys","label":"API Anahtarları","icon":"IconKey","permission":"integrations:update","isActive":true,"sortOrder":6,"isCustom":false},
          {"id":"teknik-8","href":"/admin/audit-log","label":"Aktivite Günlüğü","icon":"IconHistory","permission":"audit:read","isActive":true,"sortOrder":7,"isCustom":false},
          {"id":"teknik-9","href":"/admin/roller","label":"Roller ve Yetkiler","icon":"IconKey","permission":"users:permissions","isActive":true,"sortOrder":8,"isCustom":false},
          {"id":"teknik-10","href":"/admin","label":"Yönetim Paneli","icon":"IconSettings","permission":"users:read","isActive":true,"sortOrder":9,"isCustom":false}
        ]
      }
    ]
  }'),
  'system',
  '2026-07-22T00:00:00.000Z'
);
```

- [ ] **Step 2: Tünel ve dev sunucusunu ayağa kaldır**

```bash
nc -z -w3 127.0.0.1 3307 || (pkill -f "ssh.*3307"; sshpass -p 'kayra123' ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -f -N -L 3307:172.22.0.3:3306 root@212.64.201.150)
pkill -f "next dev"; sleep 1
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops && nohup npm run dev > /tmp/aycanops-dev.log 2>&1 &
sleep 8
```

- [ ] **Step 3: Migration'ın uygulandığını doğrula**

```bash
grep "079_nav_config" /tmp/aycanops-dev.log
```
Beklenen: `Migration 079_nav_config.sql applied successfully`.

- [ ] **Step 4: Seed'in doğru yapıda olduğunu DB'den doğrula**

```bash
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops && node -e "
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'aycanops', password: 'Kayra2190.', database: 'aycanops_db' });
  const [rows] = await conn.query(\"SELECT config_json FROM nav_config WHERE id='singleton'\");
  const cfg = JSON.parse(rows[0].config_json);
  console.log('grup sayısı:', cfg.groups.length);
  console.log('toplam link sayısı:', cfg.groups.reduce((s,g)=>s+g.items.length,0));
  console.log('finans grubu link sayısı:', cfg.groups.find(g=>g.key==='finans').items.length);
  await conn.end();
})().catch(e => { console.error(e.message); process.exit(1); });
"
```
Beklenen: `grup sayısı: 8`, `toplam link sayısı: 63`, `finans grubu link sayısı: 14`.

- [ ] **Step 5: Commit**

```bash
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops
git add migrations/079_nav_config.sql
git commit -m "Nav config: nav_config tablosu + Nav.tsx'in tam seed'i (migration 079)"
```

---

### Task 2: `lib/permissions.ts` — `nav_config:update` izni

**Files:**
- Modify: `lib/permissions.ts`

**Interfaces:**
- Consumes: mevcut `PERMISSIONS` kataloğu ve `DEFAULT_ROLE_PERMISSIONS`
  yapısı.
- Produces: `"nav_config:update"` permission key'i — Task 5'in API
  route'ları bunu kullanır.

- [ ] **Step 1: `PERMISSIONS` kataloğuna ekle**

Mevcut `finans_banka_hareketi: [...]` satırının hemen altına (veya
kataloğun sonuna, mevcut ekleme deseniyle tutarlı herhangi bir yere):

```ts
  nav_config: ["update"],
```

- [ ] **Step 2: `DEFAULT_ROLE_PERMISSIONS.admin`'e ekleme gerekmiyor**

`admin` rolü zaten `Object.entries(PERMISSIONS).flatMap(...)` ile TÜM
izinleri otomatik alıyor (bu depodaki yerleşik desen) — `nav_config:update`
de otomatik olarak admin'e dahil olur, ayrı bir satır eklemeye gerek yok.
`yetkili`/`yonetici` rollerine BU İZİN eklenmez (tasarımın "sadece admin
düzenleyebilir" kararı gereği).

- [ ] **Step 3: Tip kontrolü**

```bash
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops && node node_modules/typescript/bin/tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops
git add lib/permissions.ts
git commit -m "Nav config: nav_config:update izni (sadece admin)"
```

---

### Task 3: `lib/schemas.ts` — Zod şeması

**Files:**
- Modify: `lib/schemas.ts`

**Interfaces:**
- Consumes: `PERMISSIONS` (`lib/permissions.ts`), `NAV_ICON_NAMES`
  (`lib/nav-icons.ts` — bu dosya Task 4'te oluşturuluyor, bu task ondan
  ÖNCE çalıştırılıyorsa import satırı geçici olarak derlenmeyecektir;
  bu planın task sırasına uyulduğu sürece Task 4 bu task'tan HEMEN SONRA
  geldiği için proje bir bütün olarak (her iki task da bitince) derlenir
  — Task 3'ün kendi `tsc` adımı bu tek dosya için hata verebilir, bu
  normaldir, Task 4 bitince tekrar çalıştırılan tsc temiz olacaktır. Bu
  yüzden Task 3'ün Step 3'ünde SADECE syntax/tip hatası olmadığını görmek
  yeterli, `Cannot find module '@/lib/nav-icons'` hatası bekleniyor ve
  görmezden gelinir).
- Produces: `navConfigSchema`, `NavConfigItemType`, `NavGroupType`,
  `NavConfigType` (TS tipleri) — Task 5 ve Task 6 bunları kullanır.

- [ ] **Step 1: Dosyanın en üstüne import ekle**

Mevcut importların yanına (dosyanın en üstündeki import bloğuna):

```ts
import { PERMISSIONS } from "@/lib/permissions";
import { NAV_ICON_NAMES } from "@/lib/nav-icons";
```

- [ ] **Step 2: Şemaları dosyanın sonuna ekle**

```ts
// ─── Nav Config ──────────────────────────────────────────────────────────
const NAV_PERMISSION_STRINGS = new Set(
  Object.entries(PERMISSIONS).flatMap(([resource, actions]) =>
    (actions as string[]).map((a) => `${resource}:${a}`)
  )
);
const NAV_ICON_NAME_SET = new Set(NAV_ICON_NAMES);
const navMinRoleSchema = z.enum(["yetkili", "admin"]).nullable();

export const navConfigItemSchema = z.object({
  id: z.string().min(1),
  href: z.string().min(1).max(200),
  label: z.string().min(1).max(100),
  icon: z.string().refine((v) => NAV_ICON_NAME_SET.has(v), {
    message: "Geçersiz ikon adı",
  }),
  permission: z.string().refine((v) => NAV_PERMISSION_STRINGS.has(v), {
    message: "Geçersiz izin anahtarı",
  }),
  isActive: z.boolean(),
  sortOrder: z.number(),
  isCustom: z.boolean(),
  minRole: navMinRoleSchema.optional(),
});

export const navGroupSchema = z.object({
  key: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  sortOrder: z.number(),
  isActive: z.boolean(),
  minRole: navMinRoleSchema,
  items: z.array(navConfigItemSchema),
});

export const navConfigSchema = z.object({
  groups: z.array(navGroupSchema),
});

export type NavConfigItemType = z.infer<typeof navConfigItemSchema>;
export type NavGroupType = z.infer<typeof navGroupSchema>;
export type NavConfigType = z.infer<typeof navConfigSchema>;
```

- [ ] **Step 3: Tip kontrolü (Task 4 bitene kadar `nav-icons` hatası beklenir)**

```bash
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops && node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -v "nav-icons"
```
Beklenen: `lib/nav-icons` ile ilgili olmayan başka hata yok.

- [ ] **Step 4: Commit**

```bash
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops
git add lib/schemas.ts
git commit -m "Nav config: Zod şeması (navConfigSchema)"
```

---

### Task 4: `lib/nav-icons.ts` — ikon kaydı

**Files:**
- Create: `lib/nav-icons.ts`

**Interfaces:**
- Consumes: `components/Icons.tsx`'in tüm export'ları (değişmiyor,
  sadece referans alınıyor).
- Produces: `NAV_ICON_NAMES: string[]` (Task 3'ün şema doğrulaması ve
  Task 7'nin ikon seçici grid'i tarafından kullanılır), `ICON_REGISTRY:
  Record<string, React.ComponentType<{ size?: number; className?: string }>>`
  ve `DEFAULT_NAV_ICON` (Task 6'nın Nav.tsx'i ve Task 7'nin admin
  sayfası tarafından kullanılır).

- [ ] **Step 1: Dosyayı yaz**

```ts
import {
  IconHome, IconClipboard, IconCheckSquare, IconClock, IconTrafficCone,
  IconStar, IconFileText, IconLightbulb, IconTruck, IconMap, IconSearch,
  IconClipboard2, IconBarChart, IconBuilding, IconZap, IconAlertTriangle,
  IconSettings, IconLogOut, IconBell, IconChevronLeft, IconChevronRight,
  IconX, IconMenu, IconCar, IconUsers, IconShield, IconActivity, IconWrench,
  IconCoin, IconKey, IconDocument, IconCalendar, IconHistory, IconArrowUpRight,
  IconCopy, IconPlus, IconCheck, IconChevronDown, IconChevronUp,
} from "@/components/Icons";

// Nav config'te bir link'in ikonu string isim olarak saklanır (örn.
// "IconCoin") — bu dosya o ismi gerçek React component'ine çevirir.
// Admin panelindeki ikon seçici de bu registry'nin anahtarlarını listeler.
export const ICON_REGISTRY: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  IconHome, IconClipboard, IconCheckSquare, IconClock, IconTrafficCone,
  IconStar, IconFileText, IconLightbulb, IconTruck, IconMap, IconSearch,
  IconClipboard2, IconBarChart, IconBuilding, IconZap, IconAlertTriangle,
  IconSettings, IconLogOut, IconBell, IconChevronLeft, IconChevronRight,
  IconX, IconMenu, IconCar, IconUsers, IconShield, IconActivity, IconWrench,
  IconCoin, IconKey, IconDocument, IconCalendar, IconHistory, IconArrowUpRight,
  IconCopy, IconPlus, IconCheck, IconChevronDown, IconChevronUp,
};

// Şema doğrulaması (lib/schemas.ts) sadece bu isim listesine ihtiyaç duyar,
// component'lerin kendisine değil.
export const NAV_ICON_NAMES: string[] = Object.keys(ICON_REGISTRY);

// Registry'de olmayan bir isimle karşılaşılırsa (örn. ileride bir ikon
// component'i kod tabanından silinirse ama eski bir config satırı hâlâ
// o ismi referans ediyorsa) sessizce bu ikona düşülür, hata fırlatılmaz.
export const DEFAULT_NAV_ICON = IconActivity;
```

- [ ] **Step 2: Tip kontrolü**

```bash
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops && node node_modules/typescript/bin/tsc --noEmit
```
Beklenen: temiz, sıfır hata (Task 3'teki `nav-icons` hatası artık gitmiş
olmalı).

- [ ] **Step 3: Commit**

```bash
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops
git add lib/nav-icons.ts
git commit -m "Nav config: ikon kaydı (ICON_REGISTRY, NAV_ICON_NAMES)"
```

---

### Task 5: API route'ları

**Files:**
- Create: `app/api/admin/nav-config/route.ts`
- Create: `app/api/admin/permissions/catalog/route.ts`

**Interfaces:**
- Consumes: `navConfigSchema` (Task 3), `PERMISSIONS` (`lib/permissions.ts`).
- Produces: `GET/PUT /api/admin/nav-config`, `GET
  /api/admin/permissions/catalog` — Task 6 (Nav.tsx) ve Task 7 (admin
  sayfası) bunları tüketir.

- [ ] **Step 1: `app/api/admin/nav-config/route.ts`'i yaz**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { navConfigSchema } from "@/lib/schemas";

// Herkes (giriş yapmış her kullanıcı) okuyabilir — Nav.tsx her sayfada
// bunu fetch ediyor, sadece admin panelinden düzenleme kısıtlı.
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const row = await getDb().prepare(
      `SELECT config_json FROM nav_config WHERE id = 'singleton'`
    ).get() as { config_json: string } | undefined;

    if (!row) return NextResponse.json({ ok: false, error: "Nav config bulunamadı" }, { status: 404 });

    const config = typeof row.config_json === "string" ? JSON.parse(row.config_json) : row.config_json;
    return NextResponse.json({ ok: true, data: config });
  } catch (e) { return apiError(e); }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "nav_config:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = navConfigSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

    const now = nowIso();
    await getDb().prepare(
      `UPDATE nav_config SET config_json = ?, updated_by = ?, updated_at = ? WHERE id = 'singleton'`
    ).run(JSON.stringify(parsed.data), user.id, now);

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
```

- [ ] **Step 2: `app/api/admin/permissions/catalog/route.ts`'i yaz**

```ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

// Sadece nav_config:update iznine sahip biri (yani admin) izin
// kataloğunu görebilir — admin panelindeki izin seçici dropdown'u için.
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "nav_config:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const catalog = Object.entries(PERMISSIONS)
      .flatMap(([resource, actions]) => (actions as string[]).map((a) => `${resource}:${a}`))
      .sort();

    return NextResponse.json({ ok: true, data: catalog });
  } catch (e) { return apiError(e); }
}
```

`PERMISSIONS`, `lib/permissions.ts:6`'da zaten `export const PERMISSIONS
= {...}` olarak export edilmiş durumda — ek bir değişiklik gerekmiyor.

- [ ] **Step 3: Tip kontrolü**

```bash
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops && node node_modules/typescript/bin/tsc --noEmit
```

- [ ] **Step 4: Canlı doğrulama**

Gerçek `admin1`/`admin1` girişiyle:

```bash
COOKIE_JAR=/tmp/nav-test-cookies.txt
curl -sS -c "$COOKIE_JAR" -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin1","password":"admin1"}' -o /dev/null -w "login: %{http_code}\n"
curl -sS -b "$COOKIE_JAR" http://localhost:3000/api/admin/nav-config | head -c 300
echo
curl -sS -b "$COOKIE_JAR" http://localhost:3000/api/admin/permissions/catalog | head -c 300
```
Beklenen: ilk çağrı `{"ok":true,"data":{"groups":[...` ile başlar (8
grup), ikinci çağrı `{"ok":true,"data":["anketler:read",...` gibi
alfabetik sıralı bir dizi döner.

- [ ] **Step 5: Commit**

```bash
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops
git add app/api/admin/nav-config app/api/admin/permissions/catalog
git commit -m "Nav config: GET/PUT nav-config + GET permissions/catalog API"
```

---

### Task 6: `components/Nav.tsx` — config-driven render

**Files:**
- Modify: `components/Nav.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/nav-config` (Task 5), `ICON_REGISTRY` +
  `DEFAULT_NAV_ICON` (Task 4), `NavConfigType`/`NavGroupType`/
  `NavConfigItemType` (Task 3).
- Produces: değişmiyor — component'in dışa açık `Nav({ user })` arayüzü
  aynı kalıyor, sadece içindeki veri kaynağı değişiyor.

Bu, planın en riskli task'ı: `Nav.tsx` HER sayfada render ediliyor, bir
hata sitenin tamamının navigasyonunu bozar. Aşağıdaki adımlar SADECE
belirtilen satır aralıklarını değiştirir — bildirim paneli, kullanıcı
menüsü, scroll-restore mantığı, top bar, mobil bottom nav ve "Daha Fazla"
drawer'ın genel iskeleti (başlık, kapat butonu, çıkış butonu) HİÇ
DEĞİŞMEZ.

- [ ] **Step 1: Import bloğunu değiştir**

Dosyanın 9-17. satırlarını (mevcut ikon importları + permission importu)
şununla değiştirin:

```ts
import ThemeSwitcher from "./ThemeSwitcher";
import GlobalSearch from "./GlobalSearch";
import GlobalCompanySelector from "./GlobalCompanySelector";
import {
  IconHome, IconTrafficCone, IconClock, IconCheckSquare,
  IconLogOut, IconBell, IconChevronLeft, IconChevronRight, IconX, IconMenu,
} from "./Icons";
import { ICON_REGISTRY, DEFAULT_NAV_ICON } from "@/lib/nav-icons";
import { hasPermission, isAtLeast, type UserRole } from "@/lib/permissions";
import type { NavConfigType, NavGroupType, NavConfigItemType } from "@/lib/schemas";
```

(Yalnızca chrome'da — top bar, bottom nav, drawer başlığı — doğrudan
kullanılan ikonlar tek tek import ediliyor; link'lerin ikonları artık
`ICON_REGISTRY`'den dinamik olarak çözülüyor.)

- [ ] **Step 2: Link grupları bloğunu `DEFAULT_NAV_CONFIG` ile değiştir**

Dosyanın 25-189. satırlarını (`// ── Link grupları ──` yorumundan
`NAV_PERMISSION_BY_HREF`'in kapanışına kadar olan TÜM blok —
`BUGUN_LINKS`, `ARACLAR_LINKS`, `INSAN_LINKS`, `ROTA_LINKS`,
`FINANS_LINKS`, `GOREVLER_LINKS`, `YONETIM_LINKS`,
`YONETIM_TEKNIK_LINKS`, `NAV_PERMISSION_BY_HREF`) TAMAMEN SİLİN.
`BOTTOM_NAV` (118-123. satırlar) ve `ROLE_LABELS`/`ROLE_COLORS`/
`ROLE_BG` (191-210. satırlar) DOKUNULMADAN KALIR — bu blok sadece o
ikisinin ARASINDAKİ (bugünkü 25-189 aralığı) kısmı kapsar. Silinen
bloğun yerine, `BOTTOM_NAV`'dan HEMEN ÖNCE şunu ekleyin:

```ts
// ── Nav config (DB'den fetch edilir, bu sabit sadece fetch başarısız
// olursa fallback olarak kullanılır — nav hiçbir durumda boş kalmaz) ──
const DEFAULT_NAV_CONFIG: NavConfigType = {
  groups: [
    {
      key: "bugun", label: "Bugün", sortOrder: 0, isActive: true, minRole: null,
      items: [
        { id: "bugun-1", href: "/", label: "Panel", icon: "IconHome", permission: "dashboard:read", isActive: true, sortOrder: 0, isCustom: false },
        { id: "bugun-2", href: "/gunluk", label: "Günlük", icon: "IconClipboard", permission: "dashboard:read", isActive: true, sortOrder: 1, isCustom: false },
        { id: "bugun-3", href: "/giris-kontrol", label: "Giriş Kontrol", icon: "IconTrafficCone", permission: "arrivals:read", isActive: true, sortOrder: 2, isCustom: false },
        { id: "bugun-4", href: "/transferler", label: "Transfer", icon: "IconClock", permission: "transfers:read", isActive: true, sortOrder: 3, isCustom: false },
        { id: "bugun-5", href: "/cetele", label: "Çetele", icon: "IconClipboard2", permission: "cetele:read", isActive: true, sortOrder: 4, isCustom: false },
      ],
    },
    {
      key: "araclar", label: "Araçlar", sortOrder: 1, isActive: true, minRole: "yetkili",
      items: [
        { id: "araclar-1", href: "/araclar", label: "Araçlar", icon: "IconCar", permission: "vehicles:read", isActive: true, sortOrder: 0, isCustom: false },
        { id: "araclar-2", href: "/bakim", label: "Araç Bakım", icon: "IconWrench", permission: "maintenance:read", isActive: true, sortOrder: 1, isCustom: false },
        { id: "araclar-3", href: "/belgeler", label: "Belgeler", icon: "IconDocument", permission: "documents:read", isActive: true, sortOrder: 2, isCustom: false },
        { id: "araclar-4", href: "/denetimler", label: "Denetimler", icon: "IconSearch", permission: "vehicles:read", isActive: true, sortOrder: 3, isCustom: false },
        { id: "araclar-5", href: "/filo/kazalar", label: "Kazalar", icon: "IconAlertTriangle", permission: "fleet_accidents:read", isActive: true, sortOrder: 4, isCustom: false },
        { id: "araclar-6", href: "/filo/cezalar", label: "Cezalar", icon: "IconAlertTriangle", permission: "fleet_penalties:read", isActive: true, sortOrder: 5, isCustom: false },
        { id: "araclar-7", href: "/filo/arizalar", label: "Arızalar", icon: "IconWrench", permission: "fleet_breakdowns:read", isActive: true, sortOrder: 6, isCustom: false },
        { id: "araclar-8", href: "/filo/sigortalar", label: "Sigortalar", icon: "IconDocument", permission: "fleet_insurances:read", isActive: true, sortOrder: 7, isCustom: false },
        { id: "araclar-9", href: "/filo/lastikler", label: "Lastikler", icon: "IconCar", permission: "fleet_tires:read", isActive: true, sortOrder: 8, isCustom: false },
        { id: "araclar-10", href: "/admin/gps-cihazlari", label: "GPS Cihazları", icon: "IconMap", permission: "gps_devices:read", isActive: true, sortOrder: 9, isCustom: false },
        { id: "araclar-11", href: "/yakit-kartlari", label: "Yakıt Kartları", icon: "IconZap", permission: "fuel_cards:read", isActive: true, sortOrder: 10, isCustom: false },
        { id: "araclar-12", href: "/admin/hgs-ogs", label: "HGS/OGS", icon: "IconCoin", permission: "hgs_ogs:read", isActive: true, sortOrder: 11, isCustom: false },
      ],
    },
    {
      key: "insan", label: "İnsan", sortOrder: 2, isActive: true, minRole: "yetkili",
      items: [
        { id: "insan-1", href: "/suruculer", label: "Sürücüler", icon: "IconUsers", permission: "drivers:read", isActive: true, sortOrder: 0, isCustom: false },
        { id: "insan-2", href: "/yolcular", label: "Yolcular", icon: "IconUsers", permission: "passengers:read", isActive: true, sortOrder: 1, isCustom: false },
        { id: "insan-3", href: "/izin-talepleri", label: "İzin Talepleri", icon: "IconCalendar", permission: "leave_requests:read", isActive: true, sortOrder: 2, isCustom: false },
        { id: "insan-4", href: "/sofor-degerlendirme", label: "Sürücü Değerlendirme", icon: "IconStar", permission: "drivers:read", isActive: true, sortOrder: 3, isCustom: false },
        { id: "insan-5", href: "/rehberler", label: "Rehberler", icon: "IconUsers", permission: "rehberler:read", isActive: true, sortOrder: 4, isCustom: false },
      ],
    },
    {
      key: "rota", label: "Rota", sortOrder: 3, isActive: true, minRole: "yetkili",
      items: [
        { id: "rota-1", href: "/guzergahlar", label: "Güzergahlar", icon: "IconMap", permission: "routes:read", isActive: true, sortOrder: 0, isCustom: false },
        { id: "rota-2", href: "/acik-guzergahlar", label: "Açık Güzergahlar", icon: "IconAlertTriangle", permission: "routes:read", isActive: true, sortOrder: 1, isCustom: false },
        { id: "rota-3", href: "/rota-planlama", label: "Rota Planlama", icon: "IconCalendar", permission: "routes:optimize", isActive: true, sortOrder: 2, isCustom: false },
        { id: "rota-4", href: "/operasyon-haritasi", label: "Operasyon Haritası", icon: "IconMap", permission: "map:read", isActive: true, sortOrder: 3, isCustom: false },
        { id: "rota-5", href: "/guzergah-fiyatlari", label: "Güzergah Fiyatları", icon: "IconCoin", permission: "route_prices:read", isActive: true, sortOrder: 4, isCustom: false },
      ],
    },
    {
      key: "finans", label: "Finans", sortOrder: 4, isActive: true, minRole: null,
      items: [
        { id: "finans-1", href: "/isletenler", label: "İşletenler (Araç Tedarikçileri)", icon: "IconBuilding", permission: "isleten:read", isActive: true, sortOrder: 0, isCustom: false },
        { id: "finans-2", href: "/hakedis", label: "Hakediş", icon: "IconCoin", permission: "hakedis:read", isActive: true, sortOrder: 1, isCustom: false },
        { id: "finans-3", href: "/mutabakat", label: "Firma Mutabakat", icon: "IconCoin", permission: "firma_mutabakat:read", isActive: true, sortOrder: 2, isCustom: false },
        { id: "finans-4", href: "/kar-zarar", label: "Kâr-Zarar", icon: "IconBarChart", permission: "reports:read", isActive: true, sortOrder: 3, isCustom: false },
        { id: "finans-5", href: "/butce", label: "Bütçe & Maliyet", icon: "IconCoin", permission: "budget:read", isActive: true, sortOrder: 4, isCustom: false },
        { id: "finans-6", href: "/firmalar", label: "Firmalar (Müşteriler)", icon: "IconBuilding", permission: "companies:read", isActive: true, sortOrder: 5, isCustom: false },
        { id: "finans-7", href: "/raporlar", label: "Raporlar", icon: "IconBarChart", permission: "reports:read", isActive: true, sortOrder: 6, isCustom: false },
        { id: "finans-8", href: "/finans/gelir-gider", label: "Gelir-Gider", icon: "IconCoin", permission: "finans_gelir_gider:read", isActive: true, sortOrder: 7, isCustom: false },
        { id: "finans-9", href: "/finans/masraf-talebi", label: "Masraf Talebi", icon: "IconClipboard2", permission: "finans_masraf_talebi:read", isActive: true, sortOrder: 8, isCustom: false },
        { id: "finans-10", href: "/finans/faturalar", label: "Faturalar", icon: "IconDocument", permission: "finans_fatura:read", isActive: true, sortOrder: 9, isCustom: false },
        { id: "finans-11", href: "/finans/fisler", label: "Fişler", icon: "IconClipboard2", permission: "finans_fis:read", isActive: true, sortOrder: 10, isCustom: false },
        { id: "finans-12", href: "/finans/belgeler", label: "Finans Belgeleri", icon: "IconDocument", permission: "finans_belge:read", isActive: true, sortOrder: 11, isCustom: false },
        { id: "finans-13", href: "/finans/odemeler", label: "Ödemeler", icon: "IconCoin", permission: "finans_odeme:read", isActive: true, sortOrder: 12, isCustom: false },
        { id: "finans-14", href: "/finans/banka-hareketleri", label: "Banka Hareketleri", icon: "IconActivity", permission: "finans_banka_hareketi:read", isActive: true, sortOrder: 13, isCustom: false },
      ],
    },
    {
      key: "gorevler", label: "Görevler", sortOrder: 5, isActive: true, minRole: null,
      items: [
        { id: "gorevler-1", href: "/gorevler", label: "İş Takibi", icon: "IconCheckSquare", permission: "dashboard:read", isActive: true, sortOrder: 0, isCustom: false },
        { id: "gorevler-2", href: "/oneriler", label: "Öneri/Talep", icon: "IconLightbulb", permission: "suggestions:read", isActive: true, sortOrder: 1, isCustom: false },
        { id: "gorevler-3", href: "/notlar", label: "Notlar", icon: "IconFileText", permission: "dashboard:read", isActive: true, sortOrder: 2, isCustom: false },
        { id: "gorevler-4", href: "/surucu-sicil", label: "Sürücü Sicil", icon: "IconClipboard2", permission: "driver_records:read", isActive: true, sortOrder: 3, isCustom: false },
      ],
    },
    {
      key: "yonetim", label: "Yönetim", sortOrder: 6, isActive: true, minRole: null,
      items: [
        { id: "yonetim-1", href: "/toplu-islem", label: "Toplu İşlem", icon: "IconClipboard2", permission: "bulk_actions:preview", isActive: true, sortOrder: 0, isCustom: false, minRole: "yetkili" },
        { id: "yonetim-2", href: "/admin/musteriler", label: "Müşteri Portalı", icon: "IconUsers", permission: "portal_requests:read", isActive: true, sortOrder: 1, isCustom: false, minRole: "admin" },
        { id: "yonetim-3", href: "/admin/hizli-gorev", label: "Hızlı Görev", icon: "IconZap", permission: "dashboard:read", isActive: true, sortOrder: 2, isCustom: false, minRole: "admin" },
        { id: "yonetim-4", href: "/admin/uyarilar", label: "Uyarılar", icon: "IconAlertTriangle", permission: "warnings:read", isActive: true, sortOrder: 3, isCustom: false, minRole: "admin" },
        { id: "yonetim-5", href: "/admin/izin-onaylayicilar", label: "İzin Onaylayıcıları", icon: "IconShield", permission: "users:read", isActive: true, sortOrder: 4, isCustom: false, minRole: "admin" },
        { id: "yonetim-6", href: "/admin/kara-liste", label: "Kara Liste", icon: "IconAlertTriangle", permission: "kara_liste:read", isActive: true, sortOrder: 5, isCustom: false, minRole: "admin" },
        { id: "yonetim-7", href: "/admin/duyurular", label: "Duyurular", icon: "IconBell", permission: "duyurular:read", isActive: true, sortOrder: 6, isCustom: false, minRole: "admin" },
        { id: "yonetim-8", href: "/admin/anketler", label: "Anketler", icon: "IconClipboard", permission: "anketler:read", isActive: true, sortOrder: 7, isCustom: false, minRole: "admin" },
        { id: "yonetim-9", href: "/admin/dogum-gunleri", label: "Doğum Günleri", icon: "IconStar", permission: "drivers:read", isActive: true, sortOrder: 8, isCustom: false, minRole: "admin" },
      ],
    },
    {
      key: "yonetim-teknik", label: "Yönetim (Teknik)", sortOrder: 7, isActive: true, minRole: "admin",
      items: [
        { id: "teknik-1", href: "/admin/yakit-fiyatlari", label: "Yakıt Fiyatları", icon: "IconCoin", permission: "yakit_fiyatlari:read", isActive: true, sortOrder: 0, isCustom: false },
        { id: "teknik-2", href: "/admin/otoyol-fiyatlari", label: "Otoyol/Köprü Fiyatları", icon: "IconCoin", permission: "otoyol_fiyatlari:read", isActive: true, sortOrder: 1, isCustom: false },
        { id: "teknik-3", href: "/admin/arac-gruplari", label: "Araç Grupları", icon: "IconCar", permission: "arac_gruplari:read", isActive: true, sortOrder: 2, isCustom: false },
        { id: "teknik-4", href: "/admin/sigorta-sirketleri", label: "Sigorta Şirketleri", icon: "IconDocument", permission: "sigorta_sirketleri:read", isActive: true, sortOrder: 3, isCustom: false },
        { id: "teknik-5", href: "/admin/banka-tanimlari", label: "Banka Tanımları", icon: "IconBuilding", permission: "banka_tanimlari:read", isActive: true, sortOrder: 4, isCustom: false },
        { id: "teknik-6", href: "/admin/donem-tanimlari", label: "Dönem Tanımları", icon: "IconCalendar", permission: "donem_tanimlari:read", isActive: true, sortOrder: 5, isCustom: false },
        { id: "teknik-7", href: "/admin/api-keys", label: "API Anahtarları", icon: "IconKey", permission: "integrations:update", isActive: true, sortOrder: 6, isCustom: false },
        { id: "teknik-8", href: "/admin/audit-log", label: "Aktivite Günlüğü", icon: "IconHistory", permission: "audit:read", isActive: true, sortOrder: 7, isCustom: false },
        { id: "teknik-9", href: "/admin/roller", label: "Roller ve Yetkiler", icon: "IconKey", permission: "users:permissions", isActive: true, sortOrder: 8, isCustom: false },
        { id: "teknik-10", href: "/admin", label: "Yönetim Paneli", icon: "IconSettings", permission: "users:read", isActive: true, sortOrder: 9, isCustom: false },
      ],
    },
  ],
};
```

(Bu, Task 1'in migration seed'iyle birebir aynı veri — `DEFAULT_NAV_CONFIG`
sabiti sadece fetch başarısız olduğunda kullanılır, normal koşulda DB'den
gelen config render edilir.)

- [ ] **Step 3: Component state'ine `navConfig` ekle ve fetch et**

232. satırdaki (`const [collapsed, setCollapsed] = useState(false);`)
HEMEN ALTINA ekleyin:

```ts
  const [navConfig, setNavConfig] = useState<NavConfigType>(DEFAULT_NAV_CONFIG);
```

249. satırdaki `openGroups` state tanımını (mevcut sabit 7 anahtarlı
halini) şununla değiştirin (8. anahtar `"yonetim-teknik"` eklendi):

```ts
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    bugun: true,
    araclar: true,
    insan: false,
    rota: false,
    finans: false,
    gorevler: false,
    yonetim: false,
    "yonetim-teknik": false,
  });
```

260. satırdaki (`}, [userProp]);` — userProp fetch effect'inin bittiği
yer) HEMEN ALTINA yeni bir effect ekleyin:

```ts
  // Nav yapısını DB'den çek — başarısız olursa DEFAULT_NAV_CONFIG (yukarıda
  // tanımlı, bugünkü sabit yapının birebir aynısı) kullanılmaya devam eder,
  // sidebar hiçbir zaman boş kalmaz.
  useEffect(() => {
    fetch("/api/admin/nav-config")
      .then((r) => { if (!r.ok) throw new Error("nav-config fetch failed"); return r.json(); })
      .then((d) => { if (d.ok && d.data) setNavConfig(d.data); })
      .catch(() => {});
  }, []);
```

- [ ] **Step 4: Aktif-grup-tespit effect'ini dinamikleştir**

266-286. satırlardaki (mevcut sabit `allGroups` map'i kullanan) effect'i
şununla değiştirin:

```ts
  // Mevcut sayfanın hangi gruba ait olduğunu bul ve o grubu aç
  useEffect(() => {
    const updates: Record<string, boolean> = {};
    for (const group of navConfig.groups) {
      if (group.items.some((it) => (it.href === "/" ? pathname === "/" : pathname.startsWith(it.href)))) {
        updates[group.key] = true;
      }
    }
    if (Object.keys(updates).length > 0) {
      setOpenGroups((prev) => ({ ...prev, ...updates }));
    }
  }, [pathname, navConfig]);
```

- [ ] **Step 5: `canShowLink`/`filterByAllowed`'i grup-farkında hale getir**

374-382. satırlardaki `canShowLink` ve `filterByAllowed` fonksiyonlarını
şununla değiştirin:

```ts
  const canShowItem = (item: NavConfigItemType, group: NavGroupType) => {
    if (!item.isActive || !group.isActive) return false;
    if (allowedPages !== null && !allowedPages.includes(item.href)) return false;
    const requiredMinRole = item.minRole ?? group.minRole;
    if (requiredMinRole === "admin" && role !== "admin") return false;
    if (requiredMinRole === "yetkili" && !isAtLeast(role as UserRole, "yetkili")) return false;
    return hasPermission({ role: role as UserRole, permissions: (user as any)?.permissions }, item.permission as any);
  };

  const getGroupItems = (key: string) => {
    const group = navConfig.groups.find((g) => g.key === key);
    if (!group || !group.isActive) return [];
    return [...group.items]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((it) => canShowItem(it, group))
      .map((it) => ({ href: it.href, label: it.label, Icon: ICON_REGISTRY[it.icon] ?? DEFAULT_NAV_ICON }));
  };
```

(`isActive`/`allowedPages` kontrolleri buraya taşındı, `NAV_PERMISSION_BY_HREF`
lookup'ı yerine artık `item.permission` doğrudan config'ten okunuyor.)

- [ ] **Step 6: "Veri hazırlığı" bloğunu değiştir**

540-559. satırlardaki (bugünkü `bugunLinks`, `araclarLinks`, ...,
`yonetimTeknikLinks`, `bottomNavLinks`, `bottomNavHrefs`,
`drawerBugunLinks` tanımlarının olduğu blok) TAMAMINI şununla değiştirin:

```ts
  // Veri hazırlığı — artık DB'den gelen navConfig'ten türetiliyor
  const bugunLinks = getGroupItems("bugun");
  const araclarLinks = getGroupItems("araclar");
  const insanLinks = getGroupItems("insan");
  const rotaLinks = getGroupItems("rota");
  const finansLinks = getGroupItems("finans");
  const gorevlerLinks = getGroupItems("gorevler");
  const yonetimLinks = getGroupItems("yonetim");
  const yonetimTeknikLinks = getGroupItems("yonetim-teknik");

  const bottomNavLinks = filterByAllowed(BOTTOM_NAV);

  // Mobil "Daha Fazla" drawer — bottom nav'da olmayan tüm linkler
  const bottomNavHrefs = new Set(BOTTOM_NAV.map((l) => l.href));
  const drawerBugunLinks = bugunLinks.filter((l) => !bottomNavHrefs.has(l.href));
```

`BOTTOM_NAV` hâlâ sabit (kapsam dışı, Task planının Global Constraints
bölümünde belirtildiği gibi) — `filterByAllowed` fonksiyonu `BOTTOM_NAV`
için hâlâ gerekli, bu yüzden onu SİLMEYİN, sadece link gruplarının
kaynağı için kullanmayı bırakın:

```ts
  const filterByAllowed = <T extends { href: string }>(ls: T[]) =>
    ls.filter((l) => {
      const permission = NAV_PERMISSION_BY_HREF_FOR_BOTTOM_NAV[l.href];
      if (!permission) return role !== "personel";
      return hasPermission({ role: role as UserRole, permissions: (user as any)?.permissions }, permission);
    });
```

`BOTTOM_NAV`'ın kendi 4 linki için gereken izinleri (`dashboard:read`,
`arrivals:read`, `transfers:read`, `dashboard:read`) barındıran küçük,
sabit bir map ekleyin — `BOTTOM_NAV` sabitinin HEMEN ÜSTÜNE:

```ts
const NAV_PERMISSION_BY_HREF_FOR_BOTTOM_NAV: Record<string, string> = {
  "/": "dashboard:read",
  "/giris-kontrol": "arrivals:read",
  "/transferler": "transfers:read",
  "/gorevler": "dashboard:read",
};
```

- [ ] **Step 7: JSX'teki 7 sabit grup bloğunu tek bir `.map()` ile değiştir (masaüstü sidebar)**

656-730. satırlardaki (BUGÜN yorumundan YÖNETİM bloğunun kapanışına
kadar olan 7 ayrı grup JSX bloğu) TAMAMINI şununla değiştirin:

```tsx
          {([
            { key: "bugun", label: "Bugün", links: bugunLinks },
            { key: "araclar", label: "Araçlar", links: araclarLinks },
            { key: "insan", label: "İnsan", links: insanLinks },
            { key: "rota", label: "Rota", links: rotaLinks },
            { key: "finans", label: "Finans", links: finansLinks },
            { key: "gorevler", label: "Görevler", links: gorevlerLinks },
            { key: "yonetim", label: "Yönetim", links: yonetimLinks },
            { key: "yonetim-teknik", label: "Yönetim (Teknik)", links: yonetimTeknikLinks },
          ] as const).map((g, idx) => g.links.length > 0 && (
            <div key={g.key}>
              {idx === 0
                ? <GroupHeader label={g.label} groupKey={g.key} show={!collapsed} />
                : (collapsed ? <CollapsedDivider /> : <GroupHeader label={g.label} groupKey={g.key} show />)}
              {(collapsed || openGroups[g.key]) &&
                g.links.map((link) => <NavLink key={link.href} link={link} showLabel={!collapsed} />)
              }
            </div>
          ))}
```

(`idx === 0` kontrolü sadece "Bugün" grubunun ilk sırada olması ve
`GroupHeader`'ın `show={!collapsed}` almasını korumak için — diğer 7
grup bugünkü kodla birebir aynı şekilde `collapsed ? <CollapsedDivider/>
: <GroupHeader show />` deseniyle render ediliyor. "Teknik" alt-başlığı
artık ayrı bir grup olduğu için o özel `<p>Teknik</p>` etiketi kalkıyor
— bu, tasarımın kasıtlı sadeleştirme kararıyla tutarlı.)

- [ ] **Step 8: Mobil drawer'daki 7 sabit bloğu tek bir `.map()` ile değiştir**

829-903. satırlardaki (Bugün'den Yönetim'e kadar olan drawer içindeki 7
ayrı JSX bloğu, "Bugün" için `drawerBugunLinks` kullanan özel durum
dahil) TAMAMINI şununla değiştirin:

```tsx
              {([
                { key: "bugun", label: "Bugün", links: drawerBugunLinks },
                { key: "araclar", label: "Araçlar", links: araclarLinks },
                { key: "insan", label: "İnsan", links: insanLinks },
                { key: "rota", label: "Rota", links: rotaLinks },
                { key: "finans", label: "Finans", links: finansLinks },
                { key: "gorevler", label: "Görevler", links: gorevlerLinks },
                { key: "yonetim", label: "Yönetim", links: yonetimLinks },
                { key: "yonetim-teknik", label: "Yönetim (Teknik)", links: yonetimTeknikLinks },
              ] as const).map((g) => g.links.length > 0 && (
                <div key={g.key}>
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-2.5 pt-4 pb-1.5">{g.label}</p>
                  {g.links.map((link) => (
                    <NavLink key={link.href} link={link} showLabel onClick={() => setMobileOpen(false)} />
                  ))}
                </div>
              ))}
```

- [ ] **Step 9: Tip kontrolü**

```bash
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops && node node_modules/typescript/bin/tsc --noEmit
```
Beklenen: sıfır hata.

- [ ] **Step 10: Canlı doğrulama — davranış hiç değişmemiş olmalı**

Gerçek `admin1`/`admin1` girişiyle tarayıcıda (veya Playwright ile) her
sayfayı ziyaret edip sidebar'ın bugünküyle BİREBİR AYNI göründüğünü
doğrulayın: 8 grup (Yönetim Teknik artık kendi başlığıyla ayrı bir
bölüm), her grubun aynı linkleri, aynı sırada. Ayrıca `personel` ve
`yetkili` rollerinden birer test kullanıcısıyla (varsa) giriş yapıp
Araçlar/İnsan/Rota gruplarının yetkili+ için hâlâ göründüğünü, personel
için hâlâ gizli olduğunu doğrulayın (bu, Task'ın en kritik regresyon
riskiydi — `minRole:"yetkili"` düzeltmesinin doğru çalıştığının kanıtı).

- [ ] **Step 11: Commit**

```bash
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops
git add components/Nav.tsx
git commit -m "Nav config: Nav.tsx artık DB'den config çekip render ediyor"
```

---

### Task 7: Admin sayfası — `/admin/nav-yapisi`

**Files:**
- Create: `app/admin/nav-yapisi/page.tsx`

**Interfaces:**
- Consumes: `GET/PUT /api/admin/nav-config`, `GET
  /api/admin/permissions/catalog` (Task 5), `ICON_REGISTRY`,
  `NAV_ICON_NAMES` (Task 4), `NavConfigType` (Task 3).
- Produces: bağımsız sayfa, başka task tarafından tüketilmiyor.

- [ ] **Step 1: Sayfayı yaz**

Bu sayfa native HTML5 drag-and-drop (`draggable`, `onDragStart`,
`onDragOver`, `onDrop`) kullanır — bu depoda başka bir sürükle-bırak
kütüphanesi yok, harici bağımlılık eklemekten kaçınmak için native API
yeterli (grup/link sayısı onlarca, performans sorunu olmaz).

```tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { toast } from "@/lib/toast";
import { hasPermission } from "@/lib/permissions";
import { ICON_REGISTRY, NAV_ICON_NAMES } from "@/lib/nav-icons";
import { v4 as uuidv4 } from "uuid";
import type {
  NavConfigType as NavConfig,
  NavGroupType as NavGroup,
  NavConfigItemType as NavItem,
} from "@/lib/schemas";

const MIN_ROLE_LABELS: Record<string, string> = { "": "Herkes", yetkili: "Yetkili+", admin: "Admin" };

export default function NavYapisiPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [config, setConfig] = useState<NavConfig | null>(null);
  const [permissionCatalog, setPermissionCatalog] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragItem, setDragItem] = useState<{ groupKey: string; itemId: string } | null>(null);
  const [dragGroupKey, setDragGroupKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d.ok) setUser(d.data); else router.replace("/login");
    });
    fetch("/api/admin/nav-config").then((r) => r.json()).then((d) => { if (d.ok) setConfig(d.data); });
    fetch("/api/admin/permissions/catalog").then((r) => r.json()).then((d) => { if (d.ok) setPermissionCatalog(d.data); });
  }, []);

  const canEdit = hasPermission(user, "nav_config:update");

  function updateConfig(mutator: (c: NavConfig) => NavConfig) {
    setConfig((prev) => (prev ? mutator(structuredClone(prev)) : prev));
  }

  function toggleGroupActive(groupKey: string) {
    updateConfig((c) => {
      const g = c.groups.find((x) => x.key === groupKey);
      if (g) g.isActive = !g.isActive;
      return c;
    });
  }

  function toggleItemActive(groupKey: string, itemId: string) {
    updateConfig((c) => {
      const g = c.groups.find((x) => x.key === groupKey);
      const it = g?.items.find((x) => x.id === itemId);
      if (it) it.isActive = !it.isActive;
      return c;
    });
  }

  function deleteItem(groupKey: string, itemId: string) {
    if (!window.confirm("Bu link silinsin mi?")) return;
    updateConfig((c) => {
      const g = c.groups.find((x) => x.key === groupKey);
      if (g) g.items = g.items.filter((x) => x.id !== itemId);
      return c;
    });
  }

  function addGroup() {
    const label = window.prompt("Yeni grup adı:");
    if (!label?.trim()) return;
    updateConfig((c) => {
      c.groups.push({
        key: uuidv4(), label: label.trim(),
        sortOrder: c.groups.length, isActive: true, minRole: null, items: [],
      });
      return c;
    });
  }

  function addItem(groupKey: string) {
    const href = window.prompt("Link adresi (örn. /finans/ozel-rapor):");
    if (!href?.trim()) return;
    const label = window.prompt("Görünen ad:");
    if (!label?.trim()) return;
    updateConfig((c) => {
      const g = c.groups.find((x) => x.key === groupKey);
      if (!g) return c;
      g.items.push({
        id: uuidv4(), href: href.trim(), label: label.trim(),
        icon: NAV_ICON_NAMES[0], permission: permissionCatalog[0] || "dashboard:read",
        isActive: true, sortOrder: g.items.length, isCustom: true,
      });
      return c;
    });
  }

  function updateItemField(groupKey: string, itemId: string, field: "icon" | "permission" | "label" | "href", value: string) {
    updateConfig((c) => {
      const g = c.groups.find((x) => x.key === groupKey);
      const it = g?.items.find((x) => x.id === itemId);
      if (it) (it as any)[field] = value;
      return c;
    });
  }

  function updateItemMinRole(groupKey: string, itemId: string, value: string) {
    updateConfig((c) => {
      const g = c.groups.find((x) => x.key === groupKey);
      const it = g?.items.find((x) => x.id === itemId);
      if (it) it.minRole = value === "" ? null : (value as "yetkili" | "admin");
      return c;
    });
  }

  function updateGroupMinRole(groupKey: string, value: string) {
    updateConfig((c) => {
      const g = c.groups.find((x) => x.key === groupKey);
      if (g) g.minRole = value === "" ? null : (value as "yetkili" | "admin");
      return c;
    });
  }

  function onDropItem(targetGroupKey: string, targetItemId: string | null) {
    if (!dragItem) return;
    updateConfig((c) => {
      const sourceGroup = c.groups.find((x) => x.key === dragItem.groupKey);
      const item = sourceGroup?.items.find((x) => x.id === dragItem.itemId);
      if (!sourceGroup || !item) return c;
      sourceGroup.items = sourceGroup.items.filter((x) => x.id !== dragItem.itemId);

      const targetGroup = c.groups.find((x) => x.key === targetGroupKey);
      if (!targetGroup) return c;
      const targetIndex = targetItemId ? targetGroup.items.findIndex((x) => x.id === targetItemId) : targetGroup.items.length;
      targetGroup.items.splice(targetIndex < 0 ? targetGroup.items.length : targetIndex, 0, item);

      for (const g of c.groups) g.items.forEach((it, i) => { it.sortOrder = i; });
      return c;
    });
    setDragItem(null);
  }

  function onDropGroup(targetGroupKey: string) {
    if (!dragGroupKey || dragGroupKey === targetGroupKey) { setDragGroupKey(null); return; }
    updateConfig((c) => {
      const fromIdx = c.groups.findIndex((g) => g.key === dragGroupKey);
      const toIdx = c.groups.findIndex((g) => g.key === targetGroupKey);
      if (fromIdx < 0 || toIdx < 0) return c;
      const [moved] = c.groups.splice(fromIdx, 1);
      c.groups.splice(toIdx, 0, moved);
      c.groups.forEach((g, i) => { g.sortOrder = i; });
      return c;
    });
    setDragGroupKey(null);
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/nav-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const d = await res.json();
      if (!d.ok) { toast.error(typeof d.error === "string" ? d.error : "Kaydetme başarısız"); return; }
      toast.success("Nav yapısı kaydedildi");
    } finally { setSaving(false); }
  }

  if (!canEdit) {
    return (
      <>
        <Nav user={user} />
        <div className="min-h-screen bg-zinc-950 pt-16 flex items-center justify-center">
          <p className="text-zinc-500">Bu sayfaya erişim yetkiniz yok.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav user={user} />
      <div className="min-h-screen bg-zinc-950 pt-16">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Nav Yapısı</h1>
              <p className="text-zinc-500 text-sm mt-0.5">Sidebar grup ve linklerini düzenle</p>
            </div>
            <div className="flex gap-2">
              <button onClick={addGroup} className="bg-zinc-800 text-zinc-200 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-700 transition-colors">
                + Grup Ekle
              </button>
              <button onClick={save} disabled={saving || !config} className="bg-white text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>

          {!config ? (
            <div className="text-center py-16 text-zinc-600">Yükleniyor...</div>
          ) : (
            <div className="space-y-3">
              {[...config.groups].sort((a, b) => a.sortOrder - b.sortOrder).map((group) => (
                <div
                  key={group.key}
                  draggable
                  onDragStart={() => setDragGroupKey(group.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropGroup(group.key)}
                  className={`bg-zinc-900 border rounded-xl overflow-hidden ${group.isActive ? "border-zinc-800" : "border-zinc-800 opacity-50"}`}
                >
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 cursor-move">
                    <input
                      type="text"
                      value={group.label}
                      onChange={(e) => updateConfig((c) => { const g = c.groups.find((x) => x.key === group.key); if (g) g.label = e.target.value; return c; })}
                      className="bg-transparent text-white font-semibold text-sm focus:outline-none focus:bg-zinc-800 rounded px-1 flex-1"
                    />
                    <select
                      value={group.minRole || ""}
                      onChange={(e) => updateGroupMinRole(group.key, e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-2 py-1 rounded-lg focus:outline-none"
                    >
                      {Object.entries(MIN_ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <input type="checkbox" checked={group.isActive} onChange={() => toggleGroupActive(group.key)} />
                      Aktif
                    </label>
                    <button onClick={() => addItem(group.key)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors whitespace-nowrap">
                      + Link
                    </button>
                  </div>

                  <div className="divide-y divide-zinc-800/60">
                    {[...group.items].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => {
                      const ItemIcon = ICON_REGISTRY[item.icon];
                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={() => setDragItem({ groupKey: group.key, itemId: item.id })}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => { e.stopPropagation(); onDropItem(group.key, item.id); }}
                          className={`flex items-center gap-2 px-4 py-2.5 cursor-move ${item.isActive ? "" : "opacity-40"}`}
                        >
                          {ItemIcon && <ItemIcon size={16} className="text-zinc-500 shrink-0" />}
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) => updateItemField(group.key, item.id, "label", e.target.value)}
                            className="bg-transparent text-zinc-200 text-sm focus:outline-none focus:bg-zinc-800 rounded px-1 flex-1 min-w-0"
                          />
                          <input
                            type="text"
                            value={item.href}
                            onChange={(e) => updateItemField(group.key, item.id, "href", e.target.value)}
                            className="bg-zinc-800/60 text-zinc-500 text-xs px-2 py-1 rounded-lg focus:outline-none w-40 shrink-0"
                          />
                          <select
                            value={item.icon}
                            onChange={(e) => updateItemField(group.key, item.id, "icon", e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-1.5 py-1 rounded-lg focus:outline-none w-32 shrink-0"
                          >
                            {NAV_ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                          <select
                            value={item.permission}
                            onChange={(e) => updateItemField(group.key, item.id, "permission", e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-1.5 py-1 rounded-lg focus:outline-none w-40 shrink-0"
                          >
                            {permissionCatalog.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <select
                            value={item.minRole || ""}
                            onChange={(e) => updateItemMinRole(group.key, item.id, e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-1.5 py-1 rounded-lg focus:outline-none w-24 shrink-0"
                          >
                            <option value="">Grup varsayılanı</option>
                            <option value="yetkili">Yetkili+</option>
                            <option value="admin">Admin</option>
                          </select>
                          {item.isCustom && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 shrink-0">özel</span>}
                          <label className="flex items-center shrink-0">
                            <input type="checkbox" checked={item.isActive} onChange={() => toggleItemActive(group.key, item.id)} />
                          </label>
                          <button onClick={() => deleteItem(group.key, item.id)} className="text-xs text-red-400 hover:text-red-300 shrink-0">Sil</button>
                        </div>
                      );
                    })}
                    {group.items.length === 0 && (
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDropItem(group.key, null)}
                        className="px-4 py-6 text-center text-zinc-700 text-xs"
                      >
                        Link yok (buraya sürükleyebilirsiniz)
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Tip kontrolü**

```bash
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops && node node_modules/typescript/bin/tsc --noEmit
```

- [ ] **Step 3: Canlı doğrulama**

Gerçek `admin1`/`admin1` girişiyle `/admin/nav-yapisi`'ni ziyaret edin:
(1) bir linki "Aktif" checkbox'ından kapatın, Kaydet'e basın, sidebar'da
o linkin kaybolduğunu doğrulayın; (2) "Finans" grubuna "+ Link" ile yeni
bir özel link ekleyin (href: `/finans/test-link`, ad: `Test Link`),
Kaydet, sidebar'da göründüğünü ve tıklanabildiğini doğrulayın (sonra
temizlik için silin); (3) bir grubu sürükleyip sırasını değiştirin,
Kaydet, sidebar'da yeni sırayı doğrulayın.

- [ ] **Step 4: Commit**

```bash
cd /Users/kayraisbilir/Documents/tasinios/aycanops/aycanops
git add app/admin/nav-yapisi
git commit -m "Nav config: /admin/nav-yapisi düzenleme sayfası"
```

---

### Task 8: Uçtan uca smoke test

**Files:** yok (sadece doğrulama)

- [ ] **Step 1:** `node node_modules/typescript/bin/tsc --noEmit` son kez
  çalıştır, sıfır hata olmalı.
- [ ] **Step 2:** Gerçek `admin1` girişiyle `/` üzerinden başlayarak
  sidebar'daki HER linke tıklayıp 200 döndüğünü ve konsol hatası
  olmadığını doğrula (bu, `DEFAULT_NAV_CONFIG` ile DB'den gelen config
  arasında bir tutarsızlık olup olmadığını da dolaylı olarak test eder).
- [ ] **Step 3:** `/admin/nav-yapisi`'ni ziyaret et, bir grubu kapat
  (isActive=false), Kaydet, sidebar'dan tüm grubun (linkleriyle
  birlikte) kaybolduğunu doğrula, sonra geri aç.
- [ ] **Step 4:** DB'de `nav_config` satırını geçici olarak sil
  (`DELETE FROM nav_config WHERE id='singleton'`), sayfayı yenile,
  sidebar'ın `DEFAULT_NAV_CONFIG` fallback'iyle DOLU göründüğünü (boş
  KALMADIĞINI) doğrula, sonra Task 1'in migration'ını tekrar çalıştırarak
  ya da elle aynı `INSERT`i tekrar atarak seed'i geri yükle.
- [ ] **Step 5:** `personel` rolünden bir kullanıcıyla giriş yap (varsa),
  Araçlar/İnsan/Rota gruplarının GÖRÜNMEDİĞİNİ doğrula (minRole:"yetkili"
  düzeltmesinin regresyon yaratmadığının son kanıtı).
- [ ] **Step 6:** `admin` olmayan bir rolle `/admin/nav-yapisi`'ne
  gitmeyi dene, "Bu sayfaya erişim yetkiniz yok" mesajının göründüğünü
  doğrula.
