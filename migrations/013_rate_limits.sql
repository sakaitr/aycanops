-- Rate limiting tablosu (brute-force koruması için)
CREATE TABLE IF NOT EXISTS rate_limits (
  ip VARCHAR(45) NOT NULL,
  action VARCHAR(50) NOT NULL,
  attempts INT NOT NULL DEFAULT 1,
  window_start VARCHAR(30) NOT NULL,
  PRIMARY KEY (ip, action)
);
