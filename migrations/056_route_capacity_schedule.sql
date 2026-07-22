-- 056: Route capacity and schedule mode
ALTER TABLE routes ADD COLUMN IF NOT EXISTS capacity INT NULL AFTER direction;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS schedule_mode VARCHAR(20) NOT NULL DEFAULT 'fixed' AFTER capacity;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS shift_name VARCHAR(100) NULL AFTER schedule_mode;
