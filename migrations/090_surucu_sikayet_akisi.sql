-- Migration: 090_surucu_sikayet_akisi
-- Açıklama: Portal'dan (firma) gelen sürücü şikayetlerinin İK tarafından
-- değerlendirilip sicile işlenmesi akışı. Ayrıca driver_records'ı gerçek
-- sürücü kaydına (drivers.id) bağlıyoruz — şu ana kadar sadece isim
-- string'i tutuluyordu, yazım farkı olan aynı sürücü ayrı sayılıyordu.

ALTER TABLE portal_tickets
  ADD COLUMN IF NOT EXISTS kategori ENUM('genel','surucu_sikayeti') NOT NULL DEFAULT 'genel' AFTER icerik,
  ADD COLUMN IF NOT EXISTS driver_name VARCHAR(255) NULL AFTER kategori,
  ADD COLUMN IF NOT EXISTS driver_id CHAR(36) NULL AFTER driver_name,
  ADD COLUMN IF NOT EXISTS vehicle_id CHAR(36) NULL AFTER driver_id,
  ADD COLUMN IF NOT EXISTS incident_date VARCHAR(10) NULL AFTER vehicle_id,
  ADD COLUMN IF NOT EXISTS eval_durum ENUM('bekliyor','sicile_islendi','reddedildi') NULL AFTER incident_date,
  ADD COLUMN IF NOT EXISTS eval_note TEXT NULL AFTER eval_durum,
  ADD COLUMN IF NOT EXISTS eval_by CHAR(36) NULL AFTER eval_note,
  ADD COLUMN IF NOT EXISTS eval_at VARCHAR(30) NULL AFTER eval_by,
  ADD COLUMN IF NOT EXISTS driver_record_id CHAR(36) NULL AFTER eval_at,
  ADD INDEX IF NOT EXISTS idx_portal_tickets_kategori (kategori),
  ADD INDEX IF NOT EXISTS idx_portal_tickets_driver (driver_id);

ALTER TABLE driver_records
  ADD COLUMN IF NOT EXISTS driver_id CHAR(36) NULL AFTER driver_name,
  ADD INDEX IF NOT EXISTS idx_driver_records_driver_id (driver_id);

-- Mevcut kayıtları isim üzerinden geriye dönük eşleştir (tek eşleşme varsa)
UPDATE driver_records dr
JOIN drivers d ON d.name = dr.driver_name
SET dr.driver_id = d.id
WHERE dr.driver_id IS NULL;
