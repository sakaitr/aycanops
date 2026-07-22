-- Migration: 063_guzergah_vardiya_tag
-- Tarih: 2026-07-02
-- Açıklama: Güzergahlara esnek vardiya saatleri (08:00/16:00/00:00 gibi çoklu
--           giriş-çıkış dilimleri), özelleştirilebilir taglar (vardiya/memur/
--           mesai/ek araç vb.) ve giriş-çıkış için sabit/ayrı araç modu eklenir.
--           Sabit 4 seçenekli (sabah/akşam/ring/transfer) hareket tipi sistemi
--           kaldırılır — artık her güzergahın kendi tanımladığı vardiya adı
--           serbest metin olarak kullanılır (cetele.hareket_tipi VARCHAR olur).

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

-- ── Güzergah vardiya/saat dilimleri ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS route_time_slots (
  id            VARCHAR(36) NOT NULL PRIMARY KEY,
  route_id      VARCHAR(36) NOT NULL,
  ad            VARCHAR(100) NOT NULL,   -- örn "08:00 Vardiya", "Gece Vardiyası"
  giris_saati   TIME DEFAULT NULL,
  cikis_saati   TIME DEFAULT NULL,
  sort_order    INT DEFAULT 0,
  is_active     TINYINT(1) DEFAULT 1,
  created_by    VARCHAR(36),
  created_at    VARCHAR(30) NOT NULL,
  INDEX idx_rts_route (route_id, is_active),
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Özelleştirilebilir güzergah tagları ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS route_tags (
  id          VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id  VARCHAR(36) DEFAULT NULL,  -- NULL = tüm firmalarda görünür genel tag
  name        VARCHAR(50) NOT NULL,
  color       VARCHAR(20) DEFAULT NULL,
  created_by  VARCHAR(36),
  created_at  VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_route_tags_company_name (company_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS route_tag_links (
  id          VARCHAR(36) NOT NULL PRIMARY KEY,
  route_id    VARCHAR(36) NOT NULL,
  tag_id      VARCHAR(36) NOT NULL,
  created_at  VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_route_tag_links (route_id, tag_id),
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES route_tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Güzergaha giriş/çıkış araç modu ───────────────────────────────────────────
ALTER TABLE routes ADD COLUMN IF NOT EXISTS arac_modu ENUM('sabit','ayri') DEFAULT 'sabit' AFTER vehicle_assignment_status;

-- ── Çetele: sabit hareket_tipi (ENUM) → serbest metin (güzergahın vardiya adı) ─
ALTER TABLE cetele MODIFY COLUMN hareket_tipi VARCHAR(100) NOT NULL;
ALTER TABLE cetele ADD COLUMN IF NOT EXISTS yon ENUM('giris','cikis') DEFAULT NULL AFTER hareket_tipi;

-- ── Güzergah atama geçmişi: hareket_tipi (ENUM) → serbest metin + yön ────────
ALTER TABLE guzergah_atama_gecmisi MODIFY COLUMN hareket_tipi VARCHAR(100) DEFAULT NULL;
ALTER TABLE guzergah_atama_gecmisi ADD COLUMN IF NOT EXISTS yon ENUM('giris','cikis') DEFAULT NULL AFTER hareket_tipi;

SET foreign_key_checks = 1;

-- ROLLBACK
-- ALTER TABLE guzergah_atama_gecmisi DROP COLUMN IF EXISTS yon;
-- ALTER TABLE guzergah_atama_gecmisi MODIFY COLUMN hareket_tipi ENUM('sabah','aksam','ring','transfer') DEFAULT NULL;
-- ALTER TABLE cetele DROP COLUMN IF EXISTS yon;
-- ALTER TABLE cetele MODIFY COLUMN hareket_tipi ENUM('sabah','aksam','ring','transfer') NOT NULL;
-- ALTER TABLE routes DROP COLUMN IF EXISTS arac_modu;
-- DROP TABLE IF EXISTS route_tag_links;
-- DROP TABLE IF EXISTS route_tags;
-- DROP TABLE IF EXISTS route_time_slots;
