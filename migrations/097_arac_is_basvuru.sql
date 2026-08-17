CREATE TABLE IF NOT EXISTS arac_is_basvuru (
  id VARCHAR(36) PRIMARY KEY,
  plaka VARCHAR(20) NULL,
  sofor_adi VARCHAR(200) NULL,
  telefon VARCHAR(30) NULL,
  semt VARCHAR(200) NULL,
  bos_saat VARCHAR(200) NULL,
  uygun_guzergahlar TEXT NULL,
  notlar TEXT NULL,
  durum ENUM('yeni','gorusuldu','olumlu','olumsuz','ise_alindi') NOT NULL DEFAULT 'yeni',
  created_by VARCHAR(36) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_basvuru_durum (durum),
  INDEX idx_basvuru_plaka (plaka),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
