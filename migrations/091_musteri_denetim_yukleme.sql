-- Migration: 091_musteri_denetim_yukleme
-- Açıklama: Müşteri portalından (firmanın kendi denetim ekibi) araç denetim
-- dosyası yükleme + iç panelde görüp üzerine kendi resmi denetimimizi
-- açabilme akışı.

CREATE TABLE IF NOT EXISTS customer_inspection_submissions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  company_vehicle_id CHAR(36) NULL,
  plate VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  inspection_date VARCHAR(10) NOT NULL,
  note TEXT NULL,
  status ENUM('yeni','incelendi') NOT NULL DEFAULT 'yeni',
  linked_inspection_id CHAR(36) NULL,
  created_by CHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_cis_company (company_id),
  INDEX idx_cis_plate (plate),
  INDEX idx_cis_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_inspection_files (
  id CHAR(36) NOT NULL PRIMARY KEY,
  submission_id CHAR(36) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  INDEX idx_cif_submission (submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS source_submission_id CHAR(36) NULL AFTER company_id,
  ADD INDEX IF NOT EXISTS idx_inspections_source_submission (source_submission_id);
