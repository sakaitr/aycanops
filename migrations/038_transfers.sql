CREATE TABLE IF NOT EXISTS transfers (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  status       VARCHAR(20)  NOT NULL DEFAULT 'istek',
  title        VARCHAR(255) NOT NULL,
  company_id   CHAR(36)     DEFAULT NULL,
  vehicle_id   CHAR(36)     DEFAULT NULL,
  driver_name  VARCHAR(255) DEFAULT NULL,
  driver_phone VARCHAR(50)  DEFAULT NULL,
  pickup_location  TEXT     DEFAULT NULL,
  dropoff_location TEXT     DEFAULT NULL,
  transfer_date    DATE     DEFAULT NULL,
  transfer_time    TIME     DEFAULT NULL,
  passenger_count  INT      DEFAULT NULL,
  notes        TEXT         DEFAULT NULL,
  created_by   CHAR(36)     DEFAULT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_transfers_status   (status),
  INDEX idx_transfers_company  (company_id),
  INDEX idx_transfers_date     (transfer_date)
);

CREATE TABLE IF NOT EXISTS transfer_passengers (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  transfer_id CHAR(36)     NOT NULL,
  name        VARCHAR(255) NOT NULL,
  phone       VARCHAR(50)  DEFAULT NULL,
  notes       TEXT         DEFAULT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tp_transfer (transfer_id)
);
