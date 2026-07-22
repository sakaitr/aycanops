-- Migration: 062_guzergah_atama_gecmisi
-- Tarih: 2026-07-02
-- Açıklama: Güzergah-araç ataması için geçmişli tablo. Tek bir routes.vehicle_id
--           alanı yerine, hareket tipine (sabah/akşam/ring/transfer) ve firmaya göre
--           ayrışabilen, tarihli atama kayıtları tutar. routes.vehicle_id/company_id/
--           driver_name alanları geriye dönük uyumluluk için "güncel" önbellek olarak
--           kalmaya devam eder — bu tablo tek doğruluk kaynağı olma yolunda ek katman.

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

CREATE TABLE IF NOT EXISTS guzergah_atama_gecmisi (
  id                VARCHAR(36) NOT NULL PRIMARY KEY,
  route_id          VARCHAR(36) NOT NULL,
  hareket_tipi      ENUM('sabah','aksam','ring','transfer') DEFAULT NULL, -- NULL = tüm hareketler için geçerli varsayılan
  company_id        VARCHAR(36) DEFAULT NULL,   -- bu slotu hangi firma araç/sürücüsü karşılıyor
  vehicle_id        VARCHAR(36) NOT NULL,
  driver_id         VARCHAR(36) DEFAULT NULL,   -- drivers tablosuna bağlı, serbest metin değil
  baslangic_tarihi  DATE NOT NULL,
  bitis_tarihi      DATE DEFAULT NULL,          -- NULL = güncel/aktif atama
  islem_turu        ENUM('atama','devir','iptal') DEFAULT 'atama',
  aciklama          VARCHAR(500),
  created_by        VARCHAR(36),
  created_at        VARCHAR(30) NOT NULL,
  INDEX idx_gag_route (route_id),
  INDEX idx_gag_route_aktif (route_id, hareket_tipi, bitis_tarihi),
  INDEX idx_gag_vehicle (vehicle_id),
  INDEX idx_gag_driver (driver_id),
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- routes tablosuna driver_id eklenir (mevcut driver_name/driver_phone metin alanları kalır,
-- FK bağlantısı ek olarak sunulur — kod kademeli geçer, hiçbir şey kırılmaz)
ALTER TABLE routes ADD COLUMN IF NOT EXISTS driver_id VARCHAR(36) DEFAULT NULL AFTER driver_phone;

SET foreign_key_checks = 1;

-- ROLLBACK
-- ALTER TABLE routes DROP COLUMN IF EXISTS driver_id;
-- DROP TABLE IF EXISTS guzergah_atama_gecmisi;
