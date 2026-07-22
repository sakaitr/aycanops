SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    CHAR(36)     NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       TEXT,
  link       VARCHAR(255),
  is_read    TINYINT(1)   NOT NULL DEFAULT 0,
  created_by CHAR(36),
  created_at VARCHAR(30)  NOT NULL,
  updated_at VARCHAR(30)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS todo_reminders (
  id           CHAR(36)    NOT NULL PRIMARY KEY,
  todo_id      CHAR(36)    NOT NULL,
  reminded_at  VARCHAR(30) NOT NULL,
  reminder_day VARCHAR(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_notif_user_read    ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created      ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_reminder_todo_day  ON todo_reminders(todo_id, reminder_day);
