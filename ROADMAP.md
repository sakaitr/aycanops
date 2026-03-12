# AycanOps — Offline-First PWA → Capacitor Native App

**Güncel Yığın:** Next.js 15 · React 19 · TypeScript · MySQL 8 · Tailwind CSS · Docker (VPS: 212.64.199.191 / aycanops.agno.digital)  
**Paket Durumu:** `dexie` ve `dexie-react-hooks` package.json'da zaten mevcut (henüz kullanılmıyor)  
**Son Güncelleme:** Mart 2026

---

## Mevcut Sistem Anatomisi

### Roller
- `admin` — tam erişim
- `yonetici` — departman yönetimi
- `yetkili` — atanmış şirket/sayfalara erişim (`allowed_pages`, `allowed_companies` JSON)
- `personel` — sadece kendi worklog'u

### Auth
- Cookie tabanlı session (`opsdesk_session`)
- `lib/auth.ts`: `getUserBySession()`, `requireUser()`, `createSession()`
- `lib/permissions.ts`: `isAtLeast()`, `canViewWorklog()`, `canViewTicket()`, `canViewTodo()`
- Rate limiting: 10 başarısız giriş / 5 dakika / IP (`lib/rate-limit.ts`)
- Bcryptjs hash

### Veritabanı Tabloları (Sync için kritik)
```
users, departments, sessions, rate_limits
companies, company_vehicles, vehicle_arrivals
vehicles, routes, trips
driver_evaluations, driver_records
inspections, entry_controls
worklogs, worklog_items
tickets, ticket_comments, ticket_actions
todos, todo_comments, todo_templates
config_* (categories, tags, priorities, statuses, sla_rules)
audit_log
```

### API Rotaları (toplam ~40+)
Tüm rotalar `lib/auth.ts::requireUser()` ile korumalı.  
Kritik rotalar: `/api/trips`, `/api/entry-controls`, `/api/worklogs`, `/api/companies`, `/api/vehicles`, `/api/routes`

### Mevcut PWA Durumu
- Manuel service worker: `public/sw.js` (CacheFirst static, NetworkFirst API/HTML)
- Manifest: `public/manifest.webmanifest`
- `components/PWARegister.tsx` — SW kaydı
- `components/OfflineBanner.tsx` — mevcut, ama offline'da veri yok

---

## Aşama 1 — Offline Veri Katmanı + Sync Engine

**Bağımlılık:** Yok. `dexie` zaten yüklü, hemen başlanır.

### 1.1 Dexie Şeması
**Yeni dosya:** `lib/db/schema.ts`

Offline'da öncelikli tablolar (Aşama 1 kapsamı):
```ts
// version 1
seferler:     "++id, tarih, rota_id, arac_id, durum, guncellendi_at"
araclar:      "++id, plaka, durum, guncellendi_at"
rotalar:      "++id, ad, kod, arac_id, guncellendi_at"
sirketler:    "++id, ad, aktif, guncellendi_at"
sirket_arac:  "++id, sirket_id, plaka, surucu, rota_adi, guncellendi_at"
giris_kont:   "++id, kontrol_tarihi, rota_id, planlanan, gerceklesen, guncellendi_at"
```

**Kural:** Her tabloda `guncellendi_at: number` (Unix ms timestamp) zorunlu.  
**Kural:** Şema değişikliğinde mutlaka `db.version(N+1)` bloğu açılır, zincir kırılmaz.

### 1.2 Sync Engine
**Yeni dosya:** `lib/db/sync.ts`

- `pull(since: number)`: `GET /api/sync?since={timestamp}` → sunucudan delta veri al → Dexie'ye yaz
- `push()`: Dexie'deki `dirty=true` kayıtları `POST /api/sync` ile sunucuya gönder
- **Conflict Resolution — Last Write Wins:**
  - `remote.guncellendi_at > local.guncellendi_at` → remote kazanır
  - `local.guncellendi_at >= remote.guncellendi_at` → local kazanır
- Son sync zamanı `localStorage.setItem("lastSync", timestamp)` ile saklanır

### 1.3 Offline Yazma Kuyruğu
**Yeni dosya:** `lib/db/queue.ts`

- Offline iken yapılan yazma → `sync_queue` Dexie tablosuna girer: `{ id, endpoint, method, body, timestamp }`
- Online olunca `Background Sync API` (SW üzerinden) tetikler → `push()` çalışır
- `public/sw.js` güncellenir: `sync` event listener eklenir

### 1.4 Yeni API Endpoint
**Yeni dosya:** `app/api/sync/route.ts`

- `GET /api/sync?since=&tables=` → Role göre filtrelenmiş delta kayıtlar
  - `personel`: sadece kendi worklog + atanmış seferler
  - `yetkili`: `allowed_companies` kapsamındaki veriler
  - `yonetici/admin`: tüm veriler
