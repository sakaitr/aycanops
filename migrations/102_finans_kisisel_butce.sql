-- Kişi bazlı aylık bütçe (patron mail'i, İSTENİLEN TALEPLER — "görevli
-- arkadaşlara aylık bütçe belirleyelim"). Sadece uyarı amaçlı, engelleme yok.
CREATE TABLE IF NOT EXISTS finans_kisisel_butce (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  ay VARCHAR(7) NOT NULL,
  tutar DECIMAL(14,2) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_fkb_user_ay (user_id, ay)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
