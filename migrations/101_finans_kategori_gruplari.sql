-- Kişi/gruba göre gider kategori görünürlüğü — patron mail'indeki GİDERLER
-- sekmesi (3 kişi grubu, her biri kendi kategori listesini görüyor).
CREATE TABLE IF NOT EXISTS finans_kategori_grubu (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  ad VARCHAR(200) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_kategori_grup_uyelik (
  grup_id VARCHAR(36) NOT NULL,
  kategori_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (grup_id, kategori_id),
  INDEX idx_fkgu_kategori (kategori_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finans_kategori_grup_kullanici (
  grup_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (grup_id, user_id),
  INDEX idx_fkgk_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3 grup
INSERT IGNORE INTO finans_kategori_grubu (id, ad, created_at, updated_at) VALUES
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'Genel', NOW(), NOW()),
  ('607e72f7-cdfa-451e-b786-12db021408c8', 'Operasyon/Araç', NOW(), NOW()),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', 'Sultanbeyli', NOW(), NOW());

-- Excel'deki 31 benzersiz kategori (tümü mevcut genel kategori ağacından
-- farklı, yeni/spesifik operasyonel giderler — üst kategorisiz, düz liste)
INSERT IGNORE INTO finans_kategori (id, ad, tip, is_active, created_at, updated_at) VALUES
  ('96ebca73-dc5c-424a-b533-215d9ec903ca', 'Plaza Mutfak', 'gider', 1, NOW(), NOW()),
  ('bca6bf47-701a-4dfc-8d9b-0c2e21efe803', 'Plaza Sarf Malzeme', 'gider', 1, NOW(), NOW()),
  ('b3ffdd10-176b-4abf-bddf-e566a53d2cf5', 'Plaza Elektrik', 'gider', 1, NOW(), NOW()),
  ('17db7baa-e176-4548-92d1-ec51c855add3', 'Plaza Su', 'gider', 1, NOW(), NOW()),
  ('04c042d3-ce07-4101-8dd8-1e92f0c3fa15', 'Plaza Doğalgaz', 'gider', 1, NOW(), NOW()),
  ('a2664e01-e9a6-4d33-8a33-bcea3587e2df', 'Ofis Giderleri', 'gider', 1, NOW(), NOW()),
  ('2a6ba1c5-db63-488b-9563-6a3e295ee3d3', 'İkramlıklar', 'gider', 1, NOW(), NOW()),
  ('10c0bc39-ad3d-457e-9094-9ac646687fee', 'Araç Yıkama', 'gider', 1, NOW(), NOW()),
  ('d2365d37-050f-43e3-b638-c16cf9822b16', 'Tamir Bakım', 'gider', 1, NOW(), NOW()),
  ('c93f1476-b6d1-4435-8867-e949a4220da7', 'Yakıtlar', 'gider', 1, NOW(), NOW()),
  ('65d91035-60e1-48eb-8528-e892d2fe6ca1', 'HGS', 'gider', 1, NOW(), NOW()),
  ('ed7baaf8-ad7c-421f-8b01-c70916617061', 'Taksi Giderleri', 'gider', 1, NOW(), NOW()),
  ('c0d69a92-d6e0-49e0-8d8d-ab872f37a9ea', 'Matbaa', 'gider', 1, NOW(), NOW()),
  ('c326fdfb-fc64-4bd5-ad0e-edee3194a89f', 'Sultanbeyli Mutfak', 'gider', 1, NOW(), NOW()),
  ('73b72ad3-187d-47c7-a38f-78fbc1963806', 'Sultanbeyli Elektrik', 'gider', 1, NOW(), NOW()),
  ('1dbbb4f5-b7e2-4bb5-a0eb-159a0b5d343d', 'Sultanbeyli Su', 'gider', 1, NOW(), NOW()),
  ('e7d307b3-6670-4846-af1e-efbb0c773b73', 'Sultanbeyli Doğalgaz', 'gider', 1, NOW(), NOW()),
  ('e478e5d5-2dfd-4ee2-afa8-3d8fcde2523e', 'Sultanbeyli Sarf Malzeme', 'gider', 1, NOW(), NOW()),
  ('94e82ce0-41a9-407d-817c-3b0628347cea', 'Telefon', 'gider', 1, NOW(), NOW()),
  ('72aa3cd2-d8e3-4c25-abf5-db9cd7ea647f', 'İnternet', 'gider', 1, NOW(), NOW()),
  ('39d4ea12-9831-44b4-9259-bcaa5565b45e', 'Bursa Yemek Giderleri', 'gider', 1, NOW(), NOW()),
  ('f87d5b55-1a1d-403f-bd0d-83ae7383658e', 'Bursa Elektrik', 'gider', 1, NOW(), NOW()),
  ('12b6871d-866c-41c3-8e0c-ade1c7561ace', 'Bursa Su', 'gider', 1, NOW(), NOW()),
  ('ada9d534-0850-4c89-b927-6dbb1d4af260', 'Bursa Doğalgaz', 'gider', 1, NOW(), NOW()),
  ('ecc6eea3-8149-4ba4-a8a3-07c646f4bde2', 'Ekstra Gider', 'gider', 1, NOW(), NOW()),
  ('05374c88-a35a-4ebd-815b-f54775568665', 'Konaklama', 'gider', 1, NOW(), NOW()),
  ('bb71c5d6-f871-4919-bfe2-a249bd7adeee', 'Peyzaj', 'gider', 1, NOW(), NOW()),
  ('724a9a64-49f7-48e8-a4f6-ca06c82d5b3b', 'Adblue', 'gider', 1, NOW(), NOW()),
  ('5f2f2a7d-445e-4b64-8a22-da14c135a150', 'Sigorta', 'gider', 1, NOW(), NOW()),
  ('5bb29781-0b51-4a43-ae5c-40a8930eddaf', 'Kasko', 'gider', 1, NOW(), NOW()),
  ('a43f7d8f-9744-4c10-995c-5f14cc8bfe2a', 'Muayene', 'gider', 1, NOW(), NOW());

-- Grup 1: Genel (Bayram-Doğan-Hüsna-Murat E.) — 24 kategori
INSERT IGNORE INTO finans_kategori_grup_uyelik (grup_id, kategori_id) VALUES
  ('bb59bee4-8170-469f-93f0-57eae37d4653', '96ebca73-dc5c-424a-b533-215d9ec903ca'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'bca6bf47-701a-4dfc-8d9b-0c2e21efe803'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'b3ffdd10-176b-4abf-bddf-e566a53d2cf5'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', '17db7baa-e176-4548-92d1-ec51c855add3'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', '04c042d3-ce07-4101-8dd8-1e92f0c3fa15'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'a2664e01-e9a6-4d33-8a33-bcea3587e2df'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', '2a6ba1c5-db63-488b-9563-6a3e295ee3d3'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', '10c0bc39-ad3d-457e-9094-9ac646687fee'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'd2365d37-050f-43e3-b638-c16cf9822b16'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'c93f1476-b6d1-4435-8867-e949a4220da7'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', '65d91035-60e1-48eb-8528-e892d2fe6ca1'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'ed7baaf8-ad7c-421f-8b01-c70916617061'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'c0d69a92-d6e0-49e0-8d8d-ab872f37a9ea'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'c326fdfb-fc64-4bd5-ad0e-edee3194a89f'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', '73b72ad3-187d-47c7-a38f-78fbc1963806'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', '1dbbb4f5-b7e2-4bb5-a0eb-159a0b5d343d'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'e7d307b3-6670-4846-af1e-efbb0c773b73'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', '94e82ce0-41a9-407d-817c-3b0628347cea'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', '72aa3cd2-d8e3-4c25-abf5-db9cd7ea647f'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', '39d4ea12-9831-44b4-9259-bcaa5565b45e'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'f87d5b55-1a1d-403f-bd0d-83ae7383658e'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', '12b6871d-866c-41c3-8e0c-ade1c7561ace'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'ada9d534-0850-4c89-b927-6dbb1d4af260'),
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'ecc6eea3-8149-4ba4-a8a3-07c646f4bde2');

-- Grup 2: Operasyon/Araç (Murat Yıldız-Aleyna) — 17 kategori
INSERT IGNORE INTO finans_kategori_grup_uyelik (grup_id, kategori_id) VALUES
  ('607e72f7-cdfa-451e-b786-12db021408c8', '96ebca73-dc5c-424a-b533-215d9ec903ca'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', 'bca6bf47-701a-4dfc-8d9b-0c2e21efe803'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', 'a2664e01-e9a6-4d33-8a33-bcea3587e2df'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', '05374c88-a35a-4ebd-815b-f54775568665'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', '2a6ba1c5-db63-488b-9563-6a3e295ee3d3'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', '10c0bc39-ad3d-457e-9094-9ac646687fee'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', 'd2365d37-050f-43e3-b638-c16cf9822b16'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', 'c93f1476-b6d1-4435-8867-e949a4220da7'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', '65d91035-60e1-48eb-8528-e892d2fe6ca1'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', 'ed7baaf8-ad7c-421f-8b01-c70916617061'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', 'c0d69a92-d6e0-49e0-8d8d-ab872f37a9ea'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', 'bb71c5d6-f871-4919-bfe2-a249bd7adeee'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', '724a9a64-49f7-48e8-a4f6-ca06c82d5b3b'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', 'ecc6eea3-8149-4ba4-a8a3-07c646f4bde2'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', '5f2f2a7d-445e-4b64-8a22-da14c135a150'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', '5bb29781-0b51-4a43-ae5c-40a8930eddaf'),
  ('607e72f7-cdfa-451e-b786-12db021408c8', 'a43f7d8f-9744-4c10-995c-5f14cc8bfe2a');

-- Grup 3: Sultanbeyli (Büşra) — 17 kategori
INSERT IGNORE INTO finans_kategori_grup_uyelik (grup_id, kategori_id) VALUES
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', 'c326fdfb-fc64-4bd5-ad0e-edee3194a89f'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', 'e478e5d5-2dfd-4ee2-afa8-3d8fcde2523e'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', '73b72ad3-187d-47c7-a38f-78fbc1963806'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', '1dbbb4f5-b7e2-4bb5-a0eb-159a0b5d343d'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', 'e7d307b3-6670-4846-af1e-efbb0c773b73'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', '94e82ce0-41a9-407d-817c-3b0628347cea'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', '72aa3cd2-d8e3-4c25-abf5-db9cd7ea647f'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', 'a2664e01-e9a6-4d33-8a33-bcea3587e2df'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', '2a6ba1c5-db63-488b-9563-6a3e295ee3d3'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', '10c0bc39-ad3d-457e-9094-9ac646687fee'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', 'd2365d37-050f-43e3-b638-c16cf9822b16'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', 'c93f1476-b6d1-4435-8867-e949a4220da7'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', '65d91035-60e1-48eb-8528-e892d2fe6ca1'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', 'ed7baaf8-ad7c-421f-8b01-c70916617061'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', 'c0d69a92-d6e0-49e0-8d8d-ab872f37a9ea'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', 'bb71c5d6-f871-4919-bfe2-a249bd7adeee'),
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', 'ecc6eea3-8149-4ba4-a8a3-07c646f4bde2');

-- Kullanıcı grup üyelikleri (patron mail'indeki isim eşleşmeleri)
INSERT IGNORE INTO finans_kategori_grup_kullanici (grup_id, user_id) VALUES
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'fd61aaff-4b23-4fd2-971f-1a55c8860891'), -- Doğan Aksoy
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'de4018d7-e0aa-439d-95c5-1521806f9e15'), -- Bayram Aksoy
  ('bb59bee4-8170-469f-93f0-57eae37d4653', '13cec318-37a7-4b72-8d89-49e437daa956'), -- Hüsna Kiracı
  ('bb59bee4-8170-469f-93f0-57eae37d4653', 'ace4b923-fdf2-495e-b9e3-c0b86523525f'), -- Murat Ertürk
  ('607e72f7-cdfa-451e-b786-12db021408c8', '43becdb2-86c8-4cc2-816d-818aed4d94f5'), -- Murat Yıldız
  ('607e72f7-cdfa-451e-b786-12db021408c8', '3f3825d9-560b-4edd-bf9c-e97e2759d3c3'), -- Aleyna Kara
  ('b607ef2c-38d9-4e41-b93e-b1ca96a1d81b', '5eb8d587-483a-4961-bc1b-02a6d76fa9e4'); -- Büşra Başar
