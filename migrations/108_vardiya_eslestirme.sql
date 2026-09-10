-- Migration: 108_vardiya_eslestirme
-- Tarih: 2026-09-11
-- Açıklama: Haftalık personel listesi → tabela (routes.name) + araç eşleştirme.
--   Firmadan gelen ham isim listeleri passengers.route_id'ye bölünür. Elle
--   onaylanan her isim↔yolcu eşleşmesi vardiya_alias'a yazılır ve sonraki
--   listelerde otomatik çözülür (kendi kendine öğrenen cache). vardiya_listesi
--   yüklenen her listenin geçmişini + satır bazlı çözüm durumunu tutar.

SET NAMES utf8mb4;

-- Kendi kendine öğrenen isim eşleştirme cache'i.
CREATE TABLE IF NOT EXISTS vardiya_alias (
  id                  VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id          VARCHAR(36) NOT NULL,
  ham_ad_normalize    VARCHAR(200) NOT NULL,   -- trim + tek boşluk + küçük harf + tr karakter sadeleştirme
  passenger_id        VARCHAR(36) NOT NULL,
  confirmed_by        VARCHAR(36),
  confirmed_at        VARCHAR(30) NOT NULL,
  created_at          VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_alias_company_ad (company_id, ham_ad_normalize),
  INDEX idx_alias_passenger (passenger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Yüklenen liste başlığı.
CREATE TABLE IF NOT EXISTS vardiya_listesi (
  id                VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id        VARCHAR(36) NOT NULL,
  yuklenme_tarihi   VARCHAR(30) NOT NULL,
  satir_sayisi      INT NOT NULL DEFAULT 0,
  eslesen           INT NOT NULL DEFAULT 0,
  eslesmeyen        INT NOT NULL DEFAULT 0,
  not_metni         VARCHAR(500),
  created_by        VARCHAR(36),
  created_at        VARCHAR(30) NOT NULL,
  INDEX idx_vlist_company (company_id, yuklenme_tarihi)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Liste satırı + çözüm durumu (audit/geçmiş).
CREATE TABLE IF NOT EXISTS vardiya_listesi_satir (
  id                VARCHAR(36) NOT NULL PRIMARY KEY,
  liste_id          VARCHAR(36) NOT NULL,
  ham_ad            VARCHAR(200) NOT NULL,
  cozum_durumu      ENUM('exact','alias','fuzzy_onaylandi','yeni_yolcu','atlandi') NOT NULL,
  passenger_id      VARCHAR(36),
  route_id          VARCHAR(36),
  created_at        VARCHAR(30) NOT NULL,
  INDEX idx_vsatir_liste (liste_id),
  FOREIGN KEY (liste_id) REFERENCES vardiya_listesi(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK
-- DROP TABLE IF EXISTS vardiya_listesi_satir;
-- DROP TABLE IF EXISTS vardiya_listesi;
-- DROP TABLE IF EXISTS vardiya_alias;
