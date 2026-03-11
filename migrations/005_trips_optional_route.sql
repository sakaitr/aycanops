-- Make route_id optional in trips (for free-text Ek Mesai entries)
SET foreign_key_checks = 0;
ALTER TABLE trips MODIFY COLUMN route_id CHAR(36) NULL;
SET foreign_key_checks = 1;
