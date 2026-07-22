-- 024: Add responsible_id to companies
ALTER TABLE companies ADD COLUMN responsible_id CHAR(36) NULL AFTER created_by;
ALTER TABLE companies ADD COLUMN sort_mode VARCHAR(10) NOT NULL DEFAULT 'manual' AFTER responsible_id;
