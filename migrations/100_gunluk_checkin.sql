ALTER TABLE worklogs ADD COLUMN checkin_at VARCHAR(30) NULL;

CREATE TABLE IF NOT EXISTS gunluk_cevap (
  id CHAR(36) NOT NULL PRIMARY KEY,
  worklog_id CHAR(36) NOT NULL,
  soru_id CHAR(36) NOT NULL,
  cevap_json TEXT NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  UNIQUE(worklog_id, soru_id),
  INDEX idx_gunluk_cevap_worklog (worklog_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
