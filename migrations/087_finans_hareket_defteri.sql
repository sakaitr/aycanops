-- Migration: 087_finans_hareket_defteri
-- Açıklama: Finans modülünün yeni omurgası.
--
-- SORUN: Her finansal olay ayrı tabloya yazılıyordu (finans_fatura,
-- finans_fis, finans_gelir_gider, finans_masraf_talebi) ve hiçbir yerde
-- birleşmiyordu. Bu yüzden "bu ay ne harcadım", "neye harcandı", "bu aracın
-- maliyeti ne" gibi sorular cevaplanamıyordu — toplanacak tek yer yoktu.
--
-- ÇÖZÜM: finans_hareket = tek defter (single-entry ledger). Her belge türü
-- (fatura/masraf/kasa/hakediş) buraya bir satır yazar. Cari ekstre, patron
-- paneli, araç/güzergah/firma kârlılığı hepsi bu tek tablodan çıkar.
--
-- NOT: Bu çift taraflı muhasebe (mahsup/yansıtma) DEĞİL. Tek düzen hesap
-- planı ve beyanname SMMM'nin işi; burada amaç ön muhasebe + masraf yönetimi
-- (bkz. Paraşüt/Masraff/Bizigo modeli).

SET NAMES utf8mb4;

-- ── 1. Kategori ağacı ────────────────────────────────────────────────────
-- "Neye harcandı" sorusunun cevabı burada. Tek seviye liste yetmiyordu,
-- parent_id ile 2 seviyeli ağaç oluyor (Araç Giderleri > Yakıt gibi).
-- IF NOT EXISTS: bu migration bir kez yarıda kaldıysa (bkz. id uzunluğu
-- düzeltmesi) yeniden çalıştırılabilir olmalı.
ALTER TABLE finans_kategori
  ADD COLUMN IF NOT EXISTS parent_id VARCHAR(36) NULL AFTER tip,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0 AFTER parent_id,
  ADD INDEX IF NOT EXISTS idx_kategori_parent (parent_id);

