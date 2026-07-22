-- 057: Route supplier, price history, price authority and vehicle assignment workflow

CREATE TABLE IF NOT EXISTS suppliers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  contact_name VARCHAR(150) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(150) NULL,
  tax_id VARCHAR(30) NULL,
  tax_office VARCHAR(150) NULL,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_suppliers_title (title),
  INDEX idx_suppliers_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_suppliers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  supplier_id CHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  created_by CHAR(36) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_company_supplier (company_id, supplier_id),
  INDEX idx_company_suppliers_company (company_id),
  INDEX idx_company_suppliers_supplier (supplier_id),
  CONSTRAINT fk_company_suppliers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_company_suppliers_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS route_supplier_prices (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  route_id CHAR(36) NOT NULL,
  supplier_id CHAR(36) NOT NULL,
  price_amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
  valid_from DATE NOT NULL,
  valid_to DATE NULL,
  source_request_id CHAR(36) NULL,
  created_by CHAR(36) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_route_supplier_prices_lookup (company_id, route_id, supplier_id, valid_from, valid_to),
  INDEX idx_route_supplier_prices_route (route_id),
  INDEX idx_route_supplier_prices_supplier (supplier_id),
  CONSTRAINT fk_route_supplier_prices_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_route_supplier_prices_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
  CONSTRAINT fk_route_supplier_prices_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS route_price_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  route_id CHAR(36) NOT NULL,
  supplier_id CHAR(36) NOT NULL,
  current_price_id CHAR(36) NULL,
  current_price_amount DECIMAL(12,2) NULL,
  requested_price_amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
  valid_from DATE NOT NULL,
  valid_to DATE NULL,
  reason TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_by CHAR(36) NOT NULL,
  decided_by CHAR(36) NULL,
  decided_at VARCHAR(30) NULL,
  decision_note TEXT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_route_price_requests_status (status),
  INDEX idx_route_price_requests_lookup (company_id, route_id, supplier_id),
  CONSTRAINT fk_route_price_requests_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_route_price_requests_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
  CONSTRAINT fk_route_price_requests_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS route_price_authorities (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  can_request TINYINT(1) NOT NULL DEFAULT 0,
  can_approve TINYINT(1) NOT NULL DEFAULT 0,
  updated_by CHAR(36) NULL,
  updated_at VARCHAR(30) NOT NULL,
  CONSTRAINT fk_route_price_authorities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS supplier_id CHAR(36) NULL AFTER id;
CREATE INDEX IF NOT EXISTS idx_vehicles_supplier ON vehicles(supplier_id);

ALTER TABLE routes ADD COLUMN IF NOT EXISTS supplier_id CHAR(36) NULL AFTER company_id;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS vehicle_assignment_status VARCHAR(20) NOT NULL DEFAULT 'fixed' AFTER vehicle_id;
CREATE INDEX IF NOT EXISTS idx_routes_supplier ON routes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_routes_vehicle_assignment_status ON routes(vehicle_assignment_status);

ALTER TABLE company_vehicles ADD COLUMN IF NOT EXISTS supplier_id CHAR(36) NULL AFTER company_id;
CREATE INDEX IF NOT EXISTS idx_company_vehicles_supplier ON company_vehicles(supplier_id);

ALTER TABLE open_routes ADD COLUMN IF NOT EXISTS route_id CHAR(36) NULL AFTER company_id;
ALTER TABLE open_routes ADD COLUMN IF NOT EXISTS supplier_id CHAR(36) NULL AFTER route_id;
ALTER TABLE open_routes ADD COLUMN IF NOT EXISTS vehicle_id CHAR(36) NULL AFTER supplier_id;
ALTER TABLE open_routes ADD COLUMN IF NOT EXISTS vehicle_assignment_status VARCHAR(20) NOT NULL DEFAULT 'searching' AFTER vehicle_id;
ALTER TABLE open_routes ADD COLUMN IF NOT EXISTS plate_note VARCHAR(50) NULL AFTER price;
CREATE INDEX IF NOT EXISTS idx_open_routes_route ON open_routes(route_id);
CREATE INDEX IF NOT EXISTS idx_open_routes_supplier ON open_routes(supplier_id);
