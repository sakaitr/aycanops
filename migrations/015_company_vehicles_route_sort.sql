-- Migration 015: Add route_id and sort_order to company_vehicles (MySQL 5.7+ compatible)

SET @s = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_vehicles' AND COLUMN_NAME = 'route_id') > 0,
  'SELECT 1',
  'ALTER TABLE company_vehicles ADD COLUMN route_id VARCHAR(36) NULL AFTER driver_name'
));
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_vehicles' AND COLUMN_NAME = 'sort_order') > 0,
  'SELECT 1',
  'ALTER TABLE company_vehicles ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER route_id'
));
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_vehicles' AND INDEX_NAME = 'idx_cv_company_sort') > 0,
  'SELECT 1',
  'ALTER TABLE company_vehicles ADD INDEX idx_cv_company_sort (company_id, sort_order)'
));
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
