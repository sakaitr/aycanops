SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS suggestions (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  suggest_no  VARCHAR(20)  NOT NULL UNIQUE,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  category    VARCHAR(20)  NOT NULL CHECK (category IN ('oneri','talep','sikayet','istek')),
  status      VARCHAR(20)  NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by  CHAR(36)     NOT NULL,
  assigned_to CHAR(36),
  closed_at   VARCHAR(30),
  created_at  VARCHAR(30)  NOT NULL,
  updated_at  VARCHAR(30)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO counters (name, value) VALUES ('suggest_no', 0);

CREATE INDEX IF NOT EXISTS idx_suggestions_created_by ON suggestions(created_by);
CREATE INDEX IF NOT EXISTS idx_suggestions_status     ON suggestions(status);
