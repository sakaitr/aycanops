CREATE TABLE IF NOT EXISTS open_routes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  distance_km DECIMAL(8,2) NULL,
  duration_min INT NULL,
  price DECIMAL(10,2) NULL,
  notes TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  closed_at VARCHAR(30) NULL,
  created_by CHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_open_routes_company (company_id),
  INDEX idx_open_routes_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
