-- Migration: 093_musteri_coklu_firma
-- Açıklama: Portal kullanıcılarına birden fazla firma atanabilsin diye.
-- customer_users.company_id kolonu bozulmadan kalır (varsayılan/ilk firma
-- referansı olarak) — geriye dönük uyumluluk için. Asıl çoklu ilişki
-- customer_user_companies junction tablosunda tutulur. Oturumda "aktif
-- firma" (active_company_id) tutularak kullanıcı firmalar arası geçiş
-- yapabilir — mevcut tüm portal API'leri zaten portalUser.company_id
-- okuyor, o artık "şu an seçili firma" anlamına gelir, API'lerde değişiklik
-- gerekmez.

CREATE TABLE IF NOT EXISTS customer_user_companies (
  customer_user_id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  PRIMARY KEY (customer_user_id, company_id),
  INDEX idx_cuc_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO customer_user_companies (customer_user_id, company_id, created_at)
SELECT id, company_id, created_at FROM customer_users;

ALTER TABLE portal_sessions
  ADD COLUMN IF NOT EXISTS active_company_id CHAR(36) NULL AFTER customer_user_id;
