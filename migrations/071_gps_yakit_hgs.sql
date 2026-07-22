-- Migration: 071_gps_yakit_hgs
-- Tarih: 2026-07-12
-- Açıklama: Sprint 5 — GPS cihazları, yakıt kartları + dolumlar, HGS/OGS etiketleri.

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

-- ── GPS cihazları ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gps_cihazlari (
  id                VARCHAR(36) NOT NULL PRIMARY KEY,
  gps_saglayici     VARCHAR(100),
  gps_id            VARCHAR(100),
  gsm_no            VARCHAR(20),
  imei              VARCHAR(20),
  vehicle_id        VARCHAR(36),
  atama_tarihi      DATE,
  atama_turu        ENUM('kalici','gecici') DEFAULT 'kalici',
  is_active         TINYINT(1) DEFAULT 1,
  notlar            TEXT,
  created_by        VARCHAR(36),
  created_at        VARCHAR(30) NOT NULL,
  updated_at        VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_gps_imei (imei),
  INDEX idx_gps_vehicle (vehicle_id),
  INDEX idx_gps_active (is_active),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Yakıt kartları ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS yakit_kartlari (
  id                VARCHAR(36) NOT NULL PRIMARY KEY,
  kart_no           VARCHAR(50) NOT NULL,
  firma             ENUM('OPET','BP','Shell','Total','Petrol_Ofisi','Diger') DEFAULT 'Diger',
  vehicle_id        VARCHAR(36),
  isleten_id        VARCHAR(36),
  limit_turu        ENUM('miktar','tutar','sinirsiz') DEFAULT 'sinirsiz',
  limit_degeri      DECIMAL(10,2),
  kart_tipi         ENUM('normal','akaryakit_only') DEFAULT 'normal',
  is_active         TINYINT(1) DEFAULT 1,
  notlar            TEXT,
  created_by        VARCHAR(36),
  created_at        VARCHAR(30) NOT NULL,
  updated_at        VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_yakit_kart_no (kart_no),
  INDEX idx_yakit_vehicle (vehicle_id),
  INDEX idx_yakit_isleten (isleten_id),
  INDEX idx_yakit_active (is_active),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  FOREIGN KEY (isleten_id) REFERENCES isleten(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Yakıt dolumları ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS yakit_dolumlar (
  id                VARCHAR(36) NOT NULL PRIMARY KEY,
  kart_id           VARCHAR(36) NOT NULL,
  dolum_tarihi      VARCHAR(30) NOT NULL,
  dolum_yeri        VARCHAR(100),
  miktar_litre      DECIMAL(8,2),
  onceki_km         INT,
  son_km            INT,
  birim_fiyat       DECIMAL(8,3),
  tutar             DECIMAL(10,2),
  notlar            TEXT,
  created_by        VARCHAR(36),
  created_at        VARCHAR(30) NOT NULL,
  INDEX idx_dolum_kart (kart_id, dolum_tarihi),
  FOREIGN KEY (kart_id) REFERENCES yakit_kartlari(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── HGS/OGS etiketleri ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hgs_ogs (
  id                    VARCHAR(36) NOT NULL PRIMARY KEY,
  cinsi                 ENUM('HGS','OGS') DEFAULT 'HGS',
  musteri_no            VARCHAR(50),
  vehicle_id            VARCHAR(36),
  isleten_id            VARCHAR(36),
  etiket_no             VARCHAR(50),
  banka                 VARCHAR(100),
  bakiye                DECIMAL(10,2) DEFAULT 0,
  hesap_acilis_tarihi   DATE,
  is_active             TINYINT(1) DEFAULT 1,
  notlar                TEXT,
  created_by            VARCHAR(36),
  created_at            VARCHAR(30) NOT NULL,
  updated_at            VARCHAR(30) NOT NULL,
  INDEX idx_hgsogs_vehicle (vehicle_id),
  INDEX idx_hgsogs_isleten (isleten_id),
  INDEX idx_hgsogs_active (is_active),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  FOREIGN KEY (isleten_id) REFERENCES isleten(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET foreign_key_checks = 1;

-- ROLLBACK
-- DROP TABLE IF EXISTS hgs_ogs;
-- DROP TABLE IF EXISTS yakit_dolumlar;
-- DROP TABLE IF EXISTS yakit_kartlari;
-- DROP TABLE IF EXISTS gps_cihazlari;
