ALTER TABLE driver_evaluations
  ADD COLUMN IF NOT EXISTS driver_slug VARCHAR(100) DEFAULT NULL AFTER driver_name,
  ADD INDEX IF NOT EXISTS idx_driver_eval_slug (driver_slug);

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS company_slug VARCHAR(100) DEFAULT NULL AFTER name,
  ADD UNIQUE INDEX IF NOT EXISTS uq_companies_slug (company_slug);
