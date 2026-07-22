-- İzin onaylayıcı flag: users tablosuna
ALTER TABLE users ADD COLUMN IF NOT EXISTS izin_onaylayici TINYINT(1) NOT NULL DEFAULT 0;

-- İzin türleri
CREATE TABLE IF NOT EXISTS izin_turleri (
  id CHAR(36) NOT NULL PRIMARY KEY,
  ad VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Varsayılan türler
INSERT IGNORE INTO izin_turleri (id, ad, created_at) VALUES
  (UUID(), 'Yıllık İzin',    NOW()),
  (UUID(), 'Mazeret İzni',   NOW()),
  (UUID(), 'Hastalık İzni',  NOW()),
  (UUID(), 'Ücretsiz İzin',  NOW()),
  (UUID(), 'Doğum İzni',     NOW()),
  (UUID(), 'Ölüm İzni',      NOW());

-- İzin talepleri
CREATE TABLE IF NOT EXISTS izin_talepleri (
  id           CHAR(36) NOT NULL PRIMARY KEY,
  user_id      CHAR(36) NOT NULL,
  tur_id       CHAR(36) NOT NULL,
  baslangic    DATE NOT NULL,
  bitis        DATE NOT NULL,
  gun_sayisi   SMALLINT NOT NULL DEFAULT 1,
  aciklama     TEXT,
  belge_url    VARCHAR(500),
  durum        ENUM('bekliyor','onaylandi','reddedildi') NOT NULL DEFAULT 'bekliyor',
  onaylayan_id CHAR(36),
  onay_notu    TEXT,
  onay_tarihi  VARCHAR(30),
  created_at   VARCHAR(30) NOT NULL,
  updated_at   VARCHAR(30) NOT NULL,
  FOREIGN KEY (user_id)      REFERENCES users(id),
  FOREIGN KEY (tur_id)       REFERENCES izin_turleri(id),
  FOREIGN KEY (onaylayan_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
