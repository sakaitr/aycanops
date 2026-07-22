-- Faza 7: Bildirim Kuralları
-- Otomatik bildirim tetikleyicileri için kural tablosu

CREATE TABLE IF NOT EXISTS notification_rules (
  id CHAR(36) NOT NULL PRIMARY KEY,
  event_type VARCHAR(60) NOT NULL,          -- belge_bitiyor | bakim_gecikti | sozlesme_bitiyor | surucu_belge_bitiyor
  label VARCHAR(200) NOT NULL,              -- Human-readable açıklama
  department_id CHAR(36) NULL,              -- Hangi departmana bildirim gitsin (NULL = tümüne)
  channel VARCHAR(20) NOT NULL DEFAULT 'in_app', -- whatsapp | in_app | hepsi
  days_before INT NOT NULL DEFAULT 30,      -- Kaç gün öncesinde tetiklensin (bakim_gecikti için 0)
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
);

-- Varsayılan kurallar
INSERT IGNORE INTO notification_rules (id, event_type, label, department_id, channel, days_before, is_active, created_at, updated_at) VALUES
  ('nrule-001-0000-0000-000000000001', 'belge_bitiyor',       'Araç belgesi 30 gün içinde bitiyor',           'dept-0001-0000-0000-000000000002', 'in_app', 30, 1, NOW(), NOW()),
  ('nrule-002-0000-0000-000000000002', 'belge_bitiyor',       'Araç belgesi 7 gün içinde bitiyor',            NULL,                              'hepsi',  7,  1, NOW(), NOW()),
  ('nrule-003-0000-0000-000000000003', 'sozlesme_bitiyor',    'Firma sözleşmesi 60 gün içinde bitiyor',       'dept-0001-0000-0000-000000000005', 'in_app', 60, 1, NOW(), NOW()),
  ('nrule-004-0000-0000-000000000004', 'bakim_gecikti',       'Araç bakım tarihi geçti',                      'dept-0001-0000-0000-000000000002', 'in_app', 0,  1, NOW(), NOW()),
  ('nrule-005-0000-0000-000000000005', 'surucu_belge_bitiyor','Sürücü belgesi 30 gün içinde bitiyor',         'dept-0001-0000-0000-000000000004', 'in_app', 30, 1, NOW(), NOW());

-- Track sent notifications to avoid duplicate sends
CREATE TABLE IF NOT EXISTS notification_log (
  id CHAR(36) NOT NULL PRIMARY KEY,
  rule_id CHAR(36) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,   -- vehicle | company | driver
  entity_id CHAR(36) NOT NULL,
  sent_at VARCHAR(30) NOT NULL,
  channel VARCHAR(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
