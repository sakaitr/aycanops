# OpsDesk - Operasyon Yönetim Sistemi

Production-ready Next.js operasyon yönetim uygulaması. Türkçe arayüz, MySQL veritabanı, rol tabanlı yetkilendirme, worklog/todo/ticket modülleri ve raporlama özellikleri.

## Teknolojiler

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js Route Handlers (API Routes)
- **Veritabanı**: MySQL (mysql2)
- **Validasyon**: Zod
- **Kimlik Doğrulama**: Oturum tabanlı (bcryptjs, httpOnly cookie)
- **Diğer**: uuid, date-fns, clsx

## Kurulum

### 1. Bağımlılıkları Yükle

```bash
npm install
```

### 2. Ortam Değişkenlerini Ayarla

`.env.local` dosyası oluştur (bkz. `.env.example`):

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=opsdesk
DB_PASS=guclu-bir-sifre
DB_NAME=opsdesk
SESSION_TTL_HOURS=168
COOKIE_NAME=opsdesk_session
COOKIE_SECURE=true
SEED_TOKEN=change-me-super-secret
NEXT_PUBLIC_APP_URL=https://ops.aycanturizm.com.tr
```

- `DB_HOST/PORT/USER/PASS/NAME`: MySQL bağlantı bilgileri
- `SESSION_TTL_HOURS`: Oturum süresi (saat cinsinden, varsayılan 168=7 gün)
- `COOKIE_SECURE`: HTTPS kullanılıyorsa `true`, localhost için `false`
- `SEED_TOKEN`: Seed endpoint için güvenlik tokeni (prodda değiştir!)
- `NEXT_PUBLIC_APP_URL`: Uygulama URL'i

### 3. Veritabanını Seed Et

Geliştirme ortamında:

```bash
npm run dev
```

Ardından:

```bash
curl -X POST http://localhost:3000/api/admin/seed -H "x-seed-token: change-me-super-secret"
```

Veya tarayıcıda aşağıdaki komutla:

```bash
Invoke-WebRequest -Uri http://localhost:3000/api/admin/seed -Method POST -Headers @{"x-seed-token"="change-me-super-secret"}
```

Seed işlemi şunları oluşturur:
- **Genel** departmanı
- Worklog/ticket durumları (draft/submitted/returned/approved ve open/in_progress/waiting/solved/closed)
- Ticket/todo öncelikleri (P1/P2/P3, low/med/high)
- SLA kuralları (P1=120dk, P2=480dk, P3=2880dk)
- Kategoriler ve etiketler
- **admin** kullanıcısı (kullanıcı adı: `admin`, şifre: `admin123!`)

### 4. Giriş Yap

Tarayıcıda `http://localhost:3000` adresine git ve aşağıdaki bilgilerle giriş yap:

- **Kullanıcı Adı**: `admin`
- **Şifre**: `admin123!`

## Veritabanı Migrasyonları

Migrasyonlar `/migrations` klasöründe `.sql` dosyaları olarak saklanır. Uygulama ilk çalıştığında otomatik olarak henüz uygulanmamış migrasyonlar çalıştırılır.

- `001_init.sql`: Tüm tablolar
- `002_counters.sql`: Ticket numarası için sayaç tablosu

## Roller ve Yetkiler

- **personel**: Kendine atanmış görev/sorun görür, kendi günlüklerini oluşturur
- **yetkili**: Tüm sorunları görür, yeni sorun oluşturabilir, atama yapabilir
- **yonetici**: Worklog onayı, raporlar ve yönetim modüllerine erişim
- **admin**: Kullanıcı yönetimi dahil tüm yetkilere sahip

## Modüller

### Günlük İşler (Worklog)
- Her kullanıcı için günlük bazlı çalışma logları
- Durum akışı: `draft` → `submitted` → (`returned` | `approved`)
- Yönetici onayı gerekli
- İade durumundan tekrar gönderilebilir

### Görevler (Todos)
- Todo oluşturma, atama, durum takibi
- Toplu atama (departman, rol, kullanıcı listesi)
- Şablonlar ile hızlı görev oluşturma
- Yorumlar

### Sorunlar (Tickets)
- Otomatik ticket numarası (OPS-XXXXXX formatında)
- SLA kuralları (öncelik bazlı otomatik süre hesaplama)
- Durum akışı: `open` → `in_progress` → `waiting` → `solved` → `closed`
- Aksiyonlar checklist
- Worklog'a aktar özelliği
- Yorumlar

