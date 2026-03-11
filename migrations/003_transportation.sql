-- Araçlar (Vehicles)
CREATE TABLE IF NOT EXISTS vehicles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  plate VARCHAR(20) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL DEFAULT 'minibus',
  capacity INT NOT NULL DEFAULT 14,
  brand VARCHAR(100),
  model VARCHAR(100),
  year SMALLINT,
  driver_name VARCHAR(255),
  driver_phone VARCHAR(50),
  status_code VARCHAR(50) NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by CHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
);

-- Güzergahlar (Routes)
CREATE TABLE IF NOT EXISTS routes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  direction VARCHAR(20) NOT NULL DEFAULT 'both',
  morning_departure VARCHAR(5),
  morning_arrival VARCHAR(5),
  evening_departure VARCHAR(5),
  evening_arrival VARCHAR(5),
  stops_json TEXT,
  vehicle_id CHAR(36),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes TEXT,
  created_by CHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
);

-- Seferler (Trips - daily run records)
CREATE TABLE IF NOT EXISTS trips (
  id CHAR(36) NOT NULL PRIMARY KEY,
  trip_date VARCHAR(10) NOT NULL,
  route_id CHAR(36) NOT NULL,
  vehicle_id CHAR(36),
  direction VARCHAR(20) NOT NULL DEFAULT 'morning',
  planned_departure VARCHAR(5),
  actual_departure VARCHAR(5),
  planned_arrival VARCHAR(5),
  actual_arrival VARCHAR(5),
  passenger_count INT DEFAULT 0,
  status_code VARCHAR(50) NOT NULL DEFAULT 'planned',
  delay_minutes INT DEFAULT 0,
  notes TEXT,
  created_by CHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
);

-- Giriş Kontrolleri (Morning entry time checks)
CREATE TABLE IF NOT EXISTS entry_controls (
  id CHAR(36) NOT NULL PRIMARY KEY,
  control_date VARCHAR(10) NOT NULL,
  route_id CHAR(36) NOT NULL,
  trip_id CHAR(36),
  planned_time VARCHAR(5) NOT NULL,
  actual_time VARCHAR(5),
  delay_minutes INT DEFAULT 0,
  passenger_expected INT DEFAULT 0,
  passenger_actual INT DEFAULT 0,
  status_code VARCHAR(50) NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_by CHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
);

-- Araç Denetimleri (Vehicle inspections)
CREATE TABLE IF NOT EXISTS inspections (
  id CHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id CHAR(36) NOT NULL,
  inspection_date VARCHAR(10) NOT NULL,
  inspector_id CHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'routine',
  result VARCHAR(50) NOT NULL DEFAULT 'pending',
  checklist_json TEXT,
  notes TEXT,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
);
