-- finans_gider'e ödeme durumu eklenir — Hareketler ekranında gider kaynaklı
-- satırlar şu ana kadar hep varsayılan 'odenmedi' görünüyordu, hiçbir yerden
-- güncellenemiyordu. Sadece izinli kullanıcılar (finans_gider:odeme_isaretle)
-- Gider ekranından işaretleyebilecek, ayrıca finans_hareket'e senkron olacak.
ALTER TABLE finans_gider
  ADD COLUMN IF NOT EXISTS odeme_durumu ENUM('odenmedi','kismen_odendi','odendi') NOT NULL DEFAULT 'odenmedi' AFTER durum;
