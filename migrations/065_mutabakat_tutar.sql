-- Migration: 065_mutabakat_tutar
-- Tarih: 2026-07-02
-- Açıklama: Firma mutabakatına dönem tutarı eklenir — o firmanın güzergahlarında
--           o ay içinde işlenen onaylı çetele kayıtlarının güzergah fiyatından
--           hesaplanan toplamıdır (kâr-zarar raporunun gelir tarafı).

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

ALTER TABLE firma_mutabakat ADD COLUMN IF NOT EXISTS tutar DECIMAL(12,2) DEFAULT 0 AFTER donem;
ALTER TABLE firma_mutabakat ADD COLUMN IF NOT EXISTS para_birimi VARCHAR(3) DEFAULT 'TRY' AFTER tutar;

SET foreign_key_checks = 1;

-- ROLLBACK
-- ALTER TABLE firma_mutabakat DROP COLUMN IF EXISTS para_birimi;
-- ALTER TABLE firma_mutabakat DROP COLUMN IF EXISTS tutar;
