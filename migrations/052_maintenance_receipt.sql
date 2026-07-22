-- 052_maintenance_receipt.sql
-- Adds receipt_url to vehicle_maintenance for service receipt photos/links

ALTER TABLE vehicle_maintenance
  ADD COLUMN IF NOT EXISTS receipt_url VARCHAR(500) NULL AFTER notes;
