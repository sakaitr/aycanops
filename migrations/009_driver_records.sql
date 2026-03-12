-- Şöför Sicil Kayıtları (Driver Incident Records)
CREATE TABLE IF NOT EXISTS driver_records (
  id CHAR(36) NOT NULL PRIMARY KEY,
  driver_name VARCHAR(255) NOT NULL,
  vehicle_id CHAR(36),
  vehicle_plate VARCHAR(20),
  incident_date VARCHAR(10) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'diger',
  severity TINYINT NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  action_taken TEXT,
  reported_by CHAR(36),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX IF NOT EXISTS idx_driver_records_driver ON driver_records(driver_name);
CREATE INDEX IF NOT EXISTS idx_driver_records_vehicle ON driver_records(vehicle_id);
