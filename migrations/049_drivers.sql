-- Migration 049: Sürücü (drivers) tablosu + araç geçmişi

CREATE TABLE IF NOT EXISTS drivers (
  id              CHAR(36)      NOT NULL,
  name            VARCHAR(255)  NOT NULL,
  phone           VARCHAR(50)   NULL,
  email           VARCHAR(255)  NULL,
  tc_no           VARCHAR(11)   NULL,
  birth_date      DATE          NULL,
  license_number  VARCHAR(50)   NULL,
  license_class   VARCHAR(10)   NULL,
  license_expiry  DATE          NULL,
  src_expiry      DATE          NULL,
  psiko_expiry    DATE          NULL,
  health_expiry   DATE          NULL,
  photo_url       TEXT          NULL,
  notes           TEXT          NULL,
  status          VARCHAR(20)   NOT NULL DEFAULT 'aktif',
  company_id      CHAR(36)      NULL,
  created_by      CHAR(36)      NULL,
  created_at      VARCHAR(30)   NOT NULL,
  updated_at      VARCHAR(30)   NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_driver_name    (name),
  INDEX idx_driver_company (company_id),
  INDEX idx_driver_status  (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Araç-sürücü atama geçmişi
CREATE TABLE IF NOT EXISTS driver_assignments (
  id             INT           NOT NULL AUTO_INCREMENT,
  vehicle_id     CHAR(36)      NOT NULL,
  driver_id      CHAR(36)      NOT NULL,
  assigned_at    VARCHAR(30)   NOT NULL,
  unassigned_at  VARCHAR(30)   NULL,
  note           VARCHAR(255)  NULL,
  created_by     CHAR(36)      NULL,
  PRIMARY KEY (id),
  INDEX idx_da_vehicle (vehicle_id),
  INDEX idx_da_driver  (driver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- vehicles tablosuna driver_id ekle (sürücü entity'sine FK)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS driver_id CHAR(36) NULL AFTER driver_health_expiry;

ALTER TABLE vehicles
  ADD INDEX IF NOT EXISTS idx_vehicle_driver_id (driver_id);
