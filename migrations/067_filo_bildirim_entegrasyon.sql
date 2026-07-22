-- Migration: 067_filo_bildirim_entegrasyon
-- Tarih: 2026-07-06
-- Açıklama: Filo bildirimleri (sigorta bitiyor, lastik km aşımı) mevcut
--           notification_rules/notification_log altyapısına entegre edilir.
--           066'da ayrı bir tablo olarak kurulan filo_bildirim_ayar, mevcut
--           sistemi tekrarladığı için kaldırılır — km eşiği notification_rules'a
--           tek kolon olarak eklenir.

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

ALTER TABLE notification_rules ADD COLUMN IF NOT EXISTS km_esigi INT NULL AFTER days_before;

DROP TABLE IF EXISTS filo_bildirim_ayar;

-- Varsayılan filo bildirim kuralları
INSERT IGNORE INTO notification_rules (id, event_type, label, department_id, channel, days_before, km_esigi, is_active, created_at, updated_at) VALUES
  ('nrule-006-0000-0000-000000000006', 'sigorta_bitiyor', 'Araç sigortası 30 gün içinde bitiyor', 'dept-0001-0000-0000-000000000002', 'in_app', 30, NULL, 1, NOW(), NOW()),
  ('nrule-007-0000-0000-000000000007', 'lastik_km_asimi', 'Lastik değişim km eşiği aşıldı', 'dept-0001-0000-0000-000000000002', 'in_app', 0, 40000, 1, NOW(), NOW());

SET foreign_key_checks = 1;

-- ROLLBACK
-- DELETE FROM notification_rules WHERE id IN ('nrule-006-0000-0000-000000000006', 'nrule-007-0000-0000-000000000007');
-- ALTER TABLE notification_rules DROP COLUMN IF EXISTS km_esigi;
-- CREATE TABLE filo_bildirim_ayar (...); -- bkz. 066_filo_yonetimi.sql
