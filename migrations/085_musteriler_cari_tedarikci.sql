-- Migration: 085_musteriler_cari_tedarikci
-- Açıklama: "Firmalar" (Operasyon'un yönettiği, araç/güzergah bağlı saha
-- firmaları) ile fatura carisi birbirine karışıyordu. Artık ayrı:
-- - musteriler: satış faturası carisi (faturalandırma ilişkisi)
-- - cari_tedarikci: alış faturası carisi (bize hizmet verip fatura kesen
--   tedarikçiler — araç tedarikçisi/İşleten bunun bir alt kümesi, ama yakıt/
--   sigorta/ofis gibi araç dışı tedarikçiler de buraya girilebilir)
-- İkisinde de banka adı + IBAN alanı var, fatura formunda cari seçilince
-- otomatik doluyor. Mevcut fatura kayıtlarının cari_id'si bozulmasın diye
-- companies/isleten'den AYNI id ile kopyalanıyor (bkz. aşağıdaki INSERT).

CREATE TABLE IF NOT EXISTS musteriler (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  unvan VARCHAR(255) NOT NULL,
  vergi_no VARCHAR(20),
  vergi_dairesi VARCHAR(100),
  telefon VARCHAR(20),
  email VARCHAR(150),
  adres TEXT,
  banka_adi VARCHAR(100),
  banka_iban VARCHAR(34),
  ilgili_firma_id VARCHAR(36) NULL,
  notlar TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(36),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_musteriler_active (is_active),
  INDEX idx_musteriler_firma (ilgili_firma_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cari_tedarikci (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  unvan VARCHAR(255) NOT NULL,
  kategori VARCHAR(50),
  vergi_no VARCHAR(20),
  vergi_dairesi VARCHAR(100),
  telefon VARCHAR(20),
  email VARCHAR(150),
  adres TEXT,
  banka_adi VARCHAR(100),
  banka_iban VARCHAR(34),
  notlar TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(36),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  INDEX idx_cari_tedarikci_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mevcut firmaları müşteri olarak kopyala (aynı id — fatura.cari_id kırılmasın)
INSERT INTO musteriler (id, unvan, is_active, ilgili_firma_id, created_by, created_at, updated_at)
SELECT id, name, is_active, id, created_by, created_at, updated_at FROM companies
ON DUPLICATE KEY UPDATE id = VALUES(id);

-- Mevcut işletenleri tedarikçi olarak kopyala (aynı id)
INSERT INTO cari_tedarikci (id, unvan, kategori, vergi_no, vergi_dairesi, telefon, banka_adi, banka_iban, is_active, created_by, created_at, updated_at)
SELECT id, unvan, 'arac_tedarikci', vergi_no, vergi_dairesi, cep_tel, banka_adi, banka_iban, is_active, created_by, created_at, updated_at FROM isleten
ON DUPLICATE KEY UPDATE id = VALUES(id);

ALTER TABLE finans_fatura
  ADD COLUMN banka_adi VARCHAR(100) NULL,
  ADD COLUMN banka_iban VARCHAR(34) NULL;
