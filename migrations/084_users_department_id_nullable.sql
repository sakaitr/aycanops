-- Migration: 084_users_department_id_nullable
-- Tarih: 2026-07-27
-- Açıklama: users.department_id yanlışlıkla NOT NULL idi (varsayılan/eski
-- veri yok) ama kullanıcı oluşturma şeması, API'si ve admin formu her yerde
-- departmanı opsiyonel olarak ele alıyor ("— Seçin —" boş seçenek var).
-- Departman seçilmeden yeni kullanıcı oluşturulduğunda NULL insert
-- edilmeye çalışılıyor ve NOT NULL kısıtlaması hataya (500) sebep oluyordu.

ALTER TABLE users MODIFY COLUMN department_id CHAR(36) NULL;
