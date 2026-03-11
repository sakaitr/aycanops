CREATE TABLE IF NOT EXISTS counters (
  name VARCHAR(50) NOT NULL PRIMARY KEY,
  value INT NOT NULL
);

INSERT IGNORE INTO counters (name, value)
VALUES ('ticket_no', 0);
