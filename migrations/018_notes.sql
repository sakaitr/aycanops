-- Migration 018: Kişisel notlar tablosu
CREATE TABLE notes (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    CHAR(36)     NOT NULL,
  title      VARCHAR(255) NOT NULL DEFAULT '',
  content    TEXT         NOT NULL DEFAULT '',
  created_at VARCHAR(30)  NOT NULL,
  updated_at VARCHAR(30)  NOT NULL,
  INDEX idx_notes_user (user_id),
  INDEX idx_notes_updated (updated_at)
);
