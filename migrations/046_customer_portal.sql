-- Müşteri Portal Kullanıcıları
CREATE TABLE IF NOT EXISTS customer_users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at VARCHAR(30) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_customer_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Müşteri Portal Oturumları
CREATE TABLE IF NOT EXISTS portal_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  customer_user_id CHAR(36) NOT NULL,
  expires_at VARCHAR(30) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  INDEX idx_portal_sessions_user (customer_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Müşteri Destek Talepleri
CREATE TABLE IF NOT EXISTS portal_tickets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  customer_user_id CHAR(36) NOT NULL,
  konu VARCHAR(255) NOT NULL,
  icerik TEXT NOT NULL,
  durum ENUM('acik','islemde','cozuldu','kapandi') NOT NULL DEFAULT 'acik',
  oncelik ENUM('dusuk','normal','yuksek','kritik') NOT NULL DEFAULT 'normal',
  assigned_to CHAR(36) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_portal_tickets_company (company_id),
  INDEX idx_portal_tickets_user (customer_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
