-- Migration: 095_hareket_kaynak_tip_gider
-- Açıklama: finans_hareket.kaynak_tip ENUM'ü yeni "gider" kaynağını içermiyordu
-- (bkz. migration 094, lib/finans-hareket.ts HareketKaynakTip) — canlıda
-- "Data truncated for column 'kaynak_tip'" hatasına yol açtı.

ALTER TABLE finans_hareket
  MODIFY COLUMN kaynak_tip ENUM('fatura','masraf','kasa','hakedis','manuel','gider') NOT NULL;
