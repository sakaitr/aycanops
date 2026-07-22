-- Sprint 7 — Admin Tablo Genişletme
-- Not: GELISTIRME_PLANI.md'de bu "Migration 066" olarak adlandırılmıştı, ama 066
-- numarası Sprint 2 (filo_yonetimi) tarafından zaten kullanılmıştı. Gerçek numara 072.
-- created_at/updated_at kodun geri kalanıyla tutarlı olması için VARCHAR(30) —
-- lib/time.ts'deki nowIso() ISO string üretiyor (Date.toISOString()), gerçek
-- DATETIME kolonuna yazılamıyor.

CREATE TABLE yakit_fiyatlari (
  id VARCHAR(36) PRIMARY KEY,
  yakit_turu ENUM('benzin','motorin','lpg','elektrik') NOT NULL,
  fiyat DECIMAL(8,3) NOT NULL,
  gecerlilik_tarihi DATE NOT NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE otoyol_kopru_fiyatlari (
  id VARCHAR(36) PRIMARY KEY,
  guzergah_adi VARCHAR(200) NOT NULL,
  yon ENUM('tek_yon','gidis_donus') NOT NULL DEFAULT 'tek_yon',
  fiyat DECIMAL(8,2) NOT NULL,
  arac_sinifi VARCHAR(20),
  gecerlilik_tarihi DATE NOT NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE arac_gruplari (
  id VARCHAR(36) PRIMARY KEY,
  grup_adi VARCHAR(100) NOT NULL,
  aciklama TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sigorta_sirketleri (
  id VARCHAR(36) PRIMARY KEY,
  sirket_adi VARCHAR(200) NOT NULL,
  telefon VARCHAR(20),
  email VARCHAR(150),
  is_active TINYINT(1) DEFAULT 1,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE banka_tanimlari (
  id VARCHAR(36) PRIMARY KEY,
  banka_adi VARCHAR(150) NOT NULL,
  banka_kodu VARCHAR(20),
  swift_kodu VARCHAR(20),
  is_active TINYINT(1) DEFAULT 1,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE donem_tanimlari (
  id VARCHAR(36) PRIMARY KEY,
  donem_adi VARCHAR(100) NOT NULL,
  baslangic_tarihi DATE NOT NULL,
  bitis_tarihi DATE NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
