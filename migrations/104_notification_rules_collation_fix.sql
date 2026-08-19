-- notification_rules migration 053'te CHARSET/COLLATE belirtilmeden
-- oluşturulmuştu, sunucu varsayılanını (utf8mb4_uca1400_ai_ci) aldı —
-- şemanın geri kalanı utf8mb4_unicode_ci kullanıyor. Bu yüzden
-- GET /api/notification-rules'daki departments JOIN'i "Illegal mix of
-- collations" hatasıyla patlıyordu (canlıda doğrulandı).

ALTER TABLE notification_rules CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE notification_log CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
