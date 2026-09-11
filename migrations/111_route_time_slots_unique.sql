-- Migration: 111_route_time_slots_unique
-- Tarih: 2026-09-11
-- Açıklama: route_time_slots'ta aynı güzergahta aynı isimde 2. bir AKTİF
--           vardiyayı engeller. Artık hareket_tipi çetele ve
--           route_supplier_prices'ı eşleştiriyor (bkz. migration 110) —
--           aynı isimde 2 vardiya olsaydı hangi tek'in kastedildiği
--           belirsizleşirdi. Silme soft-delete (is_active=0) olduğundan
--           düz UNIQUE(route_id, ad) silinmiş bir vardiyanın adının tekrar
--           kullanılmasını da engellerdi — bunun yerine sadece aktif
--           satırlarda benzersizlik uygulanır (pasif satırlarda ad_active
--           NULL, MySQL/MariaDB unique index'te NULL'lar birbirini
--           çakışmaz sayar). 2026-09-11 canlı kontrolde mevcut ihlal yok
--           (tablo boş).

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

ALTER TABLE route_time_slots
  ADD COLUMN IF NOT EXISTS ad_active VARCHAR(100)
    GENERATED ALWAYS AS (IF(is_active = 1, ad, NULL)) STORED;

ALTER TABLE route_time_slots
  ADD CONSTRAINT uq_route_time_slots_ad UNIQUE (route_id, ad_active);

SET foreign_key_checks = 1;

-- ROLLBACK
-- ALTER TABLE route_time_slots DROP CONSTRAINT uq_route_time_slots_ad;
-- ALTER TABLE route_time_slots DROP COLUMN ad_active;
