-- Migration: 110_route_supplier_prices_tek
-- Tarih: 2026-09-11
-- Açıklama: route_supplier_prices'a tek (vardiya+yön) bazlı fiyatlandırma
--           kolonları eklenir. NULL = genel (tüm vardiya/yönlere uygulanır,
--           mevcut fiyat kayıtlarının anlamı değişmez). Belirli bir tek için
--           fiyat tanımlanırsa, o tek için genel fiyatın önüne geçer.
--           hareket_tipi/yon aynı isimle cetele ve guzergah_atama_gecmisi'nde
--           zaten var, burada da aynı iki kolon (yeni kavram değil).

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

ALTER TABLE route_supplier_prices
  ADD COLUMN IF NOT EXISTS hareket_tipi VARCHAR(100) NULL AFTER plate,
  ADD COLUMN IF NOT EXISTS yon ENUM('giris','cikis') NULL AFTER hareket_tipi;

ALTER TABLE route_supplier_prices
  ADD INDEX IF NOT EXISTS idx_route_supplier_prices_tek (route_id, hareket_tipi, yon);

SET foreign_key_checks = 1;

-- ROLLBACK
-- ALTER TABLE route_supplier_prices DROP INDEX idx_route_supplier_prices_tek;
-- ALTER TABLE route_supplier_prices DROP COLUMN yon;
-- ALTER TABLE route_supplier_prices DROP COLUMN hareket_tipi;
