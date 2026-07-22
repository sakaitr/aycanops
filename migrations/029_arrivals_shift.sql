-- 029: Add shift column to vehicle_arrivals, change UNIQUE to (vehicle_id, arrival_date, shift)
-- MariaDB: inline UNIQUE in CREATE TABLE is named after the first column → 'vehicle_id'

ALTER TABLE vehicle_arrivals
  ADD COLUMN IF NOT EXISTS shift VARCHAR(10) NOT NULL DEFAULT 'sabah' AFTER arrival_date;

ALTER TABLE vehicle_arrivals DROP INDEX IF EXISTS vehicle_id;

ALTER TABLE vehicle_arrivals
  ADD UNIQUE INDEX IF NOT EXISTS uq_vehicle_date_shift (vehicle_id, arrival_date, shift);
