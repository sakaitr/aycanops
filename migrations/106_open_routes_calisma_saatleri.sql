-- Açık Güzergahlar ekranına yeni kayıt oluşturma formu ekleniyor — km zaten
-- vardı (distance_km), çalışma gün sayısı ve giriş/çıkış saatleri yoktu.
ALTER TABLE open_routes
  ADD COLUMN IF NOT EXISTS calisma_gun_sayisi INT NULL AFTER duration_min,
  ADD COLUMN IF NOT EXISTS giris_saati TIME NULL AFTER calisma_gun_sayisi,
  ADD COLUMN IF NOT EXISTS cikis_saati TIME NULL AFTER giris_saati;
