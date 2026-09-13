-- Migration: 115_gps_event_dedup
-- Tarih: 2026-09-14
-- Açıklama: Traccar webhook'u (ve ileride başka GPS sağlayıcıları) "en az bir kez"
--           teslimat garantisi verir — aynı olay/konum tekrar gönderilebilir. Şu ana
--           kadar route_adherence_events ve vehicle_locations bunu hiç ayırt etmiyordu,
--           her tekrar yeni satır yaratıyordu (route_adherence sayımını şişirir,
--           konum geçmişinde hayalet çift kayıt oluşturur). Kaynağın kendi verdiği
--           olay/konum kimliği + sağlayıcı koduyla UNIQUE — NULL'lar birbirine eşit
--           sayılmadığından kimliksiz eski kayıtlar ve diğer sağlayıcılar etkilenmez.

SET NAMES utf8mb4;

ALTER TABLE route_adherence_events
  ADD COLUMN provider_code VARCHAR(50) NULL AFTER vehicle_id,
  ADD COLUMN source_event_id VARCHAR(60) NULL AFTER provider_code,
  ADD UNIQUE KEY uq_route_adherence_source_event (provider_code, source_event_id);

ALTER TABLE vehicle_locations
  ADD COLUMN source_position_id VARCHAR(60) NULL AFTER provider_code,
  ADD UNIQUE KEY uq_vehicle_locations_source_position (provider_code, source_position_id);

-- ROLLBACK
-- ALTER TABLE vehicle_locations DROP KEY uq_vehicle_locations_source_position, DROP COLUMN source_position_id;
-- ALTER TABLE route_adherence_events DROP KEY uq_route_adherence_source_event, DROP COLUMN source_event_id, DROP COLUMN provider_code;
