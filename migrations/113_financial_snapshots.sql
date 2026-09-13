-- Append-only financial evidence, independent of operational rows and audit retention.
-- No FK cascade intentionally: evidence must survive source archival/removal.
-- Deployment rollback: revert application code but KEEP this table and its rows.
CREATE TABLE IF NOT EXISTS financial_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  event VARCHAR(40) NOT NULL,
  schema_version SMALLINT NOT NULL DEFAULT 1,
  payload JSON NOT NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  INDEX idx_financial_snapshot_entity (entity_type, entity_id, event, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER financial_snapshots_no_update BEFORE UPDATE ON financial_snapshots
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Financial evidence is append-only';
CREATE TRIGGER financial_snapshots_no_delete BEFORE DELETE ON financial_snapshots
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Financial evidence is append-only';
