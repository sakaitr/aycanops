-- Migration: 114_isleten_cari_kesinti_kategori
-- Tarih: 2026-09-13
-- Açıklama: Kesinti kaydı serbest metin aciklama'dan ibaretti, sebep kategorisi
--           yoktu. Kullanıcı talebi: araç kirli / denetime uymadı / ceza /
--           yakıt yüklendi gibi kategoriler + serbest "diğer". islem_turu
--           'kesinti' olmayan satırlarda NULL kalır.

SET NAMES utf8mb4;

ALTER TABLE isleten_cari
  ADD COLUMN kesinti_kategori ENUM('arac_kirli','denetim_basarisiz','ceza','yakit','diger') NULL AFTER islem_turu;

-- ROLLBACK
-- ALTER TABLE isleten_cari DROP COLUMN kesinti_kategori;