### Raporlar
- Worklog raporu (kullanıcı bazlı ve kategori dağılımı)
- Todo raporu (tamamlanma oranları, gecikme analizi)
- Ticket raporu (durum özeti, çözüm süreleri, SLA ihlalleri)
- CSV export

### Yönetim
- Departman, kategori, etiket, öncelik, durum yönetimi
- SLA kural tanımlama
- Şablon yönetimi
- Kullanıcı yönetimi (admin)

## SQLite Yedekleme

Uygulama çalışmıyorken:

```bash
copy data\opsdesk.sqlite data\opsdesk_backup_20260206.sqlite
```

Veya çalışma sırasında WAL modunda güvenli kopyalama:

```bash
sqlite3 data\opsdesk.sqlite ".backup data\opsdesk_backup.sqlite"
```

## Dağıtım (Deployment)

### Production Ortamı

1. `.env.local` dosyasında güvenlik ayarları:

```env
COOKIE_SECURE=true
SEED_TOKEN=<güçlü-random-token>
SESSION_TTL_HOURS=24
```

2. Build ve çalıştır:

```bash
npm run build
npm run start
```

3. HTTPS arkasında çalıştırın (nginx, cloudflare, vb.)

### Veritabanı Dikkat Noktaları

- SQLite dosya tabanlıdır, disk yoluna yazma izni gereklidir
- Üretim ortamında `data/` klasörünün fiziksel olarak mevcut olduğundan emin olun
- WAL modu kullanılır (daha iyi concurrency)
- Foreign keys varsayılan olarak açıktır

## Sorun Giderme

### Migrations Çalışmıyor
- `/migrations` klasörünün varlığını kontrol edin
- Veritabanı dosyasına yazma izni var mı?
- Log çıktısını inceleyin

### DB Locked Hatası
- Birden fazla instance çalışıyor olabilir
- WAL dosyalarını temizleyin: `.opsdesk.sqlite-wal`, `.opsdesk.sqlite-shm`

### Kimlik Doğrulama Problemleri
- Cookie ayarları doğru mu?
- `COOKIE_SECURE=false` (geliştirme), `true` (üretim HTTPS)
- Tarayıcı çerezlerini temizleyin

## Geliştirme Notları

### API Route Yapısı

Tüm API route'ları `/app/api` altında Route Handlers olarak tanımlıdır. JSON formatında `{ok, data?, error?}` döner.

### Middleware

`middleware.ts` dosyası tüm protected route'ları korur, oturum doğrulaması ve rol kontrolü yapar.

### Kod Yapısı

- `/lib`: Yardımcı fonksiyonlar (db, auth, permissions, validators, audit, time, csv, ticketNo)
- `/migrations`: SQL migration dosyaları
- `/app/api`: API Route Handlers
- `/app`: UI sayfaları (App Router)
- `/components`: Paylaşımlı React bileşenleri

## Lisans

Bu proje özel bir proje olarak geliştirilmiştir.

---

## Geliştirme Tamamlanması İçin Gerekenler

Bu proje **temel altyapı complete**, ancak aşağıdaki UI sayfaları placeholder olarak bırakılmıştır:

- [x] Dashboard (tamamlandı)
- [x] Login (tamamlandı)
- [x] Temel componentler (Badge, EmptyState, StatCard - tamamlandı)
- [ ] `/gunluk` sayfaları (liste ve detay) - API hazır, UI eklenmeli
- [ ] `/gorevler` sayfaları (liste ve detay) - API hazır, UI eklenmeli
- [ ] `/sorunlar` sayfaları (liste ve detay) - API hazır, UI eklenmeli
- [ ] `/raporlar` sayfaları - API hazır, UI eklenmeli
- [ ] `/yonetim` modülü sayfaları - API hazır, UI eklenmeli

**Not**: API route'ları tamamen çalışır durumda, Postman/curl ile test edilebilir.

## API Test Örnekleri

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123!"}'

# Worklogs listele
curl http://localhost:3000/api/worklogs \
  -H "Cookie: opsdesk_session=<session_id>"

# Worklog oluştur
curl -X POST http://localhost:3000/api/worklogs \
  -H "Content-Type: application/json" \
  -H "Cookie: opsdesk_session=<session_id>" \
  -d '{"work_date":"2026-02-06","summary":"Test günlük"}'

# Ticket oluştur
curl -X POST http://localhost:3000/api/tickets \
  -H "Content-Type: application/json" \
  -H "Cookie: opsdesk_session=<session_id>" \
  -d '{"title":"Test sorun","priority_code":"P1"}'
```

---

**Hazırlayanlar**: AI-assisted development (Claude Sonnet 4.5)  
**Tarih**: 6 Şubat 2026
