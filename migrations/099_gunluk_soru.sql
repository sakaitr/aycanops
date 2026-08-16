CREATE TABLE IF NOT EXISTS gunluk_soru (
  id CHAR(36) NOT NULL PRIMARY KEY,
  label VARCHAR(500) NOT NULL,
  tip ENUM('evet_hayir','metin','uzun_metin','checklist','secim') NOT NULL DEFAULT 'evet_hayir',
  secenekler TEXT NULL,
  zorunlu TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_gunluk_soru_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
