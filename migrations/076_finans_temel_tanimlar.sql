-- Migration: 076_finans_temel_tanimlar
-- Finans modülü Faz 1: hesap planı, kategori, masraf merkezi, proje, kasa/banka,
-- para birimi, vergi kodu, ödeme yöntemi, gelir-gider, masraf talebi.
-- (finans_kur Faz 3'e, finans_belge_turu Faz 2'ye ertelendi — bkz. design spec.)

CREATE TABLE IF NOT EXISTS finans_hesap_plani (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  kod VARCHAR(20) NOT NULL UNIQUE,
  ad VARCHAR(200) NOT NULL,
  ust_hesap_id VARCHAR(36) NULL,
  tip ENUM('varlik','borc','ozkaynak','gelir','gider') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(36),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_hesap_ust (ust_hesap_id),
  FOREIGN KEY (ust_hesap_id) REFERENCES finans_hesap_plani(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_kategori (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  ad VARCHAR(200) NOT NULL,
  tip ENUM('gelir','gider') NOT NULL,
  hesap_id VARCHAR(36) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(36),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_kategori_hesap (hesap_id),
  FOREIGN KEY (hesap_id) REFERENCES finans_hesap_plani(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_masraf_merkezi (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  ad VARCHAR(200) NOT NULL,
  company_id VARCHAR(36) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(36),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_masraf_merkezi_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_proje (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  ad VARCHAR(200) NOT NULL,
  kod VARCHAR(50),
  company_id VARCHAR(36) NULL,
  baslangic_tarihi DATE NULL,
  bitis_tarihi DATE NULL,
  durum ENUM('planlanan','aktif','tamamlandi','iptal') NOT NULL DEFAULT 'aktif',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(36),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_proje_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_para_birimi (
  kod VARCHAR(10) NOT NULL PRIMARY KEY,
  ad VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO finans_para_birimi (kod, ad, is_active, created_at, updated_at)
VALUES
  ('TRY', 'Türk Lirası', 1, '2026-07-21T00:00:00.000Z', '2026-07-21T00:00:00.000Z'),
  ('USD', 'Amerikan Doları', 1, '2026-07-21T00:00:00.000Z', '2026-07-21T00:00:00.000Z'),
  ('EUR', 'Euro', 1, '2026-07-21T00:00:00.000Z', '2026-07-21T00:00:00.000Z');

-- finans_kur (günlük resmi kur tablosu) bilinçli olarak Faz 1'e dahil edilmedi —
-- hiçbir Faz 1 task'ı onu okumuyor/yazmıyor (ölü şema olurdu). Her finans_gelir_gider
-- satırı zaten kendi `kur` alanını taşıyor (işlem anında elle girilir); günlük resmi
-- kur tablosu ve kur farkı hesaplaması Faz 3'te (tam muhasebe/kur farkı) eklenecek.

CREATE TABLE IF NOT EXISTS finans_kasa_banka_hesabi (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  ad VARCHAR(200) NOT NULL,
  tip ENUM('kasa','banka','kredi_karti','pos') NOT NULL,
  banka_adi VARCHAR(200) NULL,
  iban VARCHAR(50) NULL,
  para_birimi_kod VARCHAR(10) NOT NULL DEFAULT 'TRY',
  acilis_bakiyesi DECIMAL(14,2) NOT NULL DEFAULT 0,
  company_id VARCHAR(36) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(36),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_kasa_banka_company (company_id),
  FOREIGN KEY (para_birimi_kod) REFERENCES finans_para_birimi(kod)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_vergi_kodu (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  ad VARCHAR(100) NOT NULL,
  oran DECIMAL(5,2) NOT NULL,
  gecerlilik_baslangic DATE NOT NULL,
  gecerlilik_bitis DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(36),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_odeme_yontemi (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  ad VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(36),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_gelir_gider (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  tur ENUM('gelir','gider') NOT NULL,
  belge_tarihi DATE NOT NULL,
  kayit_tarihi VARCHAR(30) NOT NULL,
  tahakkuk_tarihi DATE NULL,
  vade_tarihi DATE NULL,
  cari_tip ENUM('musteri','tedarikci') NULL,
  cari_id VARCHAR(36) NULL,
  kategori_id VARCHAR(36) NULL,
  net_tutar DECIMAL(14,2) NOT NULL DEFAULT 0,
  vergi_tutari DECIMAL(14,2) NOT NULL DEFAULT 0,
  brut_tutar DECIMAL(14,2) NOT NULL DEFAULT 0,
  para_birimi_kod VARCHAR(10) NOT NULL DEFAULT 'TRY',
  kur DECIMAL(12,6) NOT NULL DEFAULT 1,
  company_id VARCHAR(36) NULL,
  department_id VARCHAR(36) NULL,
  proje_id VARCHAR(36) NULL,
  masraf_merkezi_id VARCHAR(36) NULL,
  odeme_durumu ENUM('odenmedi','kismen_odendi','odendi','fazla_odendi') NOT NULL DEFAULT 'odenmedi',
  durum ENUM('taslak','onay_bekliyor','onaylandi','reddedildi') NOT NULL DEFAULT 'taslak',
  aciklama TEXT,
  etiketler TEXT,
  tekrarlama_json TEXT,
  created_by VARCHAR(36) NOT NULL,
  approved_by VARCHAR(36) NULL,
  approved_at VARCHAR(30) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_gg_tur_durum (tur, durum),
  INDEX idx_gg_belge_tarihi (belge_tarihi),
  INDEX idx_gg_vade_tarihi (vade_tarihi),
  INDEX idx_gg_company (company_id),
  INDEX idx_gg_kategori (kategori_id),
  FOREIGN KEY (kategori_id) REFERENCES finans_kategori(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (proje_id) REFERENCES finans_proje(id) ON DELETE SET NULL,
  FOREIGN KEY (masraf_merkezi_id) REFERENCES finans_masraf_merkezi(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_masraf_talebi (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  talep_eden_user_id VARCHAR(36) NOT NULL,
  tarih DATE NOT NULL,
  baslik VARCHAR(300) NOT NULL,
  aciklama TEXT,
  tahmini_tutar DECIMAL(14,2) NOT NULL,
  para_birimi_kod VARCHAR(10) NOT NULL DEFAULT 'TRY',
  kategori_id VARCHAR(36) NULL,
  department_id VARCHAR(36) NULL,
  proje_id VARCHAR(36) NULL,
  masraf_merkezi_id VARCHAR(36) NULL,
  durum ENUM('bekliyor','onaylandi','reddedildi','tamamlandi') NOT NULL DEFAULT 'bekliyor',
  onaylayan_user_id VARCHAR(36) NULL,
  onay_tarihi VARCHAR(30) NULL,
  red_nedeni VARCHAR(500) NULL,
  iliskili_gelir_gider_id VARCHAR(36) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_mt_talep_eden (talep_eden_user_id),
  INDEX idx_mt_durum (durum),
  FOREIGN KEY (talep_eden_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (kategori_id) REFERENCES finans_kategori(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (proje_id) REFERENCES finans_proje(id) ON DELETE SET NULL,
  FOREIGN KEY (masraf_merkezi_id) REFERENCES finans_masraf_merkezi(id) ON DELETE SET NULL,
  FOREIGN KEY (iliskili_gelir_gider_id) REFERENCES finans_gelir_gider(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
