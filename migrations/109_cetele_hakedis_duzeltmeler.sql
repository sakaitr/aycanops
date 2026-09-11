-- Migration: 109_cetele_hakedis_duzeltmeler
-- Tarih: 2026-09-11
-- Açıklama: Çetele/hakediş/mutabakat zincirinde eksik foreign key'ler eklenir
--           ve hakedis_cetele'de bir çetele satırının en fazla 1 hakedişe
--           bağlanabilmesi garanti edilir (çift ödeme koruması).
--           2026-09-11 canlı veri kontrolü: hakedis_cetele'de tekrarlanan
--           cetele_id yok (0 satır) — constraint doğrudan eklenebilir.

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

ALTER TABLE cetele
  ADD CONSTRAINT fk_cetele_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL;

ALTER TABLE hakedis
  ADD INDEX IF NOT EXISTS idx_hakedis_vehicle (vehicle_id);

ALTER TABLE hakedis
  ADD CONSTRAINT fk_hakedis_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;

ALTER TABLE firma_mutabakat
  ADD CONSTRAINT fk_mutabakat_company FOREIGN KEY (company_id) REFERENCES companies(id);

-- Bir çetele satırı en fazla 1 hakedişe bağlanabilir — aksi halde aynı günün
-- işçiliği 2 ayrı hakedişten ödenebilir (çift ödeme, uygulama tarafında da
-- ayrıca kontrol edildi, bkz. app/api/hakedis/route.ts).
ALTER TABLE hakedis_cetele
  ADD CONSTRAINT uq_hakedis_cetele_cetele UNIQUE (cetele_id);

SET foreign_key_checks = 1;

-- ROLLBACK
-- ALTER TABLE hakedis_cetele DROP CONSTRAINT uq_hakedis_cetele_cetele;
-- ALTER TABLE firma_mutabakat DROP CONSTRAINT fk_mutabakat_company;
-- ALTER TABLE hakedis DROP CONSTRAINT fk_hakedis_vehicle;
-- ALTER TABLE hakedis DROP INDEX idx_hakedis_vehicle;
-- ALTER TABLE cetele DROP CONSTRAINT fk_cetele_route;
