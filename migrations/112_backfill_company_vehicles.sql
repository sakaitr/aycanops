-- Migration: 112_backfill_company_vehicles
-- Tarih: 2026-09-11
-- Açıklama: Bir güzergaha araç atanınca o firmanın company_vehicles rosterına
--           otomatik eklenmesi artık kod tarafında garanti (bkz.
--           lib/company-vehicles.ts, çağrıldığı yerler: POST/PUT /api/routes,
--           çetele bulk kalıcı değişim). Bu, geriye dönük — o kod devreye
--           girmeden önce güzergaha atanmış ama firmanın araç listesine hiç
--           eklenmemiş araçları tek seferlik doldurur (canlıda 1 satır:
--           ALTINAY / Çayırova / 34 LAB 702 — kullanıcı testi sırasında
--           bulundu, Günlük üst sayacı bu yüzden 0 gösteriyordu).
--           Bir araç birden fazla firmaya hizmet verebildiğinden var olan
--           satırlara dokunmaz, sadece eksik olanı ekler.

SET NAMES utf8mb4;

INSERT INTO company_vehicles (id, company_id, plate, vehicle_id, sort_order, is_temporary, is_active, created_at, updated_at)
SELECT
  UUID(),
  r.company_id,
  v.plate,
  r.vehicle_id,
  COALESCE((SELECT MAX(cv2.sort_order) + 1 FROM company_vehicles cv2 WHERE cv2.company_id = r.company_id AND cv2.is_active = 1), 0),
  0, 1,
  '2026-09-11T14:00:00.000Z', '2026-09-11T14:00:00.000Z'
FROM routes r
JOIN vehicles v ON v.id = r.vehicle_id
WHERE r.is_active = 1 AND r.company_id IS NOT NULL AND r.vehicle_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM company_vehicles cv
    WHERE cv.company_id = r.company_id
      AND (cv.vehicle_id = r.vehicle_id OR cv.plate = v.plate)
      AND cv.is_active = 1
  )
GROUP BY r.company_id, r.vehicle_id, v.plate;
