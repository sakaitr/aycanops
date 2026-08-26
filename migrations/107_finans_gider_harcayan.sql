-- Gideri sisteme girenden ayrı olarak, harcamayı fiilen yapan kişi de
-- kaydedilebilsin (created_by = sisteme giren, harcayan_id = parayı harcayan).
ALTER TABLE finans_gider
  ADD COLUMN IF NOT EXISTS harcayan_id VARCHAR(36) NULL AFTER created_by;
