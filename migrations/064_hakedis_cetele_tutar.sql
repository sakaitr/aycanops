-- Migration: 064_hakedis_cetele_tutar
-- Tarih: 2026-07-02
-- Açıklama: hakedis_cetele bağlantısına, o çetele kaydının hakediş oluşturulduğu
--           andaki hesaplanan tutarını (route_supplier_prices'tan çözümlenen
--           birim ücret) kalıcı olarak saklamak için tutar kolonu eklenir.
--           Böylece bir araca çeteleden işlenen iş, hakedişe otomatik yansır
--           ve sonradan fiyat değişse bile geçmiş hakediş kaydı değişmez.

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

ALTER TABLE hakedis_cetele ADD COLUMN IF NOT EXISTS tutar DECIMAL(12,2) DEFAULT 0 AFTER cetele_id;

SET foreign_key_checks = 1;

-- ROLLBACK
-- ALTER TABLE hakedis_cetele DROP COLUMN IF EXISTS tutar;
