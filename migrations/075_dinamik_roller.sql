-- Roller artık koda gömülü değil, veritabanında tanımlı ve düzenlenebilir.
CREATE TABLE IF NOT EXISTS roles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  hierarchy_level INT NOT NULL DEFAULT 0,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_name VARCHAR(50) NOT NULL,
  permission_key VARCHAR(100) NOT NULL,
  PRIMARY KEY (role_name, permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- users.role sütunundaki sabit CHECK constraint'i kaldır (bu ortamda DROP CHECK/DROP
-- CONSTRAINT söz dizimi güvenilir çalışmıyor — bkz. migrations/073, aynı sorun daha
-- önce suggestions.status'ta yaşandı). Constraint'siz yeni bir sütunla değiştirip
-- eskisini silmek, motoru/proxy'yi hiç DROP CHECK ile uğraştırmadan aynı sonucu verir.
ALTER TABLE users ADD COLUMN role_tmp VARCHAR(50) NULL;
UPDATE users SET role_tmp = role;
ALTER TABLE users DROP COLUMN role;
ALTER TABLE users CHANGE role_tmp role VARCHAR(50) NOT NULL;
