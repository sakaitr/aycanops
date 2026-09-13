-- CP-00: 12 Eylül raporundaki KİMLİKLERLE salt okunur envanter.
-- Canlı ortamda otomatik çalıştırılmaz. Öncesi/sonrası aynı sorguyla kaydedilir.
-- İsim/plaka benzerliğiyle kayıt birleştirme veya silme yoktur.
SELECT id, is_active FROM companies WHERE id='79a62b3e-7544-4dd0-8b23-cdf9e887cce4';
SELECT id, status_code FROM vehicles WHERE id='76b81e17-109b-4fd5-a144-b7fb293456a2';
SELECT id, company_id, vehicle_id, route_id, is_active FROM company_vehicles WHERE id='ef25ae96-3c59-4686-9e2f-c7c439ecbb4e';
SELECT id, company_id, vehicle_id FROM routes WHERE id='26e032d2-ba72-4186-b55b-b68b7d329919';
SELECT id, vehicle_id, route_id, tarih, durum FROM cetele WHERE id IN (
 '2cf7d9d1-b48a-41ef-92b9-d28d07df6101', 'b4f472e3-615c-4cbc-89e6-9bb19823fde7', '62863eb5-aa1c-4f77-a387-3016677ad5f1');
SELECT id FROM isleten WHERE id='8a68ff26-64b9-4392-a922-933c78f56fa3';
SELECT id, durum, brut_tutar, net_tutar FROM hakedis WHERE id='cb306b9e-19b6-477f-93c0-869ab92d1d39';
SELECT id, company_id, durum, tutar FROM firma_mutabakat WHERE id='1a9cd707-7643-4134-870f-00ef4dde59a5';
SELECT id, company_id, route_id, vehicle_id, price_amount, currency FROM route_supplier_prices WHERE id='793674e8-8d90-4e42-ac70-7d0987b781db';
SELECT id, company_id, status, version_no FROM route_plans WHERE id='4d80f84a-a5b7-4a53-ac93-c2508f290410';
SELECT id, route_plan_id, route_id, vehicle_id FROM route_plan_routes WHERE id='f8653997-2501-4990-b00d-c15186c4900a';
SELECT id, status FROM import_jobs WHERE id IN ('7e7c8b53-9d79-4501-81da-8d88152b3a6f', 'accb331d-d868-4baf-b855-b19dd6c11cae');
SELECT id, action, entity_type, entity_id, created_at FROM audit_log WHERE entity_id IN (
 '79a62b3e-7544-4dd0-8b23-cdf9e887cce4', '76b81e17-109b-4fd5-a144-b7fb293456a2',
 '26e032d2-ba72-4186-b55b-b68b7d329919', 'cb306b9e-19b6-477f-93c0-869ab92d1d39',
 '1a9cd707-7643-4134-870f-00ef4dde59a5', '4d80f84a-a5b7-4a53-ac93-c2508f290410') ORDER BY created_at, id;
