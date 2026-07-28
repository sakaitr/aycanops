-- Migration: 086_musteriler_cari_tedarikciye_tasi
-- Açıklama: Fatura eklerken satış/alış farketmeksizin cari artık tek liste
-- olan cari_tedarikci'den seçilecek. Mevcut müşterileri (aynı id ile,
-- fatura.cari_id kırılmasın diye) cari_tedarikci'ye kopyalıyoruz.
-- musteriler tablosu silinmiyor (başka amaçla kullanılabilir), sadece
-- fatura formu artık ona bakmıyor.

INSERT INTO cari_tedarikci (id, unvan, kategori, vergi_no, vergi_dairesi, telefon, email, adres, banka_adi, banka_iban, notlar, is_active, created_by, created_at, updated_at)
SELECT id, unvan, 'musteri', vergi_no, vergi_dairesi, telefon, email, adres, banka_adi, banka_iban, notlar, is_active, created_by, created_at, updated_at FROM musteriler
ON DUPLICATE KEY UPDATE id = VALUES(id);
