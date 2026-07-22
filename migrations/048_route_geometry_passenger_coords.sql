-- 048_route_geometry_passenger_coords.sql
-- Add OSRM geometry storage to routes
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS route_geometry LONGTEXT NULL AFTER stops_json;

-- Add geocoded pickup coords and route assignment to passengers
ALTER TABLE passengers
  ADD COLUMN IF NOT EXISTS pickup_lat  DOUBLE NULL AFTER pickup_address,
  ADD COLUMN IF NOT EXISTS pickup_lng  DOUBLE NULL AFTER pickup_lat,
  ADD COLUMN IF NOT EXISTS route_id    CHAR(36) NULL AFTER dropoff_address;

ALTER TABLE passengers
  ADD INDEX IF NOT EXISTS idx_pass_route (route_id);
