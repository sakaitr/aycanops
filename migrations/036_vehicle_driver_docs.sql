-- Driver credential structured columns on vehicles table
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS driver_license_class VARCHAR(10) DEFAULT NULL AFTER driver_phone,
  ADD COLUMN IF NOT EXISTS driver_license_expiry DATE DEFAULT NULL AFTER driver_license_class,
  ADD COLUMN IF NOT EXISTS driver_src_expiry DATE DEFAULT NULL AFTER driver_license_expiry,
  ADD COLUMN IF NOT EXISTS driver_psiko_expiry DATE DEFAULT NULL AFTER driver_src_expiry,
  ADD COLUMN IF NOT EXISTS driver_health_expiry DATE DEFAULT NULL AFTER driver_psiko_expiry,
  ADD COLUMN IF NOT EXISTS company_id CHAR(36) DEFAULT NULL AFTER status_code;
