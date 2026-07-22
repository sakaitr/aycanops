-- 025: Push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    CHAR(36)     NOT NULL,
  endpoint   TEXT         NOT NULL,
  p256dh     TEXT         NOT NULL,
  auth       TEXT         NOT NULL,
  created_at VARCHAR(30)  NOT NULL,
  INDEX idx_push_sub_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
