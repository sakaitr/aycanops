-- Add company_vehicle_id to inspections for company vehicles tracking
ALTER TABLE inspections ADD COLUMN company_vehicle_id CHAR(36);
ALTER TABLE inspections ADD COLUMN company_vehicle_plate VARCHAR(20);
