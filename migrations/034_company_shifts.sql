-- Company shifts: custom arrival time expectations per company per shift
CREATE TABLE IF NOT EXISTS company_shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  shift_name VARCHAR(100) NOT NULL,
  expected_time TIME NOT NULL,
  tolerance_early INT NOT NULL DEFAULT 15,
  tolerance_late INT NOT NULL DEFAULT 10,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_company_shifts_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
