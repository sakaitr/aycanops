-- Migration: 080_nav_config
-- Tarih: 2026-07-23
-- Açıklama: Nav.tsx'teki sabit link/grup yapısını admin panelinden
-- düzenlenebilir hale getiren tek-satırlık JSON config tablosu.

CREATE TABLE IF NOT EXISTS nav_config (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  config_json JSON NOT NULL,
  updated_by VARCHAR(36) NOT NULL,
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO nav_config (id, config_json, updated_by, updated_at)
VALUES (
  'singleton',
  JSON_PRETTY('{
    "groups": [
      {
        "key": "bugun", "label": "Bugün", "sortOrder": 0, "isActive": true, "minRole": null,
        "items": [
          {"id":"bugun-1","href":"/","label":"Panel","icon":"IconHome","permission":"dashboard:read","isActive":true,"sortOrder":0,"isCustom":false},
          {"id":"bugun-2","href":"/gunluk","label":"Günlük","icon":"IconClipboard","permission":"dashboard:read","isActive":true,"sortOrder":1,"isCustom":false},
          {"id":"bugun-3","href":"/giris-kontrol","label":"Giriş Kontrol","icon":"IconTrafficCone","permission":"arrivals:read","isActive":true,"sortOrder":2,"isCustom":false},
          {"id":"bugun-4","href":"/transferler","label":"Transfer","icon":"IconClock","permission":"transfers:read","isActive":true,"sortOrder":3,"isCustom":false},
          {"id":"bugun-5","href":"/cetele","label":"Çetele","icon":"IconClipboard2","permission":"cetele:read","isActive":true,"sortOrder":4,"isCustom":false}
        ]
      },
      {
        "key": "araclar", "label": "Araçlar", "sortOrder": 1, "isActive": true, "minRole": "yetkili",
        "items": [
          {"id":"araclar-1","href":"/araclar","label":"Araçlar","icon":"IconCar","permission":"vehicles:read","isActive":true,"sortOrder":0,"isCustom":false},
          {"id":"araclar-2","href":"/bakim","label":"Araç Bakım","icon":"IconWrench","permission":"maintenance:read","isActive":true,"sortOrder":1,"isCustom":false},
          {"id":"araclar-3","href":"/belgeler","label":"Belgeler","icon":"IconDocument","permission":"documents:read","isActive":true,"sortOrder":2,"isCustom":false},
          {"id":"araclar-4","href":"/denetimler","label":"Denetimler","icon":"IconSearch","permission":"vehicles:read","isActive":true,"sortOrder":3,"isCustom":false},
          {"id":"araclar-5","href":"/filo/kazalar","label":"Kazalar","icon":"IconAlertTriangle","permission":"fleet_accidents:read","isActive":true,"sortOrder":4,"isCustom":false},
          {"id":"araclar-6","href":"/filo/cezalar","label":"Cezalar","icon":"IconAlertTriangle","permission":"fleet_penalties:read","isActive":true,"sortOrder":5,"isCustom":false},
          {"id":"araclar-7","href":"/filo/arizalar","label":"Arızalar","icon":"IconWrench","permission":"fleet_breakdowns:read","isActive":true,"sortOrder":6,"isCustom":false},
          {"id":"araclar-8","href":"/filo/sigortalar","label":"Sigortalar","icon":"IconDocument","permission":"fleet_insurances:read","isActive":true,"sortOrder":7,"isCustom":false},
          {"id":"araclar-9","href":"/filo/lastikler","label":"Lastikler","icon":"IconCar","permission":"fleet_tires:read","isActive":true,"sortOrder":8,"isCustom":false},
          {"id":"araclar-10","href":"/admin/gps-cihazlari","label":"GPS Cihazları","icon":"IconMap","permission":"gps_devices:read","isActive":true,"sortOrder":9,"isCustom":false},
          {"id":"araclar-11","href":"/yakit-kartlari","label":"Yakıt Kartları","icon":"IconZap","permission":"fuel_cards:read","isActive":true,"sortOrder":10,"isCustom":false},
          {"id":"araclar-12","href":"/admin/hgs-ogs","label":"HGS/OGS","icon":"IconCoin","permission":"hgs_ogs:read","isActive":true,"sortOrder":11,"isCustom":false}
        ]
      },
      {
        "key": "insan", "label": "İnsan", "sortOrder": 2, "isActive": true, "minRole": "yetkili",
        "items": [
          {"id":"insan-1","href":"/suruculer","label":"Sürücüler","icon":"IconUsers","permission":"drivers:read","isActive":true,"sortOrder":0,"isCustom":false},
          {"id":"insan-2","href":"/yolcular","label":"Yolcular","icon":"IconUsers","permission":"passengers:read","isActive":true,"sortOrder":1,"isCustom":false},
          {"id":"insan-3","href":"/izin-talepleri","label":"İzin Talepleri","icon":"IconCalendar","permission":"leave_requests:read","isActive":true,"sortOrder":2,"isCustom":false},
          {"id":"insan-4","href":"/sofor-degerlendirme","label":"Sürücü Değerlendirme","icon":"IconStar","permission":"drivers:read","isActive":true,"sortOrder":3,"isCustom":false},
          {"id":"insan-5","href":"/rehberler","label":"Rehberler","icon":"IconUsers","permission":"rehberler:read","isActive":true,"sortOrder":4,"isCustom":false}
        ]
      },
      {
        "key": "rota", "label": "Rota", "sortOrder": 3, "isActive": true, "minRole": "yetkili",
        "items": [
          {"id":"rota-1","href":"/guzergahlar","label":"Güzergahlar","icon":"IconMap","permission":"routes:read","isActive":true,"sortOrder":0,"isCustom":false},
          {"id":"rota-2","href":"/acik-guzergahlar","label":"Açık Güzergahlar","icon":"IconAlertTriangle","permission":"routes:read","isActive":true,"sortOrder":1,"isCustom":false},
          {"id":"rota-3","href":"/rota-planlama","label":"Rota Planlama","icon":"IconCalendar","permission":"routes:optimize","isActive":true,"sortOrder":2,"isCustom":false},
          {"id":"rota-4","href":"/operasyon-haritasi","label":"Operasyon Haritası","icon":"IconMap","permission":"map:read","isActive":true,"sortOrder":3,"isCustom":false},
          {"id":"rota-5","href":"/guzergah-fiyatlari","label":"Güzergah Fiyatları","icon":"IconCoin","permission":"route_prices:read","isActive":true,"sortOrder":4,"isCustom":false}
        ]
      },
      {
        "key": "finans", "label": "Finans", "sortOrder": 4, "isActive": true, "minRole": null,
        "items": [
          {"id":"finans-1","href":"/isletenler","label":"İşletenler (Araç Tedarikçileri)","icon":"IconBuilding","permission":"isleten:read","isActive":true,"sortOrder":0,"isCustom":false},
          {"id":"finans-2","href":"/hakedis","label":"Hakediş","icon":"IconCoin","permission":"hakedis:read","isActive":true,"sortOrder":1,"isCustom":false},
          {"id":"finans-3","href":"/mutabakat","label":"Firma Mutabakat","icon":"IconCoin","permission":"firma_mutabakat:read","isActive":true,"sortOrder":2,"isCustom":false},
          {"id":"finans-4","href":"/kar-zarar","label":"Kâr-Zarar","icon":"IconBarChart","permission":"reports:read","isActive":true,"sortOrder":3,"isCustom":false},
          {"id":"finans-5","href":"/butce","label":"Bütçe & Maliyet","icon":"IconCoin","permission":"budget:read","isActive":true,"sortOrder":4,"isCustom":false},
          {"id":"finans-6","href":"/firmalar","label":"Firmalar (Müşteriler)","icon":"IconBuilding","permission":"companies:read","isActive":true,"sortOrder":5,"isCustom":false},
          {"id":"finans-7","href":"/raporlar","label":"Raporlar","icon":"IconBarChart","permission":"reports:read","isActive":true,"sortOrder":6,"isCustom":false},
          {"id":"finans-8","href":"/finans/gelir-gider","label":"Gelir-Gider","icon":"IconCoin","permission":"finans_gelir_gider:read","isActive":true,"sortOrder":7,"isCustom":false},
          {"id":"finans-9","href":"/finans/masraf-talebi","label":"Masraf Talebi","icon":"IconClipboard2","permission":"finans_masraf_talebi:read","isActive":true,"sortOrder":8,"isCustom":false},
          {"id":"finans-10","href":"/finans/faturalar","label":"Faturalar","icon":"IconDocument","permission":"finans_fatura:read","isActive":true,"sortOrder":9,"isCustom":false},
          {"id":"finans-11","href":"/finans/fisler","label":"Fişler","icon":"IconClipboard2","permission":"finans_fis:read","isActive":true,"sortOrder":10,"isCustom":false},
          {"id":"finans-12","href":"/finans/belgeler","label":"Finans Belgeleri","icon":"IconDocument","permission":"finans_belge:read","isActive":true,"sortOrder":11,"isCustom":false},
          {"id":"finans-13","href":"/finans/odemeler","label":"Ödemeler","icon":"IconCoin","permission":"finans_odeme:read","isActive":true,"sortOrder":12,"isCustom":false},
          {"id":"finans-14","href":"/finans/banka-hareketleri","label":"Banka Hareketleri","icon":"IconActivity","permission":"finans_banka_hareketi:read","isActive":true,"sortOrder":13,"isCustom":false}
        ]
      },
      {
        "key": "gorevler", "label": "Görevler", "sortOrder": 5, "isActive": true, "minRole": null,
        "items": [
          {"id":"gorevler-1","href":"/gorevler","label":"İş Takibi","icon":"IconCheckSquare","permission":"dashboard:read","isActive":true,"sortOrder":0,"isCustom":false},
          {"id":"gorevler-2","href":"/oneriler","label":"Öneri/Talep","icon":"IconLightbulb","permission":"suggestions:read","isActive":true,"sortOrder":1,"isCustom":false},
          {"id":"gorevler-3","href":"/notlar","label":"Notlar","icon":"IconFileText","permission":"dashboard:read","isActive":true,"sortOrder":2,"isCustom":false},
          {"id":"gorevler-4","href":"/surucu-sicil","label":"Sürücü Sicil","icon":"IconClipboard2","permission":"driver_records:read","isActive":true,"sortOrder":3,"isCustom":false}
        ]
      },
      {
        "key": "yonetim", "label": "Yönetim", "sortOrder": 6, "isActive": true, "minRole": null,
        "items": [
          {"id":"yonetim-1","href":"/toplu-islem","label":"Toplu İşlem","icon":"IconClipboard2","permission":"bulk_actions:preview","isActive":true,"sortOrder":0,"isCustom":false,"minRole":"yetkili"},
          {"id":"yonetim-2","href":"/admin/musteriler","label":"Müşteri Portalı","icon":"IconUsers","permission":"portal_requests:read","isActive":true,"sortOrder":1,"isCustom":false,"minRole":"admin"},
          {"id":"yonetim-10","href":"/musteri-destek","label":"Müşteri Destek","icon":"IconMessageCircle","permission":"musteri_destek:read","isActive":true,"sortOrder":2,"isCustom":false,"minRole":"yetkili"},
          {"id":"yonetim-3","href":"/admin/hizli-gorev","label":"Hızlı Görev","icon":"IconZap","permission":"dashboard:read","isActive":true,"sortOrder":3,"isCustom":false,"minRole":"admin"},
          {"id":"yonetim-4","href":"/admin/uyarilar","label":"Uyarılar","icon":"IconAlertTriangle","permission":"warnings:read","isActive":true,"sortOrder":4,"isCustom":false,"minRole":"admin"},
          {"id":"yonetim-5","href":"/admin/izin-onaylayicilar","label":"İzin Onaylayıcıları","icon":"IconShield","permission":"users:read","isActive":true,"sortOrder":5,"isCustom":false,"minRole":"admin"},
          {"id":"yonetim-6","href":"/admin/kara-liste","label":"Kara Liste","icon":"IconAlertTriangle","permission":"kara_liste:read","isActive":true,"sortOrder":6,"isCustom":false,"minRole":"admin"},
          {"id":"yonetim-7","href":"/admin/duyurular","label":"Duyurular","icon":"IconBell","permission":"duyurular:read","isActive":true,"sortOrder":7,"isCustom":false,"minRole":"admin"},
          {"id":"yonetim-8","href":"/admin/anketler","label":"Anketler","icon":"IconClipboard","permission":"anketler:read","isActive":true,"sortOrder":8,"isCustom":false,"minRole":"admin"},
          {"id":"yonetim-9","href":"/admin/dogum-gunleri","label":"Doğum Günleri","icon":"IconStar","permission":"drivers:read","isActive":true,"sortOrder":9,"isCustom":false,"minRole":"admin"}
        ]
      },
      {
        "key": "yonetim-teknik", "label": "Yönetim (Teknik)", "sortOrder": 7, "isActive": true, "minRole": "admin",
        "items": [
          {"id":"teknik-1","href":"/admin/yakit-fiyatlari","label":"Yakıt Fiyatları","icon":"IconCoin","permission":"yakit_fiyatlari:read","isActive":true,"sortOrder":0,"isCustom":false},
          {"id":"teknik-2","href":"/admin/otoyol-fiyatlari","label":"Otoyol/Köprü Fiyatları","icon":"IconCoin","permission":"otoyol_fiyatlari:read","isActive":true,"sortOrder":1,"isCustom":false},
          {"id":"teknik-3","href":"/admin/arac-gruplari","label":"Araç Grupları","icon":"IconCar","permission":"arac_gruplari:read","isActive":true,"sortOrder":2,"isCustom":false},
          {"id":"teknik-4","href":"/admin/sigorta-sirketleri","label":"Sigorta Şirketleri","icon":"IconDocument","permission":"sigorta_sirketleri:read","isActive":true,"sortOrder":3,"isCustom":false},
          {"id":"teknik-5","href":"/admin/banka-tanimlari","label":"Banka Tanımları","icon":"IconBuilding","permission":"banka_tanimlari:read","isActive":true,"sortOrder":4,"isCustom":false},
          {"id":"teknik-6","href":"/admin/donem-tanimlari","label":"Dönem Tanımları","icon":"IconCalendar","permission":"donem_tanimlari:read","isActive":true,"sortOrder":5,"isCustom":false},
          {"id":"teknik-7","href":"/admin/api-keys","label":"API Anahtarları","icon":"IconKey","permission":"integrations:update","isActive":true,"sortOrder":6,"isCustom":false},
          {"id":"teknik-8","href":"/admin/audit-log","label":"Aktivite Günlüğü","icon":"IconHistory","permission":"audit:read","isActive":true,"sortOrder":7,"isCustom":false},
          {"id":"teknik-9","href":"/admin/roller","label":"Roller ve Yetkiler","icon":"IconKey","permission":"users:permissions","isActive":true,"sortOrder":8,"isCustom":false},
          {"id":"teknik-10","href":"/admin","label":"Yönetim Paneli","icon":"IconSettings","permission":"users:read","isActive":true,"sortOrder":9,"isCustom":false}
        ]
      }
    ]
  }'),
  'system',
  '2026-07-23T00:00:00.000Z'
);
