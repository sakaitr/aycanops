-- 055_mvp4_gps_route_plans.sql
-- MVP-4 GPS/Arvento omurgası + route plan versiyonlama/geri alma temeli

CREATE TABLE IF NOT EXISTS route_plan_versions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  route_plan_id CHAR(36) NOT NULL,
  version_no INT NOT NULL,
  snapshot_json LONGTEXT NOT NULL,
  created_by CHAR(36) NULL,
  created_at VARCHAR(30) NOT NULL,
  KEY idx_route_plan_versions_plan (route_plan_id),
  UNIQUE KEY uq_route_plan_versions_plan_version (route_plan_id, version_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gps_providers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(120) NOT NULL,
  provider_type VARCHAR(50) NOT NULL DEFAULT 'polling',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  config_json LONGTEXT NULL,
  last_sync_at VARCHAR(30) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_gps_providers_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicle_gps_devices (
  id CHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id CHAR(36) NULL,
  provider_id CHAR(36) NOT NULL,
  external_vehicle_id VARCHAR(120) NOT NULL,
  imei VARCHAR(80) NULL,
  plate VARCHAR(20) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_seen_at VARCHAR(30) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_vehicle_gps_provider_external (provider_id, external_vehicle_id),
  KEY idx_vehicle_gps_vehicle (vehicle_id),
  KEY idx_vehicle_gps_plate (plate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicle_locations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id CHAR(36) NULL,
  device_id CHAR(36) NULL,
  provider_code VARCHAR(50) NOT NULL,
  external_vehicle_id VARCHAR(120) NULL,
  plate VARCHAR(20) NULL,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  speed DOUBLE NULL,
  heading DOUBLE NULL,
  ignition TINYINT(1) NULL,
  odometer DOUBLE NULL,
  address VARCHAR(500) NULL,
  raw_json LONGTEXT NULL,
  recorded_at VARCHAR(30) NOT NULL,
  received_at VARCHAR(30) NOT NULL,
  KEY idx_vehicle_locations_vehicle_time (vehicle_id, recorded_at),
  KEY idx_vehicle_locations_plate_time (plate, recorded_at),
  KEY idx_vehicle_locations_provider_time (provider_code, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicle_last_locations (
  vehicle_id CHAR(36) NOT NULL PRIMARY KEY,
  device_id CHAR(36) NULL,
  provider_code VARCHAR(50) NOT NULL,
  external_vehicle_id VARCHAR(120) NULL,
  plate VARCHAR(20) NULL,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  speed DOUBLE NULL,
  heading DOUBLE NULL,
  ignition TINYINT(1) NULL,
  odometer DOUBLE NULL,
  address VARCHAR(500) NULL,
  raw_json LONGTEXT NULL,
  recorded_at VARCHAR(30) NOT NULL,
  received_at VARCHAR(30) NOT NULL,
  KEY idx_vehicle_last_locations_recorded (recorded_at),
  KEY idx_vehicle_last_locations_plate (plate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gps_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id CHAR(36) NULL,
  provider_code VARCHAR(50) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  details_json LONGTEXT NULL,
  occurred_at VARCHAR(30) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  KEY idx_gps_events_vehicle_time (vehicle_id, occurred_at),
  KEY idx_gps_events_type_time (event_type, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS geofences (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NULL,
  route_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  fence_type VARCHAR(50) NOT NULL DEFAULT 'custom',
  center_lat DOUBLE NULL,
  center_lng DOUBLE NULL,
  radius_m INT NULL,
  polygon_json LONGTEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  KEY idx_geofences_company (company_id),
  KEY idx_geofences_route (route_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS route_adherence_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  route_plan_id CHAR(36) NULL,
  route_id CHAR(36) NULL,
  vehicle_id CHAR(36) NULL,
  event_type VARCHAR(80) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  distance_m INT NULL,
  duration_min INT NULL,
  details_json LONGTEXT NULL,
  detected_at VARCHAR(30) NOT NULL,
  resolved_at VARCHAR(30) NULL,
  created_at VARCHAR(30) NOT NULL,
  KEY idx_route_adherence_vehicle_time (vehicle_id, detected_at),
  KEY idx_route_adherence_route_time (route_id, detected_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
