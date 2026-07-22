-- 047: Add vehicle_id FK to company_vehicles (link to central vehicles registry)
-- Also widen vehicle_arrivals.shift from VARCHAR(10) to VARCHAR(100) for custom shift names

ALTER TABLE company_vehicles
  ADD COLUMN IF NOT EXISTS vehicle_id CHAR(36) NULL;

-- Backfill: match existing company_vehicles rows to vehicles by plate
UPDATE company_vehicles cv
JOIN vehicles v ON v.plate = cv.plate
SET cv.vehicle_id = v.id
WHERE cv.vehicle_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_vehicle_id ON company_vehicles(vehicle_id);

-- Widen shift column so custom shift names (up to 100 chars) can be stored
ALTER TABLE vehicle_arrivals MODIFY COLUMN shift VARCHAR(100) NOT NULL DEFAULT 'sabah';
