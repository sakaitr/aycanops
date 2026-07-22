CREATE TABLE IF NOT EXISTS worklog_visits (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  worklog_id  CHAR(36)     NOT NULL,
  company_id  CHAR(36)     DEFAULT NULL,
  note        TEXT         DEFAULT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wv_worklog  (worklog_id),
  INDEX idx_wv_company  (company_id)
);

CREATE TABLE IF NOT EXISTS worklog_issues (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  worklog_id  CHAR(36)     NOT NULL,
  description TEXT         NOT NULL,
  resolved    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wi_worklog  (worklog_id)
);
