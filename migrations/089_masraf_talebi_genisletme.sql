-- Migration: 089_masraf_talebi_genisletme
-- Açıklama: Masraf talebi = "operasyondaki adamın yediği yemeğin fişinden
-- elden verilen harcıraya kadar" akışın kapısı (Faz 2). Tabloda onay akışı
-- zaten vardı (bekliyor→onaylandı/reddedildi), eksik olan:
--   1. Hangi araca/güzergaha/firmaya ait olduğu (yakıt fişi hangi araç için?)
--   2. Fiş/fatura fotoğrafı eki (finans_belge zaten var, sadece bağlanacak)
--   3. Onaylanınca tek deftere (finans_hareket) yazması — şu ana kadar
--      kaldırılan finans_gelir_gider tablosuna yazıyordu.

ALTER TABLE finans_masraf_talebi
  ADD COLUMN IF NOT EXISTS vehicle_id VARCHAR(36) NULL AFTER masraf_merkezi_id,
  ADD COLUMN IF NOT EXISTS route_id VARCHAR(36) NULL AFTER vehicle_id,
  ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL AFTER route_id,
  ADD INDEX IF NOT EXISTS idx_mt_vehicle (vehicle_id);
