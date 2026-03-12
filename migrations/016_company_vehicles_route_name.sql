-- Migration 016: Add route_name text column to company_vehicles
-- Route is now stored as free-text directly on the vehicle (no FK to routes table).
ALTER TABLE company_vehicles ADD COLUMN IF NOT EXISTS route_name VARCHAR(255) DEFAULT NULL;

-- Migrate existing route names from the routes table
UPDATE company_vehicles cv
  JOIN routes r ON r.id = cv.route_id
SET cv.route_name = r.name
WHERE cv.route_id IS NOT NULL AND cv.route_name IS NULL;
