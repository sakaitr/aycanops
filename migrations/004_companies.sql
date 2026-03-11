-- Firmalar (Companies)
CREATE TABLE IF NOT EXISTS companies (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  notes TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
);

-- Firma Araçları (Company Vehicles)
CREATE TABLE IF NOT EXISTS company_vehicles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  plate VARCHAR(20) NOT NULL,
  notes TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  UNIQUE(company_id, plate)
);

-- Araç Gelişleri (Vehicle Arrivals)
CREATE TABLE IF NOT EXISTS vehicle_arrivals (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  vehicle_id CHAR(36) NOT NULL,
  arrival_date VARCHAR(10) NOT NULL,
  arrived_at VARCHAR(30) NOT NULL,
  recorded_by CHAR(36) NOT NULL,
  latitude DOUBLE,
  longitude DOUBLE,
  created_at VARCHAR(30) NOT NULL,
  UNIQUE(vehicle_id, arrival_date)
);
