-- Migration: 094_finans_gider_birlesik
-- Açıklama: Fiş ve fatura ayrı ayrı sistemlerdi, biri deftere hiç
-- yazmıyordu, ikisinde de kategori yoktu. Toplantı kararı: eskisi
-- (Faturalar/Fişler ayrı ekranlar) tamamen bırakılıyor, tek "Gider"
-- sistemine geçiliyor — kategori zorunlu, kalem kalem girilebilir,
-- görsel/PDF ekli, tek deftere (finans_hareket) yazar. Eski
-- finans_fatura/finans_fis tabloları veri kaybı olmasın diye SİLİNMİYOR,
-- sadece yeni girişler artık buraya düşmüyor.

CREATE TABLE IF NOT EXISTS finans_gider (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  tip ENUM('fis','fatura') NOT NULL DEFAULT 'fis',
  tarih VARCHAR(10) NOT NULL,
  kategori_id VARCHAR(36) NULL,
  cari_id VARCHAR(36) NULL,
  belge_no VARCHAR(100) NULL,
  tutar DECIMAL(14,2) NOT NULL DEFAULT 0,
  para_birimi_kod VARCHAR(10) NOT NULL DEFAULT 'TRY',
  kdv_tutar DECIMAL(14,2) NULL,
  aciklama TEXT NULL,
  department_id VARCHAR(36) NULL,
  proje_id VARCHAR(36) NULL,
  masraf_merkezi_id VARCHAR(36) NULL,
  vehicle_id VARCHAR(36) NULL,
  route_id VARCHAR(36) NULL,
  company_id VARCHAR(36) NULL,
  durum ENUM('taslak','tamamlandi') NOT NULL DEFAULT 'tamamlandi',
  created_by VARCHAR(36) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_gider_tarih (tarih),
  INDEX idx_gider_kategori (kategori_id),
  INDEX idx_gider_durum (durum),
  INDEX idx_gider_tip (tip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_gider_kalem (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  gider_id VARCHAR(36) NOT NULL,
  aciklama VARCHAR(500) NOT NULL,
  miktar DECIMAL(12,3) NOT NULL DEFAULT 1,
  birim_fiyat DECIMAL(14,2) NOT NULL DEFAULT 0,
  tutar DECIMAL(14,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  INDEX idx_gk_gider (gider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
