-- Salt okunur ön inceleme. Üretimde otomatik çalıştırılmaz.
-- Önce şema sürümünü doğrulayın; sonuçları muhasebe sorumlusu incelemelidir.
-- Bu sorgular kayıt düzeltmez ve silinmiş geçmişi yeniden oluşturmaz.

-- Dönem veya hesap uyuşmazlığı: tevkifat, hesaplanan KDV üzerinden alınır.
SELECT id, durum, donem_baslangic, donem_bitis,
       brut_tutar, kdv_orani, kdv_tutari, tevkifat_orani, tevkifat_tutari, net_tutar,
       ROUND(brut_tutar * kdv_orani / 100, 2) AS beklenen_kdv,
       ROUND(ROUND(brut_tutar * kdv_orani / 100, 2) * tevkifat_orani / 100, 2) AS beklenen_tevkifat
FROM hakedis
WHERE donem_baslangic > donem_bitis
   OR brut_tutar < 0 OR kdv_orani NOT BETWEEN 0 AND 100
   OR tevkifat_orani NOT BETWEEN 0 AND 100
   OR kdv_tutari <> ROUND(brut_tutar * kdv_orani / 100, 2)
   OR tevkifat_tutari <> ROUND(ROUND(brut_tutar * kdv_orani / 100, 2) * tevkifat_orani / 100, 2)
   OR net_tutar <> brut_tutar + kdv_tutari - tevkifat_tutari;

-- Bağlı hizmetlerin saklanan toplamı ve dönem tutarlılığı.
SELECT h.id, h.durum, h.brut_tutar, SUM(hc.tutar) AS bagli_tutar,
       COUNT(*) AS bagli_hizmet,
       SUM(c.id IS NULL) AS eksik_hizmet,
       SUM(c.tarih < h.donem_baslangic OR c.tarih > h.donem_bitis) AS donem_disi
FROM hakedis h
JOIN hakedis_cetele hc ON hc.hakedis_id = h.id
LEFT JOIN cetele c ON c.id = hc.cetele_id
GROUP BY h.id, h.durum, h.brut_tutar
HAVING bagli_tutar <> h.brut_tutar OR eksik_hizmet > 0 OR donem_disi > 0;

-- Güzergahı kaybolmuş hizmetler: fiyat ve firma kaynağı incelenmelidir.
SELECT c.id, c.tarih, c.vehicle_id, c.route_id, c.durum
FROM cetele c LEFT JOIN routes r ON r.id = c.route_id
WHERE r.id IS NULL;

-- Onay anına ait yeni-format denetim kaydı bulunmayan mutabakatlar.
-- Bir audit satırının varlığı tek başına ayrıntılarının eksiksiz olduğunu kanıtlamaz.
SELECT fm.id, fm.company_id, fm.donem, fm.tutar, fm.para_birimi
FROM firma_mutabakat fm
WHERE fm.durum = 'onaylandi'
  AND NOT EXISTS (
    SELECT 1 FROM audit_log a
    WHERE a.entity_type = 'firma_mutabakat' AND a.entity_id = fm.id
      AND a.action = 'firma_mutabakat.onayla'
  );
