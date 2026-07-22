-- Migration: 060_isleten
-- Tarih: 2026-06-29
-- Açıklama: İşleten (araç sahibi/işleticisi) tabloları — çetele ve hakediş zincirinin temeli

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

-- ── İşleten (araç sahibi/işleticisi) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS isleten (
  id              VARCHAR(36) NOT NULL PRIMARY KEY,
  unvan           VARCHAR(255) NOT NULL,
  vergi_no        VARCHAR(20),
  tc_no           VARCHAR(11),
  vergi_dairesi   VARCHAR(100),
  cep_tel         VARCHAR(20) NOT NULL,
  is_tel          VARCHAR(20),
  ev_tel          VARCHAR(20),
  email           VARCHAR(150),
  cari_kod        VARCHAR(50) UNIQUE,
  kayitli_oda     VARCHAR(100),
  sozlesme_baslangic DATE,
  sozlesme_bitis  DATE,
  ana_isleten     TINYINT(1) DEFAULT 0,
  surucu_mu       TINYINT(1) DEFAULT 0,
  ruhsat_sahibi_mi TINYINT(1) DEFAULT 0,
  tevkifat_durumu ENUM('tum_araclar','sadece_ozmal','uygulanmasin') DEFAULT 'tum_araclar',
  yakit_kredi_orani DECIMAL(5,2),
  banka_adi       VARCHAR(100),
  banka_sube      VARCHAR(100),
  banka_iban      VARCHAR(34),
  aciklama        TEXT,
  is_active       TINYINT(1) DEFAULT 1,
  created_by      VARCHAR(36),
  created_at      VARCHAR(30) NOT NULL,
  updated_at      VARCHAR(30) NOT NULL,
  INDEX idx_isleten_active (is_active),
  INDEX idx_isleten_cari_kod (cari_kod)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Araç-İşleten bağlantısı (geçmişli) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS arac_isleten (
  id              VARCHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id      VARCHAR(36) NOT NULL,
  isleten_id      VARCHAR(36) NOT NULL,
  baslangic_tarihi DATE NOT NULL,
  bitis_tarihi    DATE,
  islem_turu      ENUM('atama','devir','iptal') DEFAULT 'atama',
  aciklama        VARCHAR(500),
  created_by      VARCHAR(36),
  created_at      VARCHAR(30) NOT NULL,
  INDEX idx_arac_isleten_vehicle (vehicle_id),
  INDEX idx_arac_isleten_isleten (isleten_id),
  INDEX idx_arac_isleten_aktif (vehicle_id, bitis_tarihi),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  FOREIGN KEY (isleten_id) REFERENCES isleten(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── İşleten cari hareketleri ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS isleten_cari (
  id              VARCHAR(36) NOT NULL PRIMARY KEY,
  isleten_id      VARCHAR(36) NOT NULL,
  tarih           DATE NOT NULL,
  vade_tarihi     DATE,
  tutar           DECIMAL(12,2) NOT NULL DEFAULT 0,
  para_cikisi     DECIMAL(12,2) DEFAULT 0,
  para_girisi     DECIMAL(12,2) DEFAULT 0,
  aciklama        VARCHAR(500),
  islem_turu      ENUM('hakedis','odeme','avans','kesinti','diger') NOT NULL DEFAULT 'diger',
  referans_id     VARCHAR(36),
  referans_turu   VARCHAR(50),
  created_by      VARCHAR(36),
  created_at      VARCHAR(30) NOT NULL,
  INDEX idx_isleten_cari_isleten (isleten_id),
  INDEX idx_isleten_cari_tarih (isleten_id, tarih),
  FOREIGN KEY (isleten_id) REFERENCES isleten(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET foreign_key_checks = 1;

-- ROLLBACK
-- DROP TABLE IF EXISTS isleten_cari;
-- DROP TABLE IF EXISTS arac_isleten;
-- DROP TABLE IF EXISTS isleten;
