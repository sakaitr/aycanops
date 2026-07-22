-- 044_passengers.sql
-- Yolcu/personel kayıt tablosu
-- Şirkete bağlı yolcular (yönetim, servis personeli, düzenli yolcular)

CREATE TABLE IF NOT EXISTS passengers (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  company_id   CHAR(36)     NULL,
  full_name    VARCHAR(150) NOT NULL,
  phone        VARCHAR(30)  NULL,
  email        VARCHAR(150) NULL,
  id_number    VARCHAR(30)  NULL,          -- TC Kimlik / Pasaport
  type         VARCHAR(20)  NOT NULL DEFAULT 'yolcu',  -- yolcu | personel | musteri
  pickup_address TEXT        NULL,
  dropoff_address TEXT       NULL,
  notes        TEXT         NULL,
  status       VARCHAR(20)  NOT NULL DEFAULT 'aktif',  -- aktif | pasif
  created_by   CHAR(36)     NULL,
  created_at   VARCHAR(30)  NOT NULL,
  updated_at   VARCHAR(30)  NOT NULL,
  INDEX idx_pass_company_id (company_id),
  INDEX idx_pass_type       (type),
  INDEX idx_pass_status     (status),
  INDEX idx_pass_full_name  (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
