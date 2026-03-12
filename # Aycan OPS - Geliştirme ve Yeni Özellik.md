# Aycan OPS - Geliştirme ve Yeni Özellik Önerileri
## Kapsamlı Yol Haritası

Bu doküman, Aycan Operasyon Yönetim Sistemi'nin mevcut durumu analiz edilerek hazırlanmış geliştirme önerilerini içerir. Her öneri için neden gerekli olduğu, nasıl uygulanacağı ve beklenen faydalar detaylı şekilde açıklanmıştır.

---

# 🚀 ÖNCELİK 1: KRİTİK GELİŞTİRMELER

## 1.1 Canlı Araç Takip Sistemi (GPS Entegrasyonu)

### Neden Gerekli?
- Şu an sistemde 1208+ araç var ancak anlık konum bilgisi yok
- Müşteri firmaları "Servis nerede?" sorusuna cevap verilemiyor
- Gecikme ve rota sapmaları tespit edilemiyor
- Seferlerin gerçekleşip gerçekleşmediği manuel takip ediliyor

### Nasıl Yapılır?

```
┌─────────────────────────────────────────────────────────────────┐
│                    GPS ENTEGRASYON MİMARİSİ                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐     ┌──────────────┐     ┌──────────────────┐    │
│  │ GPS      │────▶│ API Gateway  │────▶│ Location Service │    │
│  │ Cihazlar │     │ (WebSocket)  │     │ (Redis + PG)     │    │
│  └──────────┘     └──────────────┘     └──────────────────┘    │
│       │                                        │                │
│       │           ┌──────────────┐             │                │
│       └──────────▶│ Şoför Mobil  │◀────────────┘                │
│                   │ Uygulaması   │                              │
│                   └──────────────┘                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Teknik Adımlar:**

1. **GPS Cihaz Entegrasyonu**
   - Mevcut araçlardaki GPS cihazlarından veri çekme (Teltonika, Ruptela vb.)
   - MQTT veya TCP/IP üzerinden konum verisi alma
   - Saniyede 1 konum güncellemesi

2. **Backend Geliştirme**
   ```typescript
   // Yeni API endpoint'leri
   GET  /api/vehicles/:id/location      // Anlık konum
   GET  /api/vehicles/:id/history       // Geçmiş rotalar
   WS   /ws/tracking                    // Canlı takip
   POST /api/geofence                   // Sanal sınır tanımlama
   ```

3. **Veritabanı**
   ```sql
   -- Yeni tablolar
   CREATE TABLE vehicle_locations (
     id UUID PRIMARY KEY,
     vehicle_id UUID REFERENCES vehicles(id),
     latitude DECIMAL(10, 8),
     longitude DECIMAL(11, 8),
     speed INTEGER,
     heading INTEGER,
     recorded_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   CREATE TABLE geofences (
     id UUID PRIMARY KEY,
     name VARCHAR(100),
     company_id UUID,
     polygon JSONB,  -- GeoJSON
     alert_on_enter BOOLEAN,
     alert_on_exit BOOLEAN
   );
   ```

4. **Frontend - Harita Komponenti**
   - Leaflet veya Mapbox entegrasyonu
   - Gerçek zamanlı araç ikonları
   - Kümeleme (clustering) büyük filolar için
   - Rota geçmişi gösterimi

### Beklenen Faydalar
- Müşteri memnuniyetinde %40 artış
- Gecikme şikayetlerinde %60 azalma
- Yakıt tüketiminde %15 tasarruf (rota optimizasyonu ile)
- Manuel takip süresinde %80 azalma

### Tahmini Süre: 6-8 hafta

---

## 1.2 Mobil Şoför Uygulaması

### Neden Gerekli?
- Şoförler sisteme sadece web üzerinden erişebiliyor
- Sefer başlangıç/bitiş bildirimi yapılamıyor
- Yolcu sayısı manuel raporlanıyor
- Acil durum bildirimi mekanizması yok

### Nasıl Yapılır?

**Uygulama Özellikleri:**

```
┌─────────────────────────────────────────────┐
│           ŞOFÖR MOBİL UYGULAMASI            │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  📍 Günlük Görevlerim               │    │
│  │  ├── 07:30 - Firma A (Pendik)       │    │
│  │  │   └── [Seferi Başlat]            │    │
│  │  ├── 08:45 - Firma B (Gebze)        │    │
│  │  └── 17:00 - Dönüş Seferi           │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  🚨 Acil Durum Butonu               │    │
│  │  [        ACİL DURUM          ]     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  ✅ Araç Kontrol Formu              │    │
│  │  • Lastikler ☑                      │    │
│  │  • Farlar ☑                         │    │
│  │  • Frenler ☑                        │    │
│  │  [Fotoğraf Çek] [Onayla]            │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

**Teknik Adımlar:**

1. **React Native veya Flutter ile Geliştirme**
   ```
   /src
   ├── screens/
   │   ├── LoginScreen.tsx
   │   ├── DashboardScreen.tsx
   │   ├── TripScreen.tsx
   │   ├── ChecklistScreen.tsx
   │   └── EmergencyScreen.tsx
   ├── services/
   │   ├── LocationService.ts
   │   ├── NotificationService.ts
   │   └── OfflineStorage.ts
   └── components/
       ├── TripCard.tsx
       └── ChecklistItem.tsx
   ```

2. **Offline-First Mimari**
   - SQLite ile yerel veri saklama
   - Bağlantı geldiğinde otomatik senkronizasyon
   - Çevrimdışı form doldurma

3. **Backend API Genişletme**
   ```typescript
   // Şoför API'leri
   GET  /api/driver/trips/today          // Günlük seferler
   POST /api/driver/trips/:id/start      // Sefer başlat
   POST /api/driver/trips/:id/complete   // Sefer bitir
   POST /api/driver/checklist            // Kontrol formu gönder
   POST /api/driver/emergency            // Acil durum bildirimi
   POST /api/driver/location             // Konum gönder
   ```

4. **Push Notification Entegrasyonu**
   - Firebase Cloud Messaging (FCM)
   - Sefer hatırlatmaları
   - Rota değişikliği bildirimleri

### Beklenen Faydalar
- Sefer takibinde %100 dijitalleşme
- Günlük kontrol formlarının anlık alınması
- Şoför-ofis iletişiminde iyileşme
- Acil durumlarda hızlı müdahale

### Tahmini Süre: 8-10 hafta

---

## 1.3 Müşteri Portalı

### Neden Gerekli?
- 86+ firma müşterisi var ancak kendi verilerine erişemiyor
- Servis şikayetleri telefon/e-posta ile geliyor
- Fatura ve raporlar manuel gönderiliyor
- Müşteri self-servis yapamıyor

### Nasıl Yapılır?

**Portal Özellikleri:**

```
┌────────────────────────────────────────────────────────────────┐
│                    MÜŞTERİ PORTALI                             │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Hoş geldiniz, STER KOLTUK SİSTEMLERİ                         │
│                                                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │ 12 Araç     │ │ 3 Güzergah   │ │ 245 Personel │           │
│  │ Aktif       │ │ Tanımlı      │ │ Taşınıyor    │           │
│  └──────────────┘ └──────────────┘ └──────────────┘           │
│                                                                │
│  📍 Canlı Servis Takibi                                       │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  [HARİTA - Araçların anlık konumları]                │     │
│  │  🚐 34LAC101 - 5 dk sonra varış                      │     │
│  │  🚐 34LAD956 - Firmada                               │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                │
│  📋 Son Seferler                    📊 Aylık Rapor           │
│  ├── Bugün: 24 sefer tamamlandı     [İndir PDF]              │
│  ├── Gecikme: 2 sefer               [İndir Excel]            │
│  └── Zamanında: %92                                           │
│                                                                │
│  💬 Destek Talebi Oluştur                                     │
│  [Yeni Talep]  [Taleplerim (2 Açık)]                          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Teknik Adımlar:**

1. **Yeni Rol ve Yetki Sistemi**
   ```typescript
   // Rol tanımları
   enum UserRole {
     ADMIN = 'admin',
     STAFF = 'staff',
     DRIVER = 'driver',
     CUSTOMER = 'customer',  // YENİ
   }
   
   // Müşteri yetkileri
   const customerPermissions = [
     'view:own_vehicles',
     'view:own_trips',
     'view:own_reports',
     'create:support_ticket',
     'view:live_tracking',
   ];
   ```

2. **Veritabanı Genişletme**
   ```sql
   -- Müşteri kullanıcıları
   CREATE TABLE customer_users (
     id UUID PRIMARY KEY,
     company_id UUID REFERENCES companies(id),
     email VARCHAR(255) UNIQUE,
     password_hash VARCHAR(255),
     name VARCHAR(100),
     role VARCHAR(20), -- 'admin', 'viewer'
     is_active BOOLEAN DEFAULT true,
     last_login TIMESTAMPTZ
   );
   
   -- Destek talepleri
   CREATE TABLE support_tickets (
     id UUID PRIMARY KEY,
     company_id UUID REFERENCES companies(id),
     created_by UUID REFERENCES customer_users(id),
     subject VARCHAR(200),
     description TEXT,
     status VARCHAR(20), -- 'open', 'in_progress', 'resolved', 'closed'
     priority VARCHAR(10),
     assigned_to UUID REFERENCES users(id),
     created_at TIMESTAMPTZ,
     updated_at TIMESTAMPTZ
   );
   ```

3. **Ayrı Subdomain veya Route**
   ```
   portal.aycanops.agno.digital
   veya
   aycanops.agno.digital/portal
   ```

4. **Otomatik Rapor Gönderimi**
   - Haftalık/aylık otomatik e-posta raporları
   - PDF ve Excel formatında indirme
   - Özelleştirilebilir rapor şablonları

### Beklenen Faydalar
- Müşteri memnuniyetinde %50 artış
- Telefon/e-posta trafiğinde %70 azalma
- Şeffaflık ve güven artışı
- Self-servis ile operasyonel yük azalması

### Tahmini Süre: 6-8 hafta

---

# 📊 ÖNCELİK 2: OPERASYONEL İYİLEŞTİRMELER

## 2.1 Akıllı Rota Optimizasyonu

### Neden Gerekli?
- Şu an 4 güzergah tanımlı, ancak optimizasyon yok
- Yakıt maliyetleri kontrol edilemiyor
- Trafik durumuna göre rota güncellenmiyor
- Yolcu toplama sırası manuel belirleniyor

### Nasıl Yapılır?

```
┌─────────────────────────────────────────────────────────────────┐
│                 ROTA OPTİMİZASYON MOTORU                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Girdi                    Motor                    Çıktı       │
│  ┌─────────┐          ┌───────────────┐         ┌─────────┐    │
│  │Duraklar │─────────▶│               │────────▶│Optimum  │    │
│  │Yolcular │          │  OR-Tools /   │         │Rota     │    │
│  │Zaman    │          │  GraphHopper  │         │Sıralama │    │
│  │Kapasite │─────────▶│               │────────▶│ETA      │    │
│  │Trafik   │          │               │         │Maliyet  │    │
│  └─────────┘          └───────────────┘         └─────────┘    │
│                                                                 │
│  Kısıtlar:                                                      │
│  • Araç kapasitesi (14-25 kişi)                                │
│  • Vardiya başlangıç saati                                      │
│  • Maksimum seyahat süresi                                      │
│  • Yolcu öncelikleri                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Teknik Adımlar:**

1. **Optimizasyon Servisi**
   ```python
   # Python microservice (OR-Tools kullanarak)
   from ortools.constraint_solver import routing_enums_pb2
   from ortools.constraint_solver import pywrapcp
   
   def optimize_route(stops, vehicle_capacity, time_windows):
       manager = pywrapcp.RoutingIndexManager(
           len(stops), 
           num_vehicles, 
           depot
       )
       routing = pywrapcp.RoutingModel(manager)
       
       # Mesafe callback
       # Kapasite kısıtı
       # Zaman penceresi kısıtı
       
       solution = routing.SolveWithParameters(search_params)
       return extract_routes(solution)
   ```

2. **Trafik Verisi Entegrasyonu**
   - Google Maps Traffic API
   - HERE Traffic API
   - Geçmiş trafik verisi analizi

3. **Yeni API Endpoint'leri**
   ```typescript
   POST /api/routes/optimize         // Rota optimizasyonu çalıştır
   GET  /api/routes/:id/alternatives // Alternatif rotalar
   POST /api/routes/:id/recalculate  // Trafik ile yeniden hesapla
   ```

### Beklenen Faydalar
- Yakıt maliyetinde %20-30 tasarruf
- Seyahat süresinde %15 azalma
- Araç kullanım verimliliğinde artış
- CO2 emisyonunda azalma

### Tahmini Süre: 4-6 hafta

---

## 2.2 Gelişmiş Denetim ve Bakım Modülü

### Neden Gerekli?
- Denetim modülü mevcut ancak "1208 araç denetim gerektiriyor" uyarısı var
- Periyodik bakım takibi yapılmıyor
- Muayene, sigorta, kasko tarihleri takip edilmiyor
- Arıza geçmişi kaydedilmiyor

### Nasıl Yapılır?

**Yeni Özellikler:**

```
┌─────────────────────────────────────────────────────────────────┐
│              ARAÇ BAKIM & DENETİM SİSTEMİ                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🚐 34LAC101 - Mercedes Sprinter 2021                          │
│  ├── Kilometre: 145.230 km                                      │
│  │                                                              │
│  │  ⚠️ YAKLAŞAN İŞLEMLER                                       │
│  │  ├── 🔧 Yağ Değişimi: 3 gün sonra (150.000 km)              │
│  │  ├── 📋 Muayene: 15 gün sonra (25 Mart 2026)                │
│  │  └── 🛡️ Kasko: 45 gün sonra (28 Nisan 2026)                 │
│  │                                                              │
│  │  📊 BAKIM GEÇMİŞİ                                           │
│  │  ├── 12.02.2026 - Fren balataları değişti (₺4.500)          │
│  │  ├── 05.01.2026 - Yağ değişimi (₺2.100)                     │
│  │  └── 20.12.2025 - Lastik değişimi (₺12.000)                 │
│  │                                                              │
│  │  💰 TOPLAM BAKIM MALİYETİ (2026): ₺18.600                   │
│  │                                                              │
│  └── [Bakım Ekle] [Denetim Yap] [Geçmişi Gör]                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Teknik Adımlar:**

1. **Veritabanı Genişletme**
   ```sql
   -- Araç belge takibi
   CREATE TABLE vehicle_documents (
     id UUID PRIMARY KEY,
     vehicle_id UUID REFERENCES vehicles(id),
     document_type VARCHAR(50), -- 'muayene', 'sigorta', 'kasko', 'egzoz'
     issue_date DATE,
     expiry_date DATE,
     document_number VARCHAR(100),
     file_url TEXT,
     reminder_days INTEGER DEFAULT 30,
     created_at TIMESTAMPTZ
   );
   
   -- Bakım kayıtları
   CREATE TABLE maintenance_records (
     id UUID PRIMARY KEY,
     vehicle_id UUID REFERENCES vehicles(id),
     maintenance_type VARCHAR(50),
     description TEXT,
     cost DECIMAL(10,2),
     odometer_reading INTEGER,
     performed_by VARCHAR(100),
     performed_at DATE,
     next_maintenance_km INTEGER,
     next_maintenance_date DATE,
     parts_replaced JSONB,
     attachments JSONB,
     created_by UUID REFERENCES users(id),
     created_at TIMESTAMPTZ
   );
   
   -- Arıza kayıtları
   CREATE TABLE breakdown_records (
     id UUID PRIMARY KEY,
     vehicle_id UUID REFERENCES vehicles(id),
     reported_by UUID,
     reported_at TIMESTAMPTZ,
     location JSONB,
     description TEXT,
     severity VARCHAR(20), -- 'low', 'medium', 'high', 'critical'
     status VARCHAR(20),
     resolution TEXT,
     resolved_at TIMESTAMPTZ,
     downtime_hours INTEGER
   );
   ```

2. **Otomatik Hatırlatma Sistemi**
   ```typescript
   // Cron job - her gün çalışır
   async function checkUpcomingMaintenance() {
     const upcoming = await db.query(`
       SELECT v.*, vd.* FROM vehicles v
       JOIN vehicle_documents vd ON v.id = vd.vehicle_id
       WHERE vd.expiry_date <= NOW() + INTERVAL '30 days'
       AND vd.expiry_date > NOW()
     `);
     
     for (const item of upcoming) {
       await sendNotification({
         type: 'maintenance_reminder',
         vehicle_id: item.vehicle_id,
         days_remaining: dateDiff(item.expiry_date, new Date()),
         document_type: item.document_type
       });
     }
   }
   ```

3. **Dashboard Widget**
   - Yaklaşan işlemler özeti
   - Geciken bakımlar uyarısı
   - Aylık bakım takvimi

### Beklenen Faydalar
- Yasal cezaların önlenmesi (muayene, sigorta)
- Araç ömrünün uzaması
- Beklenmedik arızalarda %40 azalma
- Bakım maliyetlerinin izlenebilirliği

### Tahmini Süre: 3-4 hafta

---

## 2.3 Personel/Yolcu Yönetimi

### Neden Gerekli?
- Hangi personelin hangi servisi kullandığı bilinmiyor
- Yolcu sayısı takibi yapılamıyor
- Personel şikayetleri kayıt altına alınamıyor
- Kapasite planlaması yapılamıyor

### Nasıl Yapılır?

**Modül Özellikleri:**

```
┌─────────────────────────────────────────────────────────────────┐
│                  PERSONEL YÖNETİM MODÜLÜ                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STER KOLTUK SİSTEMLERİ - 245 Personel                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ GÜZERGAH: Pendik - Gebze OSB                            │   │
│  │ Araç: 34LAC101 (Kapasite: 14)                           │   │
│  │                                                          │   │
│  │ Kayıtlı Personel (12/14):                               │   │
│  │ ┌────┬──────────────┬─────────────┬──────────┐          │   │
│  │ │ #  │ Ad Soyad     │ Durak       │ Telefon  │          │   │
│  │ ├────┼──────────────┼─────────────┼──────────┤          │   │
│  │ │ 1  │ Ahmet Yılmaz │ Pendik Myd. │ 532 xxx  │          │   │
│  │ │ 2  │ Ayşe Demir   │ Kaynarca    │ 533 xxx  │          │   │
│  │ │ .. │ ...          │ ...         │ ...      │          │   │
│  │ └────┴──────────────┴─────────────┴──────────┘          │   │
│  │                                                          │   │
│  │ [Personel Ekle] [Toplu Yükle] [QR Kod Oluştur]          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  📊 İSTATİSTİKLER                                              │
│  • Ortalama doluluk: %85                                       │
│  • Devamsızlık oranı: %8                                       │
│  • En yoğun durak: Kaynarca (18 kişi)                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Teknik Adımlar:**

1. **Veritabanı**
   ```sql
   -- Personel tablosu
   CREATE TABLE passengers (
     id UUID PRIMARY KEY,
     company_id UUID REFERENCES companies(id),
     employee_id VARCHAR(50),
     name VARCHAR(100),
     phone VARCHAR(20),
     email VARCHAR(255),
     department VARCHAR(100),
     pickup_location JSONB,
     dropoff_location JSONB,
     shift VARCHAR(20), -- 'morning', 'evening', 'night'
     is_active BOOLEAN DEFAULT true,
     qr_code VARCHAR(100) UNIQUE,
     created_at TIMESTAMPTZ
   );
   
   -- Personel-Güzergah ataması
   CREATE TABLE passenger_routes (
     id UUID PRIMARY KEY,
     passenger_id UUID REFERENCES passengers(id),
     route_id UUID REFERENCES routes(id),
     stop_order INTEGER,
     effective_from DATE,
     effective_to DATE
   );
   
   -- Yolculuk kayıtları
   CREATE TABLE trip_passengers (
     id UUID PRIMARY KEY,
     trip_id UUID,
     passenger_id UUID REFERENCES passengers(id),
     boarded_at TIMESTAMPTZ,
     alighted_at TIMESTAMPTZ,
     boarding_location JSONB,
     is_no_show BOOLEAN DEFAULT false
   );
   ```

2. **QR Kod ile Biniş Takibi**
   - Her personele özel QR kod
   - Şoför uygulamasında QR okuyucu
   - Anlık biniş/iniş kaydı

3. **Kapasite Planlama Aracı**
   - Güzergah bazlı doluluk analizi
   - Fazla/eksik kapasite uyarıları
   - Otomatik araç önerisi

### Beklenen Faydalar
- Tam yolcu takibi
- Kapasite optimizasyonu ile maliyet tasarrufu
- Personel memnuniyeti ölçümü
- Devamsızlık analizi

### Tahmini Süre: 5-6 hafta

---

# 📈 ÖNCELİK 3: ANALİTİK VE RAPORLAMA

## 3.1 Business Intelligence Dashboard

### Neden Gerekli?
- Raporlar modülü mevcut ancak detaylı analitik yok
- Karar destek için veri görselleştirme eksik
- Trend analizleri yapılamıyor
- KPI takibi yok

### Nasıl Yapılır?

**Dashboard Bileşenleri:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANALİTİK DASHBOARD                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📊 TEMEL METRİKLER (Mart 2026)                                │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │ Sefer      │ │ Zamanında  │ │ Araç       │ │ Maliyet/   │   │
│  │ 2,450      │ │ %94.2      │ │ Kullanım   │ │ Sefer      │   │
│  │ ↑12%       │ │ ↑2.1%      │ │ %78        │ │ ₺145       │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
│                                                                 │
│  📈 SEFER TRENDİ                    🥧 FİRMA DAĞILIMI          │
│  ┌─────────────────────────────┐   ┌─────────────────────┐     │
│  │     ___                     │   │    STER: 35%        │     │
│  │    /   \    ___            │   │    BICO: 22%        │     │
│  │___/     \__/   \___        │   │    EAE: 18%         │     │
│  │ Oca  Şub  Mar  Nis         │   │    Diğer: 25%       │     │
│  └─────────────────────────────┘   └─────────────────────┘     │
│                                                                 │
│  🚐 ARAÇ PERFORMANSI               ⚠️ DİKKAT GEREKTİREN        │
│  ┌─────────────────────────────┐   ┌─────────────────────┐     │
│  │ En Verimli   │ En Az Arıza │   │ • 3 araç bakımda    │     │
│  │ 34LAC101    │ 34LAD956    │   │ • 5 muayene yakın   │     │
│  │ 98.5% zmnda │ 0 arıza     │   │ • 2 SLA riski       │     │
│  └─────────────────────────────┘   └─────────────────────┘     │
│                                                                 │
│  [Detaylı Rapor] [Excel İndir] [Periyodik Rapor Ayarla]        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Teknik Adımlar:**

1. **Chart Kütüphanesi Entegrasyonu**
   - Recharts (mevcut projede)
   - Ek grafikler: Gauge, Heatmap, Sankey

2. **KPI Hesaplama Servisi**
   ```typescript
   interface KPIMetrics {
     totalTrips: number;
     onTimePercentage: number;
     vehicleUtilization: number;
     costPerTrip: number;
     customerSatisfaction: number;
     slaCompliance: number;
     fuelEfficiency: number;
     maintenanceCost: number;
   }
   
   async function calculateKPIs(dateRange: DateRange): Promise<KPIMetrics> {
     // Veritabanından hesapla
   }
   ```

3. **Otomatik Rapor Oluşturma**
   - Günlük/haftalık/aylık özet raporları
   - PDF ve Excel export
   - E-posta ile otomatik gönderim

### Beklenen Faydalar
- Veri odaklı karar alma
- Performans ölçümü ve iyileştirme
- Yönetim raporlamasında kolaylık
- Trend analizi ile proaktif aksiyon

### Tahmini Süre: 4-5 hafta

---

## 3.2 Maliyet Analizi ve Bütçe Modülü

### Neden Gerekli?
- Araç başına maliyet bilinmiyor
- Firma bazlı karlılık analizi yapılamıyor
- Yakıt, bakım, personel maliyetleri takip edilmiyor
- Bütçe planlaması yapılamıyor

### Nasıl Yapılır?

**Maliyet Kategorileri:**

```
ARAÇ MALİYET YAPISI
├── Sabit Maliyetler
│   ├── Amortisman
│   ├── Sigorta & Kasko
│   ├── MTV
│   └── Muayene
├── Değişken Maliyetler
│   ├── Yakıt
│   ├── Bakım & Onarım
│   ├── Lastik
│   └── Yıkama
└── Operasyonel Maliyetler
    ├── Şoför Maaşı
    ├── SGK
    └── Yemek/Yol
```

**Teknik Adımlar:**

1. **Veritabanı**
   ```sql
   -- Maliyet kayıtları
   CREATE TABLE costs (
     id UUID PRIMARY KEY,
     vehicle_id UUID REFERENCES vehicles(id),
     company_id UUID REFERENCES companies(id),
     cost_type VARCHAR(50),
     cost_category VARCHAR(50),
     amount DECIMAL(10,2),
     currency VARCHAR(3) DEFAULT 'TRY',
     description TEXT,
     invoice_number VARCHAR(50),
     invoice_date DATE,
     payment_status VARCHAR(20),
     created_by UUID REFERENCES users(id),
     created_at TIMESTAMPTZ
   );
   
   -- Yakıt kayıtları
   CREATE TABLE fuel_records (
     id UUID PRIMARY KEY,
     vehicle_id UUID REFERENCES vehicles(id),
     odometer_reading INTEGER,
     liters DECIMAL(8,2),
     price_per_liter DECIMAL(6,2),
     total_amount DECIMAL(10,2),
     station VARCHAR(100),
     fuel_type VARCHAR(20),
     filled_at TIMESTAMPTZ,
     created_by UUID
   );
   ```

2. **Maliyet Hesaplama**
   ```typescript
   interface VehicleCostAnalysis {
     vehicleId: string;
     period: DateRange;
     fixedCosts: number;
     variableCosts: number;
     operationalCosts: number;
     totalCost: number;
     costPerKm: number;
     costPerTrip: number;
     revenueFromCompanies: number;
     profitMargin: number;
   }
   ```

3. **Karlılık Analizi**
   - Firma bazlı gelir/gider karşılaştırması
   - Güzergah bazlı maliyet analizi
   - Araç bazlı verimlilik raporu

### Beklenen Faydalar
- Şeffaf maliyet takibi
- Karlılık analizi ile fiyat optimizasyonu
- Bütçe planlaması
- Maliyet tasarruf alanlarının tespiti

### Tahmini Süre: 4-5 hafta

---

# 🔧 ÖNCELİK 4: TEKNİK İYİLEŞTİRMELER

## 4.1 API ve Entegrasyon Altyapısı

### Neden Gerekli?
- Üçüncü parti sistemlerle entegrasyon yok
- Webhook desteği mevcut değil
- Müşteri ERP sistemleri ile veri alışverişi yapılamıyor

### Nasıl Yapılır?

**Public API Tasarımı:**

```
/api/v1/
├── /auth
│   ├── POST /token              # API token al
│   └── POST /refresh            # Token yenile
├── /vehicles
│   ├── GET /                    # Araç listesi
│   ├── GET /:id                 # Araç detayı
│   └── GET /:id/location        # Anlık konum
├── /trips
│   ├── GET /                    # Sefer listesi
│   ├── GET /:id                 # Sefer detayı
│   └── GET /:id/tracking        # Sefer takibi
├── /companies
│   ├── GET /                    # Firma listesi
│   └── GET /:id/reports         # Firma raporları
└── /webhooks
    ├── POST /                   # Webhook kayıt
    ├── GET /                    # Webhook listesi
    └── DELETE /:id              # Webhook sil
```

**Webhook Events:**
- `trip.started` - Sefer başladı
- `trip.completed` - Sefer tamamlandı
- `trip.delayed` - Sefer gecikti
- `vehicle.breakdown` - Araç arızası
- `inspection.required` - Denetim gerekli

### Tahmini Süre: 3-4 hafta

---

## 4.2 Bildirim ve Uyarı Sistemi

### Neden Gerekli?
- Kritik olaylarda anlık bildirim yok
- SLA ihlali öncesi uyarı mekanizması eksik
- Çoklu kanal desteği (SMS, E-posta, Push) yok

### Nasıl Yapılır?

```
┌─────────────────────────────────────────────────────────────────┐
│                   BİLDİRİM SİSTEMİ                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Olay               │ Push │ SMS │ E-posta │ Sistem           │
│  ──────────────────────────────────────────────────────────    │
│  Sefer gecikmesi    │  ✓   │  ✓  │    ✓    │    ✓             │
│  Araç arızası       │  ✓   │  ✓  │    ✓    │    ✓             │
│  SLA riski          │  ✓   │  -  │    ✓    │    ✓             │
│  Bakım hatırlatma   │  -   │  -  │    ✓    │    ✓             │
│  Belge bitiş        │  -   │  -  │    ✓    │    ✓             │
│  Yeni görev         │  ✓   │  -  │    -    │    ✓             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Teknik Adımlar:**

1. **Bildirim Servisi**
   ```typescript
   interface NotificationService {
     sendPush(userId: string, message: Notification): Promise<void>;
     sendSMS(phone: string, message: string): Promise<void>;
     sendEmail(email: string, template: string, data: any): Promise<void>;
     sendInApp(userId: string, notification: Notification): Promise<void>;
   }
   ```

2. **Tercih Yönetimi**
   - Kullanıcı bazlı bildirim tercihleri
   - Sessiz saatler ayarı
   - Kanal önceliklendirme

### Tahmini Süre: 2-3 hafta

---

## 4.3 Çoklu Dil Desteği (i18n)

### Neden Gerekli?
- Yabancı uyruklu şoförler olabilir
- Uluslararası müşteri potansiyeli
- Sistem şu an sadece Türkçe

### Nasıl Yapılır?

```typescript
// next-intl veya react-i18next kullanımı
const messages = {
  tr: {
    dashboard: {
      title: 'Kontrol Paneli',
      vehicles: 'Araçlar',
      trips: 'Seferler'
    }
  },
  en: {
    dashboard: {
      title: 'Dashboard',
      vehicles: 'Vehicles',
      trips: 'Trips'
    }
  }
};
```

### Tahmini Süre: 2-3 hafta

---

# 📋 UYGULAMA ÖNCELİK SIRASI

| Sıra | Özellik | Süre | Etki | Karmaşıklık |
|------|---------|------|------|-------------|
| 1 | Gelişmiş Denetim/Bakım | 3-4 hafta | Yüksek | Düşük |
| 2 | Bildirim Sistemi | 2-3 hafta | Yüksek | Düşük |
| 3 | BI Dashboard | 4-5 hafta | Yüksek | Orta |
| 4 | Müşteri Portalı | 6-8 hafta | Yüksek | Orta |
| 5 | Mobil Şoför Uygulaması | 8-10 hafta | Çok Yüksek | Yüksek |
| 6 | GPS Entegrasyonu | 6-8 hafta | Çok Yüksek | Yüksek |
| 7 | Personel Yönetimi | 5-6 hafta | Orta | Orta |
| 8 | Rota Optimizasyonu | 4-6 hafta | Orta | Yüksek |
| 9 | Maliyet Analizi | 4-5 hafta | Orta | Orta |
| 10 | API Altyapısı | 3-4 hafta | Orta | Orta |

---

# 💰 TAHMİNİ YATIRIM GETİRİSİ (ROI)

| Özellik | Yatırım | Beklenen Tasarruf/Gelir | ROI Süresi |
|---------|---------|-------------------------|------------|
| GPS + Rota Opt. | ₺₺₺ | Yakıt %20 tasarruf | 8-12 ay |
| Müşteri Portalı | ₺₺ | Müşteri kaybı %50 azalma | 6-8 ay |
| Bakım Modülü | ₺ | Arıza %40 azalma | 4-6 ay |
| Mobil Uygulama | ₺₺₺ | Operasyonel verimlilik %30 | 10-14 ay |
| BI Dashboard | ₺₺ | Karar hızı %50 artış | 6-8 ay |

---

*Bu doküman Aycan OPS geliştirme yol haritası için hazırlanmıştır.*
*Son güncelleme: Mart 2026*