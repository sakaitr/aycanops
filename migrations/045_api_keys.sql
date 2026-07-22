-- 045_api_keys.sql
-- Public API anahtarları tablosu (v1 REST API erişimi için)

CREATE TABLE IF NOT EXISTS api_keys (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  user_id      CHAR(36)     NULL,
  name         VARCHAR(100) NOT NULL,               -- "Müşteri Portal", "ERP Entegrasyon" vb
  key_hash     CHAR(64)     NOT NULL,               -- SHA-256 hash of the key
  key_prefix   CHAR(8)      NOT NULL,               -- İlk 8 karakter (görüntüleme için)
  scopes       VARCHAR(255) NOT NULL DEFAULT 'read', -- space-separated: read write webhooks
  last_used_at VARCHAR(30)  NULL,
  expires_at   VARCHAR(30)  NULL,                   -- NULL = never expires
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   VARCHAR(30)  NOT NULL,
  updated_at   VARCHAR(30)  NOT NULL,
  UNIQUE KEY uq_ak_key_hash (key_hash),
  INDEX idx_ak_user_id   (user_id),
  INDEX idx_ak_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
