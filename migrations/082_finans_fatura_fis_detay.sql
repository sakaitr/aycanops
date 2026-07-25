-- Migration: 082_finans_fatura_fis_detay
-- Tarih: 2026-07-23
-- Açıklama: Fatura/fiş kayıtlarına ödeme türü ve fiş no eklenir, belge türü
-- ve KDV oranı seçenekleri genişletilir.

ALTER TABLE finans_fatura
  ADD COLUMN odeme_turu ENUM('pesin','vade','cek','kart','nakit') NULL AFTER fatura_no;

ALTER TABLE finans_fis
  ADD COLUMN fis_no VARCHAR(50) NULL AFTER tip,
  ADD COLUMN odeme_turu ENUM('pesin','vade','cek','kart','nakit') NULL AFTER fis_no;

INSERT INTO finans_belge_turu (id, ad, is_active, created_at, updated_at)
SELECT UUID(), t.ad, 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
FROM (
  SELECT 'Alış Faturası' AS ad
  UNION ALL SELECT 'İrsaliye'
  UNION ALL SELECT 'İrsaliyeli Fatura'
  UNION ALL SELECT 'e-Fatura'
  UNION ALL SELECT 'e-Arşiv Fatura'
  UNION ALL SELECT 'Serbest Meslek Makbuzu'
  UNION ALL SELECT 'Tahsilat Makbuzu'
  UNION ALL SELECT 'Tediye Makbuzu'
) t
WHERE NOT EXISTS (SELECT 1 FROM finans_belge_turu bt WHERE bt.ad = t.ad);

INSERT INTO finans_vergi_kodu (id, ad, oran, gecerlilik_baslangic, is_active, created_at, updated_at)
SELECT UUID(), t.ad, t.oran, '2020-01-01', 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
FROM (
  SELECT 'KDV %0' AS ad, 0.00 AS oran
  UNION ALL SELECT 'KDV %1', 1.00
  UNION ALL SELECT 'KDV %8', 8.00
  UNION ALL SELECT 'KDV %10', 10.00
) t
WHERE NOT EXISTS (SELECT 1 FROM finans_vergi_kodu vk WHERE vk.ad = t.ad);
