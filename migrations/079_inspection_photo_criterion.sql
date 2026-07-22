-- Migration: 079_inspection_photo_criterion
-- Tarih: 2026-07-22
-- Açıklama: (1) Denetim fotoğraflarının belirli bir checklist sorusuna
-- bağlanabilmesi için inspection_photos'a opsiyonel criterion_index eklenir.
-- NULL = genel/toplu fotoğraf (mevcut davranış), sayı = checklist_json
-- dizisindeki ilgili sorunun index'i.
-- (2) inspections tablosuna company_id eklenir — serbest plaka modunda
-- (company_vehicle_id NULL) POST /api/inspections zaten resolvedCompanyId
-- hesaplıyordu ama hiçbir kolona yazmıyordu, bu yüzden firma bazlı
-- raporlar (company_vehicles INNER JOIN üzerinden) bu kayıtları hiç
-- göremiyordu. Artık her iki modda da company_id doldurulacak.

ALTER TABLE inspection_photos
  ADD COLUMN criterion_index INT NULL AFTER inspection_id;

ALTER TABLE inspections
  ADD COLUMN company_id CHAR(36) NULL AFTER company_vehicle_plate;

-- Mevcut company_vehicle_id'li kayıtlar için company_id'yi geriye dönük doldur
UPDATE inspections i
JOIN company_vehicles cv ON cv.id = i.company_vehicle_id
SET i.company_id = cv.company_id
WHERE i.company_vehicle_id IS NOT NULL AND i.company_id IS NULL;

-- ROLLBACK
-- ALTER TABLE inspection_photos DROP COLUMN criterion_index;
-- ALTER TABLE inspections DROP COLUMN company_id;
