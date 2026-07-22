-- 054_import_bulk_map.sql
-- MVP-2 import/toplu işlem job altyapısı + MVP-3 geocode/route plan omurgası

CREATE TABLE IF NOT EXISTS import_templates (
  id CHAR(36) NOT NULL PRIMARY KEY,
  module VARCHAR(50) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  columns_json LONGTEXT NOT NULL,
  sample_json LONGTEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_import_templates_module_version (module, version),
  KEY idx_import_templates_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  module VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'uploaded',
  file_name VARCHAR(255) NULL,
  total_rows INT NOT NULL DEFAULT 0,
  valid_rows INT NOT NULL DEFAULT 0,
  warning_rows INT NOT NULL DEFAULT 0,
  error_rows INT NOT NULL DEFAULT 0,
  inserted_rows INT NOT NULL DEFAULT 0,
  updated_rows INT NOT NULL DEFAULT 0,
  skipped_rows INT NOT NULL DEFAULT 0,
  created_by CHAR(36) NULL,
  approved_by CHAR(36) NULL,
  executed_at VARCHAR(30) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  KEY idx_import_jobs_module (module),
  KEY idx_import_jobs_status (status),
  KEY idx_import_jobs_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_job_rows (
  id CHAR(36) NOT NULL PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  row_no INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  raw_json LONGTEXT NOT NULL,
  normalized_json LONGTEXT NULL,
  errors_json LONGTEXT NULL,
  warnings_json LONGTEXT NULL,
  target_id CHAR(36) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  KEY idx_import_job_rows_job (job_id),
  KEY idx_import_job_rows_status (status),
  UNIQUE KEY uq_import_job_rows_job_row (job_id, row_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bulk_action_jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  module VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'preview',
  selected_ids LONGTEXT NULL,
  filter_json LONGTEXT NULL,
  payload_json LONGTEXT NULL,
  total_items INT NOT NULL DEFAULT 0,
  success_items INT NOT NULL DEFAULT 0,
  error_items INT NOT NULL DEFAULT 0,
  created_by CHAR(36) NULL,
  approved_by CHAR(36) NULL,
  executed_at VARCHAR(30) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  KEY idx_bulk_action_jobs_module (module),
  KEY idx_bulk_action_jobs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bulk_action_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  record_id CHAR(36) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  before_json LONGTEXT NULL,
  after_json LONGTEXT NULL,
  error_message TEXT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  KEY idx_bulk_action_items_job (job_id),
  KEY idx_bulk_action_items_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS geocode_cache (
  id CHAR(36) NOT NULL PRIMARY KEY,
  query_text TEXT NOT NULL,
  normalized_query VARCHAR(500) NOT NULL,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'nominatim',
  confidence DOUBLE NULL,
  raw_response LONGTEXT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_geocode_cache_norm_provider (normalized_query, provider),
  KEY idx_geocode_cache_norm (normalized_query)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS route_plans (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NULL,
  shift_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  direction VARCHAR(20) NOT NULL DEFAULT 'morning',
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  version_no INT NOT NULL DEFAULT 1,
  metrics_json LONGTEXT NULL,
  created_by CHAR(36) NULL,
  published_by CHAR(36) NULL,
  published_at VARCHAR(30) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  KEY idx_route_plans_company (company_id),
  KEY idx_route_plans_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS route_plan_routes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  route_plan_id CHAR(36) NOT NULL,
  route_id CHAR(36) NULL,
  vehicle_id CHAR(36) NULL,
  driver_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(20) NULL,
  route_order INT NOT NULL DEFAULT 0,
  geometry_json LONGTEXT NULL,
  metrics_json LONGTEXT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  KEY idx_route_plan_routes_plan (route_plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS route_plan_stops (
  id CHAR(36) NOT NULL PRIMARY KEY,
  route_plan_route_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  lat DOUBLE NULL,
  lng DOUBLE NULL,
  stop_order INT NOT NULL DEFAULT 0,
  locked TINYINT(1) NOT NULL DEFAULT 0,
  assigned_passenger_count INT NOT NULL DEFAULT 0,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  KEY idx_route_plan_stops_route (route_plan_route_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS route_plan_assignments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  route_plan_stop_id CHAR(36) NOT NULL,
  passenger_id CHAR(36) NOT NULL,
  walking_distance_m INT NULL,
  created_at VARCHAR(30) NOT NULL,
  KEY idx_route_plan_assignments_stop (route_plan_stop_id),
  KEY idx_route_plan_assignments_passenger (passenger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
