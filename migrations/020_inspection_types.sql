SET NAMES utf8mb4;

-- Denetim türleri
CREATE TABLE IF NOT EXISTS config_inspection_types (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  code       VARCHAR(50)  NOT NULL UNIQUE,
  label      VARCHAR(255) NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at VARCHAR(30)  NOT NULL,
  updated_at VARCHAR(30)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Her denetim türüne ait kriterler
CREATE TABLE IF NOT EXISTS config_inspection_criteria (
  id                   CHAR(36)     NOT NULL PRIMARY KEY,
  inspection_type_id   CHAR(36)     NOT NULL,
  label                VARCHAR(255) NOT NULL,
  sort_order           INT          NOT NULL DEFAULT 0,
  is_active            TINYINT(1)   NOT NULL DEFAULT 1,
  created_at           VARCHAR(30)  NOT NULL,
  updated_at           VARCHAR(30)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_insp_criteria_type ON config_inspection_criteria(inspection_type_id);

-- Mevcut 4 türü seed et
INSERT IGNORE INTO config_inspection_types (id, code, label, sort_order, is_active, created_at, updated_at) VALUES
  ('00000001-0000-0000-0000-000000000001', 'routine',   'Rutin',         0, 1, NOW(), NOW()),
  ('00000001-0000-0000-0000-000000000002', 'pre_trip',  'Sefer Öncesi',  1, 1, NOW(), NOW()),
  ('00000001-0000-0000-0000-000000000003', 'complaint', 'Şikayet',       2, 1, NOW(), NOW()),
  ('00000001-0000-0000-0000-000000000004', 'periodic',  'Periyodik',     3, 1, NOW(), NOW());

-- Rutin için varsayılan kriterler
INSERT IGNORE INTO config_inspection_criteria (id, inspection_type_id, label, sort_order, is_active, created_at, updated_at) VALUES
  ('00000002-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000001', 'Lastikler',         0, 1, NOW(), NOW()),
  ('00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', 'Frenler',           1, 1, NOW(), NOW()),
  ('00000002-0000-0000-0000-000000000003', '00000001-0000-0000-0000-000000000001', 'Lambalar',          2, 1, NOW(), NOW()),
  ('00000002-0000-0000-0000-000000000004', '00000001-0000-0000-0000-000000000001', 'Cam silecekleri',   3, 1, NOW(), NOW()),
  ('00000002-0000-0000-0000-000000000005', '00000001-0000-0000-0000-000000000001', 'Evrak / ruhsat',    4, 1, NOW(), NOW()),
  ('00000002-0000-0000-0000-000000000006', '00000001-0000-0000-0000-000000000001', 'İlk yardım kiti',  5, 1, NOW(), NOW()),
  ('00000002-0000-0000-0000-000000000007', '00000001-0000-0000-0000-000000000001', 'Yangın tüpü',      6, 1, NOW(), NOW()),
  ('00000002-0000-0000-0000-000000000008', '00000001-0000-0000-0000-000000000001', 'Temizlik',          7, 1, NOW(), NOW());

-- Sefer Öncesi için kriterler
INSERT IGNORE INTO config_inspection_criteria (id, inspection_type_id, label, sort_order, is_active, created_at, updated_at) VALUES
  ('00000003-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000002', 'Lastikler',         0, 1, NOW(), NOW()),
  ('00000003-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000002', 'Frenler',           1, 1, NOW(), NOW()),
  ('00000003-0000-0000-0000-000000000003', '00000001-0000-0000-0000-000000000002', 'Lambalar',          2, 1, NOW(), NOW()),
  ('00000003-0000-0000-0000-000000000004', '00000001-0000-0000-0000-000000000002', 'Yakıt seviyesi',    3, 1, NOW(), NOW()),
  ('00000003-0000-0000-0000-000000000005', '00000001-0000-0000-0000-000000000002', 'Evrak / ruhsat',    4, 1, NOW(), NOW()),
  ('00000003-0000-0000-0000-000000000006', '00000001-0000-0000-0000-000000000002', 'İlk yardım kiti',  5, 1, NOW(), NOW()),
  ('00000003-0000-0000-0000-000000000007', '00000001-0000-0000-0000-000000000002', 'Yangın tüpü',      6, 1, NOW(), NOW()),
  ('00000003-0000-0000-0000-000000000008', '00000001-0000-0000-0000-000000000002', 'Yolcu kapıları',    7, 1, NOW(), NOW());

-- Şikayet için kriterler
INSERT IGNORE INTO config_inspection_criteria (id, inspection_type_id, label, sort_order, is_active, created_at, updated_at) VALUES
  ('00000004-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000003', 'Şikayet konusu doğrulandı', 0, 1, NOW(), NOW()),
  ('00000004-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000003', 'Sürücü tutumu',             1, 1, NOW(), NOW()),
  ('00000004-0000-0000-0000-000000000003', '00000001-0000-0000-0000-000000000003', 'Araç temizliği',            2, 1, NOW(), NOW()),
  ('00000004-0000-0000-0000-000000000004', '00000001-0000-0000-0000-000000000003', 'Sefer düzeni',              3, 1, NOW(), NOW());

-- Periyodik için kriterler
INSERT IGNORE INTO config_inspection_criteria (id, inspection_type_id, label, sort_order, is_active, created_at, updated_at) VALUES
  ('00000005-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000004', 'Lastikler',         0, 1, NOW(), NOW()),
  ('00000005-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000004', 'Frenler',           1, 1, NOW(), NOW()),
  ('00000005-0000-0000-0000-000000000003', '00000001-0000-0000-0000-000000000004', 'Lambalar',          2, 1, NOW(), NOW()),
  ('00000005-0000-0000-0000-000000000004', '00000001-0000-0000-0000-000000000004', 'Cam silecekleri',   3, 1, NOW(), NOW()),
  ('00000005-0000-0000-0000-000000000005', '00000001-0000-0000-0000-000000000004', 'Yağ seviyesi',      4, 1, NOW(), NOW()),
  ('00000005-0000-0000-0000-000000000006', '00000001-0000-0000-0000-000000000004', 'Soğutma suyu',      5, 1, NOW(), NOW()),
  ('00000005-0000-0000-0000-000000000007', '00000001-0000-0000-0000-000000000004', 'Evrak / ruhsat',    6, 1, NOW(), NOW()),
  ('00000005-0000-0000-0000-000000000008', '00000001-0000-0000-0000-000000000004', 'İlk yardım kiti',  7, 1, NOW(), NOW()),
  ('00000005-0000-0000-0000-000000000009', '00000001-0000-0000-0000-000000000004', 'Yangın tüpü',      8, 1, NOW(), NOW()),
  ('00000005-0000-0000-0000-000000000010', '00000001-0000-0000-0000-000000000004', 'Temizlik',          9, 1, NOW(), NOW());
