-- Migration: 104_gunluk_soru_detay
-- Tarih: 2026-08-16
-- Açıklama: İş başı check-in sorularına bölüm başlığı ve koşullu takip
-- (detay) sorusu desteği eklenir; patronun iki taslak formundan
-- tekilleştirilen final 8 soru seed edilir.

ALTER TABLE gunluk_soru
  ADD COLUMN bolum_baslik VARCHAR(200) NULL AFTER label,
  ADD COLUMN detay_label VARCHAR(500) NULL AFTER zorunlu,
  ADD COLUMN detay_tip ENUM('metin','uzun_metin','secim') NULL AFTER detay_label,
  ADD COLUMN detay_secenekler TEXT NULL AFTER detay_tip,
  ADD COLUMN detay_tetikleyici VARCHAR(200) NULL AFTER detay_secenekler;

ALTER TABLE gunluk_cevap ADD COLUMN detay_cevap TEXT NULL;

INSERT INTO gunluk_soru
  (id, label, tip, secenekler, zorunlu, sort_order, is_active,
   bolum_baslik, detay_label, detay_tip, detay_secenekler, detay_tetikleyici,
   created_at, updated_at)
SELECT
  UUID(), t.label, t.tip, t.secenekler, t.zorunlu,
  (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM gunluk_soru) + t.rel_order,
  1, t.bolum_baslik, t.detay_label, t.detay_tip, t.detay_secenekler, t.detay_tetikleyici,
  '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'
FROM (
  SELECT
    'Dün işini eksiksiz tamamladın mı?' AS label, 'evet_hayir' AS tip, NULL AS secenekler,
    1 AS zorunlu, 0 AS rel_order, 'Dünün Değerlendirmesi' AS bolum_baslik,
    'Ne eksik kaldı?' AS detay_label, 'metin' AS detay_tip, NULL AS detay_secenekler, 'false' AS detay_tetikleyici
  UNION ALL
  SELECT
    'Açık/eksik güzergah var mı?', 'evet_hayir', NULL,
    1, 1, 'Dünün Değerlendirmesi',
    'Hangi güzergah, ne eksik?', 'metin', NULL, 'true'
  UNION ALL
  SELECT
    'Dünden bugüne devreden acil/önemli bir konu var mı?', 'evet_hayir', NULL,
    1, 2, 'Dünün Değerlendirmesi',
    'Konu nedir, kimden destek gerekiyor?', 'metin', NULL, 'true'
  UNION ALL
  SELECT
    'Bugün yapılacak öncelikli 1-2 iş nedir?', 'metin', NULL,
    1, 3, 'Bugüne Dair',
    NULL, NULL, NULL, NULL
  UNION ALL
  SELECT
    'Bugün acil çözülmesi gereken bir konu var mı?', 'evet_hayir', NULL,
    1, 4, 'Bugüne Dair',
    'Konu nedir?', 'metin', NULL, 'true'
  UNION ALL
  SELECT
    'Destek/yönlendirme ihtiyacım var', 'evet_hayir', NULL,
    1, 5, 'Bugüne Dair',
    'Kimden?', 'secim', '["Operasyon","Muhasebe","Pazarlama","İnsan Kaynakları","Yönetim","Diğer"]', 'true'
  UNION ALL
  SELECT
    'Genel gün durumu (dün+bugün)', 'secim',
    '["🟢 Planlandığı gibi","🟡 Takip gerekiyor","🔴 Yönetici müdahalesi gerekiyor"]',
    1, 6, 'Bugüne Dair',
    NULL, NULL, NULL, NULL
  UNION ALL
  SELECT
    'Eklemek istediğiniz başka bir not var mı?', 'uzun_metin', NULL,
    0, 7, 'Bugüne Dair',
    NULL, NULL, NULL, NULL
) t
WHERE NOT EXISTS (SELECT 1 FROM gunluk_soru gs WHERE gs.label = t.label);
