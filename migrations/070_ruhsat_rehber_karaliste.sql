-- Migration: 070_ruhsat_rehber_karaliste
-- Tarih: 2026-07-06
-- Açıklama: Sprint 4 — ruhsat sahibi, rehber ve kara liste.
--
--           Tasarım kararı: Planda ayrı bir `ruhsat_sahipleri` tablosu ve
--           `company_vehicles.isleten_id` kolonu öngörülüyordu. Bunlar
--           Sprint 1'de kurulan `isleten` (zaten `ruhsat_sahibi_mi` flag'i
--           taşıyor) ve `arac_isleten` (araç-işleten geçmişi) tablolarıyla
--           doğrudan çakışıyor — aynı kişi/firma hem işleten hem ruhsat
--           sahibi olabilir, iki ayrı tabloda tekrar tanımlamak veri
--           tutarsızlığına yol açar. Bunun yerine:
--             - Ruhsat sahibi = isleten.ruhsat_sahibi_mi=1 olan kayıtlar
--             - Araç-ruhsat sahibi bağlantısı = vehicles.ruhsat_sahibi_id (isleten FK)
--             - Araç-işleten bağlantısı = zaten var olan arac_isleten
--           Rehber ve kara liste planla birebir aynı, çakışma yok.

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ruhsat_sahibi_id VARCHAR(36) DEFAULT NULL AFTER route_name;
-- FK ayrı komut olarak eklenir — bazı MariaDB sürümlerinde ADD CONSTRAINT IF NOT EXISTS desteklenmiyor,
-- bu yüzden tekrar çalıştırıldığında "duplicate constraint" hatası verirse elle atlanmalı.

-- ── Rehberler ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rehberler (
  id          VARCHAR(36) NOT NULL PRIMARY KEY,
  ad          VARCHAR(100) NOT NULL,
  soyad       VARCHAR(100) NOT NULL,
  tc_no       VARCHAR(11),
  cep_tel     VARCHAR(20),
  kan_grubu   VARCHAR(5),
  aciklama    TEXT,
  is_active   TINYINT(1) DEFAULT 1,
  created_by  VARCHAR(36),
  created_at  VARCHAR(30) NOT NULL,
  updated_at  VARCHAR(30) NOT NULL,
  INDEX idx_rehberler_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Kara liste ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kara_liste (
  id              VARCHAR(36) NOT NULL PRIMARY KEY,
  isim            VARCHAR(200) NOT NULL,
  tur             ENUM('surucu','yolcu','isleten','diger') NOT NULL,
  tc_no           VARCHAR(11),
  telefon         VARCHAR(20),
  ekleme_nedeni   TEXT,
  aciklama        TEXT,
  durum           ENUM('aktif','kaldirildi') DEFAULT 'aktif',
  kaldirma_nedeni TEXT,
  created_by      VARCHAR(36),
  created_at      VARCHAR(30) NOT NULL,
  updated_at      VARCHAR(30) NOT NULL,
  INDEX idx_kara_liste_tur (tur),
  INDEX idx_kara_liste_durum (durum)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE vehicles ADD CONSTRAINT fk_vehicles_ruhsat_sahibi
  FOREIGN KEY (ruhsat_sahibi_id) REFERENCES isleten(id) ON DELETE SET NULL;

SET foreign_key_checks = 1;

-- ROLLBACK
-- DROP TABLE IF EXISTS kara_liste;
-- DROP TABLE IF EXISTS rehberler;
-- ALTER TABLE vehicles DROP COLUMN IF EXISTS ruhsat_sahibi_id;