-- ── 2. Hareket defteri ───────────────────────────────────────────────────
-- id, kaynak belgeden türetilen deterministik bir anahtar:
-- "hrk-<kaynak>-<kaynak_id>" (örn. hrk-fat-<uuid36>) = 44 karaktere kadar
-- çıkar, bu yüzden 36 değil 64 karakter. Deterministik olması, aynı belge
-- için tekrar sync çağrıldığında satırın çoğalmamasını sağlıyor.
CREATE TABLE IF NOT EXISTS finans_hareket (
  id VARCHAR(64) NOT NULL PRIMARY KEY,

  -- NE OLDU
  tur ENUM('gelir','gider') NOT NULL,
  tarih DATE NOT NULL,
  tutar DECIMAL(14,2) NOT NULL DEFAULT 0,        -- brüt (KDV dahil)
  net_tutar DECIMAL(14,2) NOT NULL DEFAULT 0,    -- KDV hariç
  kdv_tutari DECIMAL(14,2) NOT NULL DEFAULT 0,
  para_birimi VARCHAR(10) NOT NULL DEFAULT 'TRY',
  kur DECIMAL(12,6) NOT NULL DEFAULT 1,
  -- Raporlar tek para biriminde toplayabilsin diye TRY karşılığı saklanıyor
  -- (kur sonradan değişse bile geçmiş rapor kaymaz).
  tutar_try DECIMAL(14,2) NOT NULL DEFAULT 0,

  -- KİMLE (cari hesap — ekstre/bakiye buradan çıkar)
  cari_id VARCHAR(36) NULL,

  -- NEYE (kategori ağacı)
  kategori_id VARCHAR(36) NULL,

  -- NEDEN / KİM İÇİN (boyutlar — patron panelinin kırılımları)
  vehicle_id VARCHAR(36) NULL,
  route_id VARCHAR(36) NULL,
  company_id VARCHAR(36) NULL,          -- hangi müşteri firma için
  department_id VARCHAR(36) NULL,
  masraf_merkezi_id VARCHAR(36) NULL,
  proje_id VARCHAR(36) NULL,
  personel_id VARCHAR(36) NULL,         -- kim harcadı / kimin adına

  -- KAYNAK BELGE (hangi kapıdan girdi)
  kaynak_tip ENUM('fatura','masraf','kasa','hakedis','manuel') NOT NULL,
  kaynak_id VARCHAR(36) NULL,

  -- PARA HAREKETİ
  odeme_durumu ENUM('odenmedi','kismen_odendi','odendi') NOT NULL DEFAULT 'odenmedi',
  odenen_tutar DECIMAL(14,2) NOT NULL DEFAULT 0,
  kasa_banka_id VARCHAR(36) NULL,

  durum ENUM('taslak','onay_bekliyor','onaylandi','reddedildi','iptal') NOT NULL DEFAULT 'onaylandi',
  aciklama TEXT,

  created_by VARCHAR(36) NULL,
  onaylayan_id VARCHAR(36) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,

  INDEX idx_hareket_tarih (tarih),
  INDEX idx_hareket_tur_tarih (tur, tarih),
  INDEX idx_hareket_cari (cari_id),
  INDEX idx_hareket_kategori (kategori_id),
  INDEX idx_hareket_vehicle (vehicle_id),
  INDEX idx_hareket_company (company_id),
  INDEX idx_hareket_kaynak (kaynak_tip, kaynak_id),
  INDEX idx_hareket_durum (durum)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tablo daha önce VARCHAR(36) id ile oluşturulmuş olabilir (ilk deneme) —
-- CREATE TABLE IF NOT EXISTS o durumda atlanacağı için genişletme ayrıca
-- uygulanıyor. Zaten 64 ise bu ifade zararsız.
ALTER TABLE finans_hareket MODIFY COLUMN id VARCHAR(64) NOT NULL;

-- ── 3. Kategori ağacı seed ───────────────────────────────────────────────
-- Sabit id'ler kullanılıyor (idempotent + kod tarafından referans edilebilir).
-- Personel taşımacılığı iş modeline göre kurgulandı.

-- GİDER — üst kategoriler
INSERT INTO finans_kategori (id, ad, tip, parent_id, sort_order, is_active, created_at, updated_at) VALUES
  ('kat-g-arac',     'Araç Giderleri',        'gider', NULL, 10, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-taseron',  'Taşeron / İşleten',     'gider', NULL, 20, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-personel', 'Personel Giderleri',    'gider', NULL, 30, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-ofis',     'Ofis / Genel Yönetim',  'gider', NULL, 40, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-vergi',    'Vergi ve Resmi',        'gider', NULL, 50, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-finansal', 'Finansal Giderler',     'gider', NULL, 60, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-diger',    'Diğer Giderler',        'gider', NULL, 90, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z')
ON DUPLICATE KEY UPDATE ad = VALUES(ad), parent_id = VALUES(parent_id), sort_order = VALUES(sort_order);

-- GİDER — alt kategoriler
INSERT INTO finans_kategori (id, ad, tip, parent_id, sort_order, is_active, created_at, updated_at) VALUES
  ('kat-g-yakit',        'Yakıt',                    'gider', 'kat-g-arac', 11, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-bakim',        'Bakım / Onarım',           'gider', 'kat-g-arac', 12, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-lastik',       'Lastik',                   'gider', 'kat-g-arac', 13, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-sigorta',      'Sigorta (Trafik/Kasko)',   'gider', 'kat-g-arac', 14, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-hgs',          'HGS / Otoyol / Köprü',     'gider', 'kat-g-arac', 15, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-ceza',         'Trafik Cezası',            'gider', 'kat-g-arac', 16, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-muayene',      'Muayene / Egzoz',          'gider', 'kat-g-arac', 17, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-arackira',     'Araç Kiralama',            'gider', 'kat-g-arac', 18, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),

  ('kat-g-hakedis',      'Hakediş Ödemesi',          'gider', 'kat-g-taseron', 21, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-sozlesmeli',   'Sözleşmeli Araç Ödemesi',  'gider', 'kat-g-taseron', 22, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),

  ('kat-g-maas',         'Maaş / Ücret',             'gider', 'kat-g-personel', 31, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-sgk',          'SGK / Stopaj',             'gider', 'kat-g-personel', 32, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-yemek',        'Yemek',                    'gider', 'kat-g-personel', 33, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-harcirah',     'Harcırah / Yol',           'gider', 'kat-g-personel', 34, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-prim',         'Prim / İkramiye',          'gider', 'kat-g-personel', 35, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-kiyafet',      'Kıyafet / Ekipman',        'gider', 'kat-g-personel', 36, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),

  ('kat-g-kira',         'Kira',                     'gider', 'kat-g-ofis', 41, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-fatura',       'Elektrik / Su / Doğalgaz', 'gider', 'kat-g-ofis', 42, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-iletisim',     'İnternet / Telefon',       'gider', 'kat-g-ofis', 43, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-kirtasiye',    'Kırtasiye / Sarf',         'gider', 'kat-g-ofis', 44, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-temizlik',     'Temizlik',                 'gider', 'kat-g-ofis', 45, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-yazilim',      'Yazılım / Abonelik',       'gider', 'kat-g-ofis', 46, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),

  ('kat-g-kdv',          'KDV',                      'gider', 'kat-g-vergi', 51, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-vergiharc',    'Diğer Vergi / Harç',       'gider', 'kat-g-vergi', 52, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),

  ('kat-g-bankamasraf',  'Banka Masrafı / Komisyon', 'gider', 'kat-g-finansal', 61, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-g-faiz',         'Kredi Faizi',              'gider', 'kat-g-finansal', 62, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z')
ON DUPLICATE KEY UPDATE ad = VALUES(ad), parent_id = VALUES(parent_id), sort_order = VALUES(sort_order);

-- GELİR
INSERT INTO finans_kategori (id, ad, tip, parent_id, sort_order, is_active, created_at, updated_at) VALUES
  ('kat-gl-tasima',      'Taşımacılık Hizmeti',      'gelir', NULL, 10, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-gl-diger',       'Diğer Gelirler',           'gelir', NULL, 90, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z')
ON DUPLICATE KEY UPDATE ad = VALUES(ad), parent_id = VALUES(parent_id), sort_order = VALUES(sort_order);

INSERT INTO finans_kategori (id, ad, tip, parent_id, sort_order, is_active, created_at, updated_at) VALUES
  ('kat-gl-personeltasima', 'Personel Taşıma (Sözleşme)', 'gelir', 'kat-gl-tasima', 11, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-gl-eksefer',        'Ek Sefer / Mesai',           'gelir', 'kat-gl-tasima', 12, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-gl-transfer',       'Transfer / Organizasyon',    'gelir', 'kat-gl-tasima', 13, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-gl-kurfaiz',        'Faiz / Kur Geliri',          'gelir', 'kat-gl-diger', 91, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z'),
  ('kat-gl-hurda',          'Hurda / Varlık Satışı',      'gelir', 'kat-gl-diger', 92, 1, '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z')
ON DUPLICATE KEY UPDATE ad = VALUES(ad), parent_id = VALUES(parent_id), sort_order = VALUES(sort_order);

-- ── 4. Mevcut faturaları deftere taşı ────────────────────────────────────
-- Fatura tarafı zaten kullanımda (6 kayıt), defterde görünmeleri gerekiyor.
-- kaynak_tip='fatura' + kaynak_id ile izlenebilir kalıyor.
INSERT INTO finans_hareket
  (id, tur, tarih, tutar, net_tutar, kdv_tutari, para_birimi, kur, tutar_try,
   cari_id, kaynak_tip, kaynak_id, odeme_durumu, durum, aciklama,
   created_by, created_at, updated_at)
SELECT
  CONCAT('hrk-fat-', f.id),
  CASE WHEN f.tur = 'satis' THEN 'gelir' ELSE 'gider' END,
  f.tarih,
  f.genel_toplam,
  f.ara_toplam,
  f.vergi_toplam,
  f.para_birimi_kod,
  f.kur,
  f.genel_toplam * f.kur,
  f.cari_id,
  'fatura',
  f.id,
  f.odeme_durumu,
  CASE
    WHEN f.durum = 'iptal' THEN 'iptal'
    WHEN f.durum = 'taslak' THEN 'taslak'
    WHEN f.durum = 'onay_bekliyor' THEN 'onay_bekliyor'
    ELSE 'onaylandi'
  END,
  f.aciklama,
  f.created_by,
  f.created_at,
  f.updated_at
FROM finans_fatura f
ON DUPLICATE KEY UPDATE tutar = VALUES(tutar), tutar_try = VALUES(tutar_try), durum = VALUES(durum);
