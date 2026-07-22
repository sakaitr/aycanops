-- Migration 017: Geçici araç desteği
-- is_temporary: 1 ise araç sadece added_date günü giriş kontrol listesinde görünür
-- added_date: YYYY-MM-DD formatında ekleme tarihi

ALTER TABLE company_vehicles ADD COLUMN is_temporary INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_vehicles ADD COLUMN added_date TEXT DEFAULT NULL;
