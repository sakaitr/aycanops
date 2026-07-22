ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(20) NULL DEFAULT NULL COMMENT 'International format: 905XXXXXXXXX (no + prefix)';
