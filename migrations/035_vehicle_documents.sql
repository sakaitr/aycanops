-- Vehicle documents: inspection, insurance, registration, photos, maintenance history
CREATE TABLE IF NOT EXISTS vehicle_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_id CHAR(36) NOT NULL,
  doc_type VARCHAR(50) NOT NULL,
  doc_label VARCHAR(200),
  expiry_date DATE,
  file_url TEXT,
  notes TEXT,
  created_by CHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vd_vehicle (vehicle_id),
  INDEX idx_vd_creator (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
