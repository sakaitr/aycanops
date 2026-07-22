-- Migration: 066_filo_yonetimi
-- Tarih: 2026-07-06
-- Açıklama: Sprint 2 — Filo yönetimi: kaza, ceza, arıza, sigorta, lastik
--           değişimi kayıtları ve filo bildirim eşik ayarları.

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

-- ── Kazalar ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_accidents (
  id            VARCHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id    VARCHAR(36) NOT NULL,
  driver_id     VARCHAR(36),
  tarih         DATE NOT NULL,
  arac_km       INT,
  kaza_turu     VARCHAR(100),
  kaza_sekli    VARCHAR(100),
  belge_no      VARCHAR(50),
  kusur_orani   DECIMAL(5,2),
  aciklama      TEXT,
  durum         ENUM('aktif','kapali') DEFAULT 'aktif',
  created_by    VARCHAR(36),
  created_at    VARCHAR(30) NOT NULL,
  updated_at    VARCHAR(30) NOT NULL,
  INDEX idx_accidents_vehicle (vehicle_id, tarih),
  INDEX idx_accidents_durum (durum),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Cezalar ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_penalties (
  id            VARCHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id    VARCHAR(36) NOT NULL,
  driver_id     VARCHAR(36),
  ceza_tarihi   DATE NOT NULL,
  referans_no   VARCHAR(100),
  belge_no      VARCHAR(50),
  ceza_puani    INT,
  ceza_tutari   DECIMAL(10,2),
  ceza_turu     VARCHAR(100),
  odendi        TINYINT(1) DEFAULT 0,
  aciklama      TEXT,
  created_by    VARCHAR(36),
  created_at    VARCHAR(30) NOT NULL,
  updated_at    VARCHAR(30) NOT NULL,
  INDEX idx_penalties_vehicle (vehicle_id, ceza_tarihi),
  INDEX idx_penalties_odendi (odendi),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Arızalar ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_breakdowns (
  id                VARCHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id        VARCHAR(36) NOT NULL,
  driver_id         VARCHAR(36),
  ariza_tarihi      DATE NOT NULL,
  arac_km           INT,
  ariza_detay       TEXT,
  bildiren_kisi     VARCHAR(100),
  bildiren_gorevi   VARCHAR(100),
  vardiya_amiri     VARCHAR(100),
  durum             ENUM('bekliyor','onarildi','devam_ediyor') DEFAULT 'bekliyor',
  created_by        VARCHAR(36),
  created_at        VARCHAR(30) NOT NULL,
  updated_at        VARCHAR(30) NOT NULL,
  INDEX idx_breakdowns_vehicle (vehicle_id, ariza_tarihi),
  INDEX idx_breakdowns_durum (durum),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Sigortalar ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_insurances (
  id                  VARCHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id          VARCHAR(36) NOT NULL,
  police_no           VARCHAR(100) NOT NULL,
  sigorta_turu        ENUM('kasko','trafik','koltuk','ferdi_kaza') NOT NULL,
  sigorta_firmasi     VARCHAR(100),
  acente_no           VARCHAR(50),
  baslangic_tarihi    DATE NOT NULL,
  bitis_tarihi        DATE NOT NULL,
  prim_tutari         DECIMAL(10,2),
  aciklama            TEXT,
  created_by          VARCHAR(36),
  created_at          VARCHAR(30) NOT NULL,
  updated_at          VARCHAR(30) NOT NULL,
  INDEX idx_insurances_vehicle (vehicle_id),
  INDEX idx_insurances_bitis (bitis_tarihi),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Lastik değişimleri ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_tires (
  id                VARCHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id        VARCHAR(36) NOT NULL,
  degisim_tarihi    DATE NOT NULL,
  arac_km           INT,
  lastik_turu       VARCHAR(50),
  lastik_ebadi      VARCHAR(30),
  adet              INT DEFAULT 4,
  birim_fiyat       DECIMAL(10,2),
  tutar             DECIMAL(10,2),
  aciklama          TEXT,
  created_by        VARCHAR(36),
  created_at        VARCHAR(30) NOT NULL,
  INDEX idx_tires_vehicle (vehicle_id, degisim_tarihi),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Filo bildirim eşik ayarları ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS filo_bildirim_ayar (
  id            VARCHAR(36) NOT NULL PRIMARY KEY,
  bildirim_turu VARCHAR(50) NOT NULL,
  esik_km       INT,
  bildirim_km   INT,
  esik_gun      INT,
  kanal         SET('sms','email','push') DEFAULT 'push',
  is_active     TINYINT(1) DEFAULT 1,
  created_at    VARCHAR(30) NOT NULL,
  updated_at    VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_filo_bildirim_turu (bildirim_turu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET foreign_key_checks = 1;

-- ROLLBACK
-- DROP TABLE IF EXISTS filo_bildirim_ayar;
-- DROP TABLE IF EXISTS vehicle_tires;
-- DROP TABLE IF EXISTS vehicle_insurances;
-- DROP TABLE IF EXISTS vehicle_breakdowns;
-- DROP TABLE IF EXISTS vehicle_penalties;
-- DROP TABLE IF EXISTS vehicle_accidents;
