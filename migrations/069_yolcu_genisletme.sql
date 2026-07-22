-- Migration: 069_yolcu_genisletme
-- Tarih: 2026-07-06
-- Açıklama: Sprint 3 — Yolcu (öğrenci/personel) profiline sınıf/şube/barkod,
--           ödeme planı bağlantısı, sözleşme ve hizmet durumu eklenir.
--           Ayrıca geçici servis değişiklikleri (örn. bir öğrencinin belirli
--           bir dönem için farklı güzergahtan gitmesi) takip edilebilir hale gelir.

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

-- ── Ödeme planları (şablon) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS odeme_planlari (
  id              VARCHAR(36) NOT NULL PRIMARY KEY,
  plan_adi        VARCHAR(100) NOT NULL,
  toplam_tutar    DECIMAL(10,2),
  taksit_sayisi   INT,
  aciklama        TEXT,
  is_active       TINYINT(1) DEFAULT 1,
  created_by      VARCHAR(36),
  created_at      VARCHAR(30) NOT NULL,
  updated_at      VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Yolcu profili genişletme ──────────────────────────────────────────────────
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS sinif VARCHAR(20) DEFAULT NULL AFTER type;
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS sube VARCHAR(10) DEFAULT NULL AFTER sinif;
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS barkod_no VARCHAR(50) DEFAULT NULL AFTER sube;
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS odeme_plani_id VARCHAR(36) DEFAULT NULL AFTER barkod_no;
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS sozlesme_durumu ENUM('yok','gonderildi','imzalandi') DEFAULT 'yok' AFTER odeme_plani_id;
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS hizmet_durumu ENUM('aktif','pasif','askida') DEFAULT 'aktif' AFTER sozlesme_durumu;
ALTER TABLE passengers ADD UNIQUE KEY IF NOT EXISTS uq_passengers_barkod (barkod_no);
ALTER TABLE passengers ADD CONSTRAINT fk_passengers_odeme_plani
  FOREIGN KEY (odeme_plani_id) REFERENCES odeme_planlari(id) ON DELETE SET NULL;

-- ── Geçici servis değişiklikleri ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS servis_degisiklikleri (
  id                  VARCHAR(36) NOT NULL PRIMARY KEY,
  passenger_id        VARCHAR(36) NOT NULL,
  orijinal_route_id   VARCHAR(36),
  gecici_route_id     VARCHAR(36),
  baslangic_tarihi    DATE NOT NULL,
  bitis_tarihi        DATE,
  yon                 ENUM('sabah','aksam','her_iki') DEFAULT 'her_iki',
  aciklama            VARCHAR(500),
  created_by          VARCHAR(36),
  created_at          VARCHAR(30) NOT NULL,
  INDEX idx_servis_degisiklikleri_passenger (passenger_id, baslangic_tarihi),
  FOREIGN KEY (passenger_id) REFERENCES passengers(id) ON DELETE CASCADE,
  FOREIGN KEY (orijinal_route_id) REFERENCES routes(id) ON DELETE SET NULL,
  FOREIGN KEY (gecici_route_id) REFERENCES routes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET foreign_key_checks = 1;

-- ROLLBACK
-- DROP TABLE IF EXISTS servis_degisiklikleri;
-- ALTER TABLE passengers DROP FOREIGN KEY IF EXISTS fk_passengers_odeme_plani;
-- ALTER TABLE passengers DROP KEY IF EXISTS uq_passengers_barkod;
-- ALTER TABLE passengers DROP COLUMN IF EXISTS hizmet_durumu;
-- ALTER TABLE passengers DROP COLUMN IF EXISTS sozlesme_durumu;
-- ALTER TABLE passengers DROP COLUMN IF EXISTS odeme_plani_id;
-- ALTER TABLE passengers DROP COLUMN IF EXISTS barkod_no;
-- ALTER TABLE passengers DROP COLUMN IF EXISTS sube;
-- ALTER TABLE passengers DROP COLUMN IF EXISTS sinif;
-- DROP TABLE IF EXISTS odeme_planlari;
