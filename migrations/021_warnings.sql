SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS warnings (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  warning_no   VARCHAR(20)  NOT NULL UNIQUE,
  plate        VARCHAR(20)  NOT NULL,
  driver_name  VARCHAR(255) NOT NULL,
  reason       TEXT         NOT NULL,
  deadline     VARCHAR(10),
  is_done      TINYINT(1)   NOT NULL DEFAULT 0,
  done_at      VARCHAR(30),
  created_by   CHAR(36)     NOT NULL,
  created_at   VARCHAR(30)  NOT NULL,
  updated_at   VARCHAR(30)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO counters (name, value) VALUES ('warning_no', 0);

CREATE INDEX IF NOT EXISTS idx_warnings_plate       ON warnings(plate);
CREATE INDEX IF NOT EXISTS idx_warnings_driver      ON warnings(driver_name);
CREATE INDEX IF NOT EXISTS idx_warnings_created_at  ON warnings(created_at);
CREATE INDEX IF NOT EXISTS idx_warnings_is_done     ON warnings(is_done);
