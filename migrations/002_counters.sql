CREATE TABLE IF NOT EXISTS counters (
  name VARCHAR(50) NOT NULL PRIMARY KEY,
  value INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO counters (name, value)
VALUES ('ticket_no', 0);
