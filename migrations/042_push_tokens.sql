-- Migration 042: push_tokens (FCM native device tokens)
-- Capacitor @capacitor/push-notifications tarafından alınan FCM tokenları saklar.
-- push_subscriptions (VAPID/web-push) tablosundan ayrıdır.

CREATE TABLE IF NOT EXISTS push_tokens (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  user_id     CHAR(36)     NOT NULL,
  fcm_token   TEXT         NOT NULL,
  platform    VARCHAR(10)  NOT NULL DEFAULT 'unknown', -- ios | android | web
  device_name VARCHAR(255) NULL,
  created_at  VARCHAR(30)  NOT NULL,
  updated_at  VARCHAR(30)  NOT NULL,
  INDEX idx_pt_user_id (user_id),
  INDEX idx_pt_platform (platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
