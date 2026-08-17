-- Firma bazlı denetim şablonları — patron/portal geri bildirimi: "EAE'nin
-- kendi maddeleri olsun". NULL = herkese açık global şablon (mevcut
-- davranış), dolu = sadece o firmaya özel.
ALTER TABLE config_inspection_types
  ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL AFTER code,
  ADD INDEX IF NOT EXISTS idx_config_inspection_types_company (company_id);
