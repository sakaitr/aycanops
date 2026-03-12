-- Şöför Değerlendirmeleri
CREATE TABLE IF NOT EXISTS driver_evaluations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  evaluation_date VARCHAR(10) NOT NULL,
  driver_name VARCHAR(255) NOT NULL,
  plate VARCHAR(20) NOT NULL,
  vehicle_info VARCHAR(255),
  route_text TEXT,
  company_id CHAR(36),
  score_punctuality TINYINT NOT NULL DEFAULT 3,
  score_driving TINYINT NOT NULL DEFAULT 3,
  score_communication TINYINT NOT NULL DEFAULT 3,
  score_cleanliness TINYINT NOT NULL DEFAULT 3,
  score_route_compliance TINYINT NOT NULL DEFAULT 3,
  score_appearance TINYINT NOT NULL DEFAULT 3,
  notes TEXT,
  created_by CHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
