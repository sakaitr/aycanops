-- Migration: 078_finans_belge_hash_unique
-- Finans belge tablosuna dosya_hash için UNIQUE constraint — eşzamanlı
-- yükleme yarışında mükerrer kayıt oluşmasını DB seviyesinde engeller.

SET foreign_key_checks = 0;

ALTER TABLE finans_belge ADD UNIQUE KEY uq_finans_belge_hash (dosya_hash);

SET foreign_key_checks = 1;

-- ROLLBACK
-- ALTER TABLE finans_belge DROP INDEX uq_finans_belge_hash;
