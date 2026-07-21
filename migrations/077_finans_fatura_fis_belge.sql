-- Migration: 077_finans_fatura_fis_belge
-- Finans modülü Faz 2: belge türü (Faz 1'den taşındı), fatura + kalemi, fiş,
-- belge, ödeme + fatura eşleştirme, banka hareketi.

CREATE TABLE IF NOT EXISTS finans_belge_turu (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  ad VARCHAR(100) NOT NULL,
  numara_serisi_prefix VARCHAR(20),
  sonraki_numara INT NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(36),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_fatura (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  tur ENUM('satis','alis') NOT NULL,
  durum ENUM('taslak','onay_bekliyor','onaylandi','muhasebelesti','iptal') NOT NULL DEFAULT 'taslak',
  fatura_no VARCHAR(50),
  belge_turu_id VARCHAR(36) NULL,
  cari_tip ENUM('musteri','tedarikci') NOT NULL,
  cari_id VARCHAR(36) NOT NULL,
  tarih DATE NOT NULL,
  vade_tarihi DATE NULL,
  para_birimi_kod VARCHAR(10) NOT NULL DEFAULT 'TRY',
  kur DECIMAL(12,6) NOT NULL DEFAULT 1,
  ara_toplam DECIMAL(14,2) NOT NULL DEFAULT 0,
  vergi_toplam DECIMAL(14,2) NOT NULL DEFAULT 0,
  genel_toplam DECIMAL(14,2) NOT NULL DEFAULT 0,
  odeme_durumu ENUM('odenmedi','kismen_odendi','odendi','fazla_odendi') NOT NULL DEFAULT 'odenmedi',
  iliskili_fatura_id VARCHAR(36) NULL,
  tekrarlama_json TEXT,
  aciklama TEXT,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_fatura_tur_durum (tur, durum),
  INDEX idx_fatura_cari (cari_id),
  INDEX idx_fatura_tarih (tarih),
  FOREIGN KEY (belge_turu_id) REFERENCES finans_belge_turu(id) ON DELETE SET NULL,
  FOREIGN KEY (iliskili_fatura_id) REFERENCES finans_fatura(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_fatura_kalemi (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  fatura_id VARCHAR(36) NOT NULL,
  urun_hizmet_adi VARCHAR(300) NOT NULL,
  miktar DECIMAL(10,2) NOT NULL DEFAULT 1,
  birim_fiyat DECIMAL(14,2) NOT NULL DEFAULT 0,
  vergi_kodu_id VARCHAR(36) NULL,
  tutar DECIMAL(14,2) NOT NULL DEFAULT 0,
  masraf_merkezi_id VARCHAR(36) NULL,
  proje_id VARCHAR(36) NULL,
  department_id VARCHAR(36) NULL,
  INDEX idx_kalem_fatura (fatura_id),
  FOREIGN KEY (fatura_id) REFERENCES finans_fatura(id) ON DELETE CASCADE,
  FOREIGN KEY (vergi_kodu_id) REFERENCES finans_vergi_kodu(id) ON DELETE SET NULL,
  FOREIGN KEY (masraf_merkezi_id) REFERENCES finans_masraf_merkezi(id) ON DELETE SET NULL,
  FOREIGN KEY (proje_id) REFERENCES finans_proje(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_belge (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  dosya_adi VARCHAR(255) NOT NULL,
  dosya_yolu VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  boyut_bayt INT NOT NULL,
  dosya_hash CHAR(64) NOT NULL,
  ocr_tarih DATE NULL,
  ocr_tutar DECIMAL(14,2) NULL,
  ocr_firma VARCHAR(300) NULL,
  ocr_vergi_no VARCHAR(50) NULL,
  ocr_belge_no VARCHAR(100) NULL,
  yorum_json TEXT,
  versiyon INT NOT NULL DEFAULT 1,
  iliskili_tip ENUM('fatura','fis','gelir_gider','masraf_talebi') NULL,
  iliskili_id VARCHAR(36) NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  INDEX idx_belge_hash (dosya_hash),
  INDEX idx_belge_iliskili (iliskili_tip, iliskili_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_fis (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  tip ENUM('gider_fisi','tahsilat_makbuzu','tediye_makbuzu','kasa_giris','kasa_cikis',
           'banka_islem','virman','mahsup','acilis_kapanis','personel_masraf') NOT NULL,
  tarih DATE NOT NULL,
  tutar DECIMAL(14,2) NOT NULL,
  kasa_banka_hesabi_id VARCHAR(36) NULL,
  karsi_hesap_id VARCHAR(36) NULL,
  belge_id VARCHAR(36) NULL,
  aciklama TEXT,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_fis_tip_tarih (tip, tarih),
  FOREIGN KEY (kasa_banka_hesabi_id) REFERENCES finans_kasa_banka_hesabi(id) ON DELETE SET NULL,
  FOREIGN KEY (karsi_hesap_id) REFERENCES finans_kasa_banka_hesabi(id) ON DELETE SET NULL,
  FOREIGN KEY (belge_id) REFERENCES finans_belge(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_odeme (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  tutar DECIMAL(14,2) NOT NULL,
  tarih DATE NOT NULL,
  kasa_banka_hesabi_id VARCHAR(36) NOT NULL,
  odeme_yontemi_id VARCHAR(36) NULL,
  cari_tip ENUM('musteri','tedarikci') NOT NULL,
  cari_id VARCHAR(36) NOT NULL,
  aciklama TEXT,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  INDEX idx_odeme_cari (cari_id),
  INDEX idx_odeme_tarih (tarih),
  FOREIGN KEY (kasa_banka_hesabi_id) REFERENCES finans_kasa_banka_hesabi(id),
  FOREIGN KEY (odeme_yontemi_id) REFERENCES finans_odeme_yontemi(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_odeme_fatura (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  odeme_id VARCHAR(36) NOT NULL,
  fatura_id VARCHAR(36) NOT NULL,
  tutar DECIMAL(14,2) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  INDEX idx_of_odeme (odeme_id),
  INDEX idx_of_fatura (fatura_id),
  FOREIGN KEY (odeme_id) REFERENCES finans_odeme(id) ON DELETE CASCADE,
  FOREIGN KEY (fatura_id) REFERENCES finans_fatura(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_banka_hareketi (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  kasa_banka_hesabi_id VARCHAR(36) NOT NULL,
  tarih DATE NOT NULL,
  aciklama VARCHAR(500),
  tutar DECIMAL(14,2) NOT NULL,
  yon ENUM('gelen','giden') NOT NULL,
  eslesen_tip ENUM('fatura','odeme') NULL,
  eslesen_id VARCHAR(36) NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  INDEX idx_bh_hesap_tarih (kasa_banka_hesabi_id, tarih),
  INDEX idx_bh_eslesen (eslesen_tip, eslesen_id),
  FOREIGN KEY (kasa_banka_hesabi_id) REFERENCES finans_kasa_banka_hesabi(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
