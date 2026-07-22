CREATE TABLE IF NOT EXISTS inspection_photos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  inspection_id CHAR(36) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  created_by CHAR(36) NULL,
  created_at VARCHAR(30) NOT NULL,
  INDEX idx_inspection_photos_inspection (inspection_id),
  INDEX idx_inspection_photos_created_at (created_at),
  CONSTRAINT fk_inspection_photos_inspection FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
