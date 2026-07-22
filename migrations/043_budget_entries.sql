-- Migration 043: budget_entries (Maliyet Analizi / Bütçe Modülü)

CREATE TABLE IF NOT EXISTS budget_entries (
  id              CHAR(36)       NOT NULL PRIMARY KEY,
  company_id      CHAR(36)       NULL,
  category        VARCHAR(50)    NOT NULL DEFAULT 'other',
  -- fuel | maintenance | salary | insurance | tax | rent | equipment | other
  period          VARCHAR(7)     NOT NULL, -- YYYY-MM
  budgeted_amount DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  notes           TEXT           NULL,
  created_by      CHAR(36)       NULL,
  created_at      VARCHAR(30)    NOT NULL,
  updated_at      VARCHAR(30)    NOT NULL,
  INDEX idx_be_company_id  (company_id),
  INDEX idx_be_period      (period),
  INDEX idx_be_category    (category),
  UNIQUE KEY uq_be_company_cat_period (company_id, category, period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
