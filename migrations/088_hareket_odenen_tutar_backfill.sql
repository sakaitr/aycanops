-- Migration: 088_hareket_odenen_tutar_backfill
-- Açıklama: 087'de faturalar deftere taşındı ama odenen_tutar boş (0) kaldı —
-- fatura tablosunda böyle bir kolon yok, ödemeler finans_odeme_fatura'da
-- eşleştirme satırı olarak tutuluyor.
--
-- Bu, açık bakiye hesabını bozuyordu: kısmen ödenmiş bir kayıtta
-- (tutar - odenen_tutar) kalan yerine tutarın tamamını veriyor. Cari ekstre
-- ve patron panelindeki "tahsil edilecek / ödenecek" bu alana dayandığı için
-- geri dolduruluyor.

-- finans_fatura'da 'fazla_odendi' durumu var, defterde yoktu — eşleştirme
-- sırasında bilgi kaybolmasın diye ENUM genişletiliyor.
ALTER TABLE finans_hareket
  MODIFY COLUMN odeme_durumu ENUM('odenmedi','kismen_odendi','odendi','fazla_odendi')
  NOT NULL DEFAULT 'odenmedi';

UPDATE finans_hareket h
JOIN (
  SELECT of.fatura_id, COALESCE(SUM(of.tutar), 0) AS odenen
    FROM finans_odeme_fatura of
   GROUP BY of.fatura_id
) x ON x.fatura_id = h.kaynak_id
SET h.odenen_tutar = x.odenen
WHERE h.kaynak_tip = 'fatura';

-- Ödeme eşleştirmesi hiç olmayan ama "odendi" işaretli faturalar: tutarın
-- tamamı ödenmiş kabul edilir (eski kayıtlarda ödeme belgesi girilmemiş
-- olabilir, ama durum bilgisine güveniyoruz).
UPDATE finans_hareket
   SET odenen_tutar = tutar_try
 WHERE kaynak_tip = 'fatura'
   AND odeme_durumu = 'odendi'
   AND odenen_tutar = 0;
