-- Migration: 061_cetele_hakedis
-- Tarih: 2026-06-29
-- Açıklama: Ücretlendirme form tipleri, çetele, hakediş ve firma mutabakat tabloları

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

-- ── Ücretlendirme form tipleri (şablon) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ucretlendirme_form_tipi (
  id        VARCHAR(36) NOT NULL PRIMARY KEY,
  form_adi  VARCHAR(200) NOT NULL,
  grup_adi  VARCHAR(100),
  aciklama  TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_by VARCHAR(36),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_form_tipi_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Çetele (günlük servis hareket kaydı) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS cetele (
  id              VARCHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id      VARCHAR(36) NOT NULL,
  route_id        VARCHAR(36),
  tarih           DATE NOT NULL,
  hareket_tipi    ENUM('sabah','aksam','ring','transfer') NOT NULL,
  durum           ENUM('bekliyor','onaylandi','iptal') DEFAULT 'bekliyor',
  yolcu_sayisi    INT,
  onaylayan       VARCHAR(36),
  onay_tarihi     VARCHAR(30),
  geri_alma_nedeni VARCHAR(500),
  aciklama        VARCHAR(500),
  created_by      VARCHAR(36),
  created_at      VARCHAR(30) NOT NULL,
  updated_at      VARCHAR(30) NOT NULL,
  INDEX idx_cetele_vehicle_tarih (vehicle_id, tarih),
  INDEX idx_cetele_tarih_durum (tarih, durum),
  INDEX idx_cetele_route (route_id),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Hakediş (ücretlendirme formu) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hakedis (
  id                VARCHAR(36) NOT NULL PRIMARY KEY,
  isleten_id        VARCHAR(36) NOT NULL,
  vehicle_id        VARCHAR(36),
  donem_baslangic   DATE NOT NULL,
  donem_bitis       DATE NOT NULL,
  form_tipi_id      VARCHAR(36),
  brut_tutar        DECIMAL(12,2) DEFAULT 0,
  kdv_orani         DECIMAL(5,2) DEFAULT 20,
  kdv_tutari        DECIMAL(12,2) DEFAULT 0,
  tevkifat_orani    DECIMAL(5,2) DEFAULT 0,
  tevkifat_tutari   DECIMAL(12,2) DEFAULT 0,
  net_tutar         DECIMAL(12,2) DEFAULT 0,
  durum             ENUM('taslak','tahakkuk','onaylandi','odendi','iptal') DEFAULT 'taslak',
  aciklama          TEXT,
  tahakkuk_tarihi   VARCHAR(30),
  onay_tarihi       VARCHAR(30),
  odeme_tarihi      VARCHAR(30),
  created_by        VARCHAR(36),
  created_at        VARCHAR(30) NOT NULL,
  updated_at        VARCHAR(30) NOT NULL,
  INDEX idx_hakedis_isleten (isleten_id),
  INDEX idx_hakedis_donem (donem_baslangic, donem_bitis),
  INDEX idx_hakedis_durum (durum),
  FOREIGN KEY (isleten_id) REFERENCES isleten(id) ON DELETE CASCADE,
  FOREIGN KEY (form_tipi_id) REFERENCES ucretlendirme_form_tipi(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Hakediş-Çetele ilişkisi ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hakedis_cetele (
  id          VARCHAR(36) NOT NULL PRIMARY KEY,
  hakedis_id  VARCHAR(36) NOT NULL,
  cetele_id   VARCHAR(36) NOT NULL,
  created_at  VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_hakedis_cetele (hakedis_id, cetele_id),
  FOREIGN KEY (hakedis_id) REFERENCES hakedis(id) ON DELETE CASCADE,
  FOREIGN KEY (cetele_id)  REFERENCES cetele(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Firma mutabakat ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS firma_mutabakat (
  id                  VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id          VARCHAR(36) NOT NULL,
  donem               DATE NOT NULL,
  durum               ENUM('bekliyor','onaylandi','itiraz') DEFAULT 'bekliyor',
  gonderilis_tarihi   VARCHAR(30),
  onay_tarihi         VARCHAR(30),
  itiraz_aciklamasi   TEXT,
  aciklama            TEXT,
  created_by          VARCHAR(36),
  created_at          VARCHAR(30) NOT NULL,
  updated_at          VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_mutabakat_company_donem (company_id, donem),
  INDEX idx_mutabakat_donem (donem),
  INDEX idx_mutabakat_durum (durum)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET foreign_key_checks = 1;

-- ROLLBACK
-- DROP TABLE IF EXISTS firma_mutabakat;
-- DROP TABLE IF EXISTS hakedis_cetele;
-- DROP TABLE IF EXISTS hakedis;
-- DROP TABLE IF EXISTS cetele;
-- DROP TABLE IF EXISTS ucretlendirme_form_tipi;
