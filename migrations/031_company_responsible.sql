-- 031: company_responsible pivot table (bir firmaya birden fazla yetkili)
CREATE TABLE IF NOT EXISTS company_responsible (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  UNIQUE KEY uq_company_user (company_id, user_id),
  KEY idx_cr_company (company_id),
  KEY idx_cr_user (user_id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Collation uyumsuzluğunu gider (tablo zaten varsa)
ALTER TABLE company_responsible CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Mevcut responsible_id değerlerini pivot tabloya aktar
INSERT IGNORE INTO company_responsible (id, company_id, user_id, created_at)
SELECT UUID(), id, responsible_id, created_at
FROM companies
WHERE responsible_id IS NOT NULL AND is_active = 1;
