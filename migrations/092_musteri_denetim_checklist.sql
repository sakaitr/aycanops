-- Migration: 092_musteri_denetim_checklist
-- Açıklama: Müşteri portalında denetim gönderimine opsiyonel checklist
-- eklendi — firma isterse bizim denetim türlerimizden birini seçip
-- checklist doldurabilir. Staff "Bizim Denetimimizi Ekle" dediğinde bu
-- checklist, resmi denetimin başlangıç değeri olarak kullanılır.

ALTER TABLE customer_inspection_submissions
  ADD COLUMN IF NOT EXISTS type VARCHAR(50) NULL AFTER plate,
  ADD COLUMN IF NOT EXISTS checklist_json TEXT NULL AFTER note;
