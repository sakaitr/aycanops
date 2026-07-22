-- 058: Firma bazlı güzergah + plaka fiyat modeli
-- Tedarikçi akışı kullanılmayacak; fiyatlar firma + güzergah + plaka/araç üzerinden tutulur.

ALTER TABLE route_supplier_prices MODIFY supplier_id CHAR(36) NULL;
ALTER TABLE route_supplier_prices ADD COLUMN IF NOT EXISTS vehicle_id CHAR(36) NULL AFTER supplier_id;
ALTER TABLE route_supplier_prices ADD COLUMN IF NOT EXISTS plate VARCHAR(50) NULL AFTER vehicle_id;
CREATE INDEX IF NOT EXISTS idx_route_supplier_prices_vehicle ON route_supplier_prices(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_route_supplier_prices_plate ON route_supplier_prices(plate);
CREATE INDEX IF NOT EXISTS idx_route_supplier_prices_company_route_plate ON route_supplier_prices(company_id, route_id, plate, valid_from, valid_to);

ALTER TABLE route_price_requests MODIFY supplier_id CHAR(36) NULL;
ALTER TABLE route_price_requests ADD COLUMN IF NOT EXISTS vehicle_id CHAR(36) NULL AFTER supplier_id;
ALTER TABLE route_price_requests ADD COLUMN IF NOT EXISTS plate VARCHAR(50) NULL AFTER vehicle_id;
CREATE INDEX IF NOT EXISTS idx_route_price_requests_vehicle ON route_price_requests(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_route_price_requests_plate ON route_price_requests(plate);

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS route_name VARCHAR(255) NULL AFTER driver_phone;
CREATE INDEX IF NOT EXISTS idx_vehicles_route_name ON vehicles(route_name);

CREATE INDEX IF NOT EXISTS idx_routes_company_name ON routes(company_id, name);
