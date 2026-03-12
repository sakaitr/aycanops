-- Migration 015: Add route_id and sort_order to company_vehicles
ALTER TABLE company_vehicles
  ADD COLUMN route_id VARCHAR(36) NULL AFTER driver_name,
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER route_id;

CREATE INDEX idx_cv_company_sort ON company_vehicles (company_id, sort_order);
