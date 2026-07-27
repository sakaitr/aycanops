-- Migration: 083_ziyaretci_kayitlari
-- Tarih: 2026-07-27
-- Açıklama: Lobi/resepsiyon ziyaretçi giriş-çıkış kayıt defteri.

CREATE TABLE IF NOT EXISTS ziyaretci_kayitlari (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  ziyaretci_adi VARCHAR(200) NOT NULL,
  sebep VARCHAR(500) NOT NULL,
  kime_geldi VARCHAR(200) NOT NULL,
  giris_zamani VARCHAR(30) NOT NULL,
  cikis_zamani VARCHAR(30) NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_ziyaretci_giris (giris_zamani),
  INDEX idx_ziyaretci_cikis (cikis_zamani),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