- `POST /api/sync` → dirty kayıtları MySQL'e yaz, `guncellendi_at` ile çakışma kontrolü
- Mevcut `lib/auth.ts::requireUser()` ile korunur

### 1.5 React Hook'ları
**Yeni dosya:** `hooks/useOfflineData.ts` — component'lar API yerine bu hook'u kullanır  
**Yeni dosya:** `hooks/useSyncStatus.ts` — `{ isOnline, lastSync, isSyncing, pendingCount }`

**Doğrulama:**
- Offline iken `/giris-kontrol` açılır (IndexedDB'den)
- Değişiklik yapılır, kuyruğa girer
- Online gelince sunucuya sync olur

---

## Aşama 2 — Güvenli Token Saklama (Capacitor öncesi hazırlık)

**Bağımlılık:** Aşama 1 tamamlanmış olmalı.

1. `@capacitor-community/secure-storage` kur — iOS Keychain / Android Keystore
2. Web'de: mevcut cookie sistemi korunur (değişmez)
3. Native'de: session token plain `localStorage`'a değil Secure Storage'a yazılır
4. `lib/auth-storage.ts` — platform tespiti yapan sarmalayıcı:
   - Web → cookie (değişmez)
   - Native → SecureStorage
5. JWT payload'ında rol zaten var (`role`, `allowed_pages`, `allowed_companies`) — yapı korunur

**Doğrulama:** Native build'de token native keychain'den okunur.

---

## Aşama 3 — SSE Gerçek Zamanlı Sync

**Bağımlılık:** Aşama 1 tamamlanmış olmalı.

**Yeni dosya:** `app/api/events/route.ts`
- Next.js Route Handler ile SSE
- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`
- Events: `{ type: "trip_updated"|"entry_updated"|"vehicle_updated", id, guncellendi_at }`

**Yeni dosya:** `hooks/useSSE.ts`
- Online iken EventSource bağlantısı açar
- Event alınca ilgili Dexie kaydını `pull(since)` ile günceller → UI reaktif yenilenir
- Offline'da EventSource otomatik kapanır, online gelince reconnect + full sync

**Doğrulama:** Dispatcher seferi değiştirince bağlı cihazlarda anında yansır.

---

## Aşama 4 — Capacitor Entegrasyonu

**Bağımlılık:** Aşama 1-2 tamamlanmış olmalı.

### 4.1 Paketler
```bash
npm install @capacitor/core @capacitor/ios @capacitor/android @capacitor/network @capacitor/preferences
```

### 4.2 Build Ayrımı
**Değişiklik:** `next.config.ts`
```ts
const isMobile = process.env.BUILD_TARGET === "mobile";
output: isMobile ? "export" : "standalone"
```

**Değişiklik:** `package.json` scripts:
```json
"build:web":    "next build",
"build:mobile": "cross-env BUILD_TARGET=mobile next build && npx cap sync"
```

### 4.3 Capacitor Kurulum
**Yeni dosya:** `capacitor.config.ts`
```ts
{
  appId: "com.aycanturizm.ops",
  appName: "Aycan Operasyon",
  webDir: "out",
  server: { url: "https://aycanops.agno.digital" }
}
```

```bash
npx cap add ios
npx cap add android
```

### 4.4 Network Plugin
`@capacitor/network` → `useSyncStatus.ts` içinde `Network.addListener("networkStatusChange")` kullanılır

**Doğrulama:** iOS Simulator ve Android Emulator'da açılır, VPS API'ye bağlanır.

---

## Aşama 5 — FCM Push Bildirim

**Bağımlılık:** Aşama 4 tamamlanmış, Firebase projesi oluşturulmuş olmalı.

### 5.1 Kurulum
```bash
npm install @capacitor/push-notifications
# VPS tarafı (server-only):
npm install firebase-admin
```

### 5.2 FCM Token Akışı
```
Cihaz açılır → FCM token alınır → POST /api/push/register { token, userId, platform }
MySQL: push_tokens tablosu (userId, token, platform, created_at)
```

**Yeni migration:** `migrations/017_push_tokens.sql`

### 5.3 Bildirim Göndericisi
**Yeni dosya:** `lib/push.ts` (server-only)
- `sendToUser(userId, { title, body, data })`
- `sendToRole(role, { title, body, data })`

### 5.4 İlk Bildirim Senaryoları
- Sefer güncellendi (rota/saat değişikliği) → atanmış araç sürücüsüne
- Sefer iptal → atanmış sürücüye
- Yeni todo atandı → kullanıcıya
- Yeni ticket açıldı → departmana

### 5.5 iOS APNs Gereksinimleri
- Apple Developer Account ($99/yıl) — zorunlu
- Xcode'da APNs sertifika oluşturma (tek seferlik)
- Firebase Console'a `.p8` key yükleme

**Doğrulama:** VPS'ten `lib/push.ts::sendToUser()` çağrısı → iOS ve Android'de bildirim görünür.

---

## Aşama 6 — OTA Canlı Güncelleme

**Bağımlılık:** Aşama 4-5 tamamlanmış olmalı.

1. `@capgo/capacitor-updater` kur (self-hosted seçeneği var)
2. VPS'e update server ekle (`/update` endpoint)
3. Deploy pipeline güncellenir:
   - Web: Docker build → push → VPS deploy (değişmez)
   - Mobile: `build:mobile` → update bundle → VPS update server'a yükle → cihazlar çeker
4. JS/CSS/asset değişiklikleri App Store review olmadan < 1 dakikada yayılır
5. **Sınır:** `capacitor.config.ts`, native plugin, izin değişikliklerinde Store review zorunlu

**Doğrulama:** `git push` sonrası cihaz uygulamayı yeniden açmadan güncellenir.

---

## Aşama 7 — Crash Reporting (Sentry)

**Bağımlılık:** Aşama 4 sonrası. Paralel kurulabilir.

```bash
npm install @sentry/nextjs @sentry/capacitor
```

- VPS'e self-hosted Sentry kur (Docker) VEYA sentry.io free tier (5K event/ay)
- `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Yakalananlar: JS hataları, native crash stack trace, sync hataları, unhandled promise rejection

**Doğrulama:** Kasıtlı hata throw → Sentry dashboard'da görünür.

---

## Aşama 8 — App Store / Play Store Yayın

**Bağımlılık:** Tüm aşamalar tamamlanmış, beta test geçilmiş.

### Android (Windows'ta yapılabilir)
1. Android Studio'da release keystore oluştur (bir kez)
2. `npx cap build android` → signed APK/AAB
3. Google Play Console ($25 tek seferlik) → internal test → production

### iOS (Mac veya CI gerekli)
1. Apple Developer Account ($99/yıl)
2. Mac yoksa → GitHub Actions `macos-latest` runner:
   - `.github/workflows/ios-build.yml`
   - Adımlar: checkout → setup Node → build:mobile → xcode-build → TestFlight upload
3. TestFlight beta → App Store review → yayın

### Store Varlıkları
- App icon: tüm boyutlar (1024x1024 kaynak, Capacitor otomatik resize)
- Screenshots: iPhone 6.9", iPad (App Store zorunlu)
- Açıklama metni (TR + EN)

---

## Tüm Yeni Dosyalar

| Dosya | Aşama | Açıklama |
|---|---|---|
| `lib/db/schema.ts` | 1 | Dexie şema + version chain |
| `lib/db/sync.ts` | 1 | Pull/push + LWW conflict |
| `lib/db/queue.ts` | 1 | Offline yazma kuyruğu |
| `hooks/useOfflineData.ts` | 1 | Component veri hook'u |
| `hooks/useSyncStatus.ts` | 1 | Bağlantı + sync durumu |
| `app/api/sync/route.ts` | 1 | Delta sync endpoint |
| `lib/auth-storage.ts` | 2 | Platform-aware token storage |
| `app/api/events/route.ts` | 3 | SSE stream endpoint |
| `hooks/useSSE.ts` | 3 | SSE client hook |
| `capacitor.config.ts` | 4 | Capacitor konfigürasyon |
| `lib/push.ts` | 5 | FCM gönderici (server-only) |
| `migrations/017_push_tokens.sql` | 5 | push_tokens tablosu |
| `sentry.client.config.ts` | 7 | Sentry client config |
| `sentry.server.config.ts` | 7 | Sentry server config |
| `sentry.edge.config.ts` | 7 | Sentry edge config |
| `.github/workflows/ios-build.yml` | 8 | iOS CI build |

## Değiştirilen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `next.config.ts` | BUILD_TARGET ile standalone/export split |
| `package.json` | build:web, build:mobile scriptleri + yeni deps |
| `public/sw.js` | Background Sync event listener eklenir |
| `components/OfflineBanner.tsx` | sync durumu + bekleyen kayıt sayısı gösterilir |

---

## Zaman Çizelgesi

| Dönem | Aşama | Çıktı |
|---|---|---|
| Mart 2026 | 1 + 2 | Offline veri + güvenli token |
| Nisan 2026 | 3 + 4 | SSE realtime + Capacitor build |
| Nisan-Mayıs | 5 + 7 | FCM bildirim + Sentry |
| Mayıs 2026 | 6 | OTA update + beta test |
| Haziran 2026 | 8 | App Store + Play Store yayın |

---

## Teknik Kısıtlar / Notlar

- `output: "standalone"` Docker için korunur — sadece mobile build `export` olur
- iOS bildirim için **Apple Developer Account zorunlu** (APNs)
- iOS Build için **Mac veya GitHub Actions macos runner** gerekli
- Mevcut cookie-based auth web'de değişmez — Capacitor'da Secure Storage'a taşınır
- `lib/permissions.ts` yapısı korunur — sync endpoint'lerine rol filtresi eklenir
- `audit_log` tablosu offline işlemler için de yazılır (sync sırasında)
