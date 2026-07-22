-- Migration: 068_fix_vehicle_documents_collation
-- Tarih: 2026-07-06
-- Açıklama: vehicle_documents tablosu CHARSET utf8mb4 belirtilmiş ama COLLATE
--           belirtilmediği için MariaDB 11.x'in yeni varsayılanı olan
--           utf8mb4_uca1400_ai_ci ile oluşmuş — şemanın geri kalanı
--           utf8mb4_unicode_ci kullanıyor (bkz. 014_charset_utf8mb4.sql).
--           Bu uyuşmazlık vehicles JOIN vehicle_documents sorgularında
--           "Illegal mix of collations" hatasına yol açıyordu (bildirim
--           cron job'ında tespit edildi). Ayrıca vehicles tablosunda
--           bakim_gecikti bildirim kuralı olmayan `is_active` kolonunu
--           varsayıyordu — bu da düzeltildi (bkz. app/api/cron/notify).

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

ALTER TABLE vehicle_documents CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET foreign_key_checks = 1;

-- ROLLBACK
-- ALTER TABLE vehicle_documents CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;
