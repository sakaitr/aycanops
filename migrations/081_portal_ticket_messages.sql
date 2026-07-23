-- Migration: 081_portal_ticket_messages
-- Tarih: 2026-07-23
-- Açıklama: Müşteri destek taleplerine (portal_tickets) karşılıklı yanıt
-- yazılabilmesi ve görsel/dosya eklenebilmesi için mesaj + ek tabloları.

CREATE TABLE IF NOT EXISTS portal_ticket_messages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  ticket_id CHAR(36) NOT NULL,
  sender_type ENUM('customer','staff') NOT NULL,
  sender_customer_user_id CHAR(36) NULL,
  sender_user_id CHAR(36) NULL,
  body TEXT NULL,
  created_at VARCHAR(30) NOT NULL,
  INDEX idx_portal_ticket_messages_ticket (ticket_id),
  CONSTRAINT fk_portal_ticket_messages_ticket FOREIGN KEY (ticket_id) REFERENCES portal_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_ticket_attachments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  message_id CHAR(36) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  INDEX idx_portal_ticket_attachments_message (message_id),
  CONSTRAINT fk_portal_ticket_attachments_message FOREIGN KEY (message_id) REFERENCES portal_ticket_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Var olan tek-mesajlık talepleri (konu+icerik) thread'in ilk mesajı
-- olarak geriye dönük taşı, ki eski kayıtlar da thread görünümünde
-- görünsün.
INSERT INTO portal_ticket_messages (id, ticket_id, sender_type, sender_customer_user_id, body, created_at)
SELECT UUID(), pt.id, 'customer', pt.customer_user_id, pt.icerik, pt.created_at
FROM portal_tickets pt
WHERE NOT EXISTS (SELECT 1 FROM portal_ticket_messages m WHERE m.ticket_id = pt.id);
