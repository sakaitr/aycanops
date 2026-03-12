-- Migration 015: Add route_id and sort_order to company_vehicles
-- MariaDB 10.0+ / MySQL 8+ native IF NOT EXISTS syntax
ALTER TABLE company_vehicles
  ADD COLUMN IF NOT EXISTS route_id VARCHAR(36) NULL AFTER driver_name,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0 AFTER route_id;

CREATE INDEX IF NOT EXISTS idx_cv_company_sort ON company_vehicles (company_id, sort_order);
