-- Add company_id, driver_name, driver_phone to routes table
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS company_id CHAR(36) DEFAULT NULL AFTER vehicle_id,
  ADD COLUMN IF NOT EXISTS driver_name VARCHAR(255) DEFAULT NULL AFTER company_id,
  ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(50) DEFAULT NULL AFTER driver_name;
