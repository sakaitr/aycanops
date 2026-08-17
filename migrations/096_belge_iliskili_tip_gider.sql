ALTER TABLE finans_belge
  MODIFY COLUMN iliskili_tip ENUM('fatura','fis','gelir_gider','masraf_talebi','gider') NULL;
