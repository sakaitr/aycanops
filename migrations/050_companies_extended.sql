-- 050: Firma genişletme (iletişim, vergi, sözleşme, sektör, web)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone VARCHAR(30) NULL AFTER notes;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email VARCHAR(150) NULL AFTER phone;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address TEXT NULL AFTER email;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_id VARCHAR(20) NULL AFTER address;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_office VARCHAR(100) NULL AFTER tax_id;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_start VARCHAR(10) NULL AFTER tax_office;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_end VARCHAR(10) NULL AFTER contract_start;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sector VARCHAR(100) NULL AFTER contract_end;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website VARCHAR(255) NULL AFTER sector;
