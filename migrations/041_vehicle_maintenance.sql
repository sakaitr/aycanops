-- 041: Vehicle maintenance records
-- Araç bakım kayıtları (yağ değişimi, lastik, fren, filtre, genel bakım vs.)

CREATE TABLE IF NOT EXISTS vehicle_maintenance (
  id                CHAR(36)       NOT NULL PRIMARY KEY,
  vehicle_id        CHAR(36)       NULL,
  plate             VARCHAR(20)    NOT NULL,
  company_id        CHAR(36)       NULL,
  type              VARCHAR(50)    NOT NULL DEFAULT 'general',
  maintenance_date  VARCHAR(10)    NOT NULL,
  km_at_service     INT            NULL,
  next_service_km   INT            NULL,
  next_service_date VARCHAR(10)    NULL,
  cost              DECIMAL(10,2)  NULL,
  technician        VARCHAR(255)   NULL,
  notes             TEXT           NULL,
  status            VARCHAR(20)    NOT NULL DEFAULT 'done',
  created_by        CHAR(36)       NULL,
  created_at        VARCHAR(30)    NOT NULL,
  updated_at        VARCHAR(30)    NOT NULL,
  CONSTRAINT fk_vm_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  CONSTRAINT fk_vm_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_vm_vehicle_id ON vehicle_maintenance(vehicle_id);
CREATE INDEX idx_vm_plate      ON vehicle_maintenance(plate);
CREATE INDEX idx_vm_date       ON vehicle_maintenance(maintenance_date);
