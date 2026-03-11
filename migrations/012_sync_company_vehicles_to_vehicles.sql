-- Migration 012: Sync existing company_vehicles plates into the central vehicles registry.
-- Before this migration, bulk-uploaded vehicles only existed in company_vehicles.
-- This backfill ensures all plates are visible on the /araclar page.

INSERT IGNORE INTO vehicles (
  id,
  plate,
  type,
  capacity,
  status_code,
  driver_name,
  created_by,
  created_at,
  updated_at
)
SELECT
  UUID()                             AS id,
  cv.plate,
  'minibus'                          AS type,
  14                                 AS capacity,
  'active'                           AS status_code,
  cv.driver_name,
  (SELECT id FROM users ORDER BY created_at ASC LIMIT 1) AS created_by,
  cv.created_at,
  cv.updated_at
FROM company_vehicles cv
WHERE NOT EXISTS (
  SELECT 1 FROM vehicles v WHERE v.plate = cv.plate
)
AND (SELECT id FROM users ORDER BY created_at ASC LIMIT 1) IS NOT NULL;
