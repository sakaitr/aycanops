-- 030: Make inspections.vehicle_id nullable
-- company_vehicle based inspections don't always have a vehicles table entry
ALTER TABLE inspections MODIFY COLUMN vehicle_id CHAR(36) NULL;
