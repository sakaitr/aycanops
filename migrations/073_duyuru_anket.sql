-- Sprint 8 — Sosyal + Duyurular + Anket
-- Not: GELISTIRME_PLANI.md'de bu "Migration 067" olarak adlandırılmıştı, ama 067
-- numarası daha önce filo_bildirim_entegrasyon tarafından kullanılmıştı. Gerçek numara 073.
-- created_at/updated_at kod tabanı konvansiyonuna uygun VARCHAR(30) (nowIso() ISO string üretir).

CREATE TABLE duyurular (
  id VARCHAR(36) PRIMARY KEY,
  baslik VARCHAR(200) NOT NULL,
  icerik TEXT,
  hedef_rol ENUM('hepsi','personel','yetkili','yonetici','admin') NOT NULL DEFAULT 'hepsi',
  yayinlanma_tarihi VARCHAR(30),
  bitis_tarihi DATE,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE anketler (
  id VARCHAR(36) PRIMARY KEY,
  baslik VARCHAR(200) NOT NULL,
  sorular JSON NOT NULL,
  hedef_grup VARCHAR(100),
  baslangic_tarihi DATE NOT NULL,
  bitis_tarihi DATE NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_by VARCHAR(36) NOT NULL,
  created_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE anket_yanitlari (
  id VARCHAR(36) PRIMARY KEY,
  anket_id VARCHAR(36) NOT NULL,
  yanit_veren_id VARCHAR(36) NOT NULL,
  yanitlar JSON NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_anket_yanit_kullanici (anket_id, yanit_veren_id),
  CONSTRAINT fk_anket_yanit_anket FOREIGN KEY (anket_id) REFERENCES anketler(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Öneri/Talep/Şikayet genişletme (kullanıcı talebi): kaynak takibi eklendi.
-- Not: status enum'ını ('open','closed' → daha geniş bir set) genişletmek de
-- plandaydı, ama bu ortamdaki MariaDB 11.4 sunucusu "DROP CHECK"/"DROP CONSTRAINT"
-- söz dizimini (standart olmasına rağmen) reddediyor — muhtemelen tünel
-- arkasındaki bir proxy/uyumluluk katmanından kaynaklanıyor. Mevcut CHECK
-- ('open','closed') dokunulmadan bırakıldı, sadece kaynak kolonu eklendi.
ALTER TABLE suggestions
  ADD COLUMN kaynak VARCHAR(50) NULL AFTER category;
