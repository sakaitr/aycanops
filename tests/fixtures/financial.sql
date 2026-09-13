-- Minimal isolated schema for real SQL/API regressions. Production relations:
-- migrations 061/064/065/109, 054 and 057/058/110. Not a full migration replay.
CREATE TABLE companies (id VARCHAR(36) PRIMARY KEY, name VARCHAR(255), is_active INT DEFAULT 1);
CREATE TABLE tickets (id VARCHAR(36) PRIMARY KEY, status_code VARCHAR(30), sla_due_at VARCHAR(30), created_at VARCHAR(30), updated_at VARCHAR(30));
CREATE TABLE vehicle_arrivals (id VARCHAR(36) PRIMARY KEY, arrival_date DATE);
CREATE TABLE vehicles (id VARCHAR(36) PRIMARY KEY, plate VARCHAR(50), driver_id VARCHAR(36), created_by VARCHAR(36));
CREATE TABLE routes (id VARCHAR(36) PRIMARY KEY, name VARCHAR(255), company_id VARCHAR(36), vehicle_id VARCHAR(36), updated_at VARCHAR(30));
CREATE TABLE isleten (id VARCHAR(36) PRIMARY KEY, unvan VARCHAR(255), cari_kod VARCHAR(50));
CREATE TABLE ucretlendirme_form_tipi (id VARCHAR(36) PRIMARY KEY, form_adi VARCHAR(200));
CREATE TABLE cetele (
 id VARCHAR(36) PRIMARY KEY, vehicle_id VARCHAR(36), route_id VARCHAR(36), tarih DATE,
 hareket_tipi VARCHAR(100), yon VARCHAR(20), durum VARCHAR(20),
 onaylayan VARCHAR(36), onay_tarihi VARCHAR(30), created_by VARCHAR(36), created_at VARCHAR(30), updated_at VARCHAR(30),
 yolcu_sayisi INT, aciklama TEXT,
 geri_alma_nedeni TEXT,
 FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
 FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL
);
CREATE TABLE route_supplier_prices (
 id VARCHAR(36) PRIMARY KEY, company_id VARCHAR(36), route_id VARCHAR(36),
 vehicle_id VARCHAR(36), plate VARCHAR(50), hareket_tipi VARCHAR(100), yon VARCHAR(20),
 price_amount DECIMAL(12,2), currency VARCHAR(3) DEFAULT 'TRY', valid_from DATE, valid_to DATE,
 FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
);
CREATE TABLE firma_mutabakat (
 id VARCHAR(36) PRIMARY KEY, company_id VARCHAR(36), donem DATE, tutar DECIMAL(12,2),
 para_birimi VARCHAR(3), durum VARCHAR(20), gonderilis_tarihi VARCHAR(30),
 onay_tarihi VARCHAR(30), itiraz_aciklamasi TEXT, aciklama TEXT,
 created_by VARCHAR(36), created_at VARCHAR(30), updated_at VARCHAR(30),
 UNIQUE (company_id, donem)
);
CREATE TABLE hakedis (
 id VARCHAR(36) PRIMARY KEY, isleten_id VARCHAR(36), vehicle_id VARCHAR(36),
 donem_baslangic DATE, donem_bitis DATE, form_tipi_id VARCHAR(36),
 brut_tutar DECIMAL(12,2), kdv_orani DECIMAL(5,2), kdv_tutari DECIMAL(12,2),
 tevkifat_orani DECIMAL(5,2), tevkifat_tutari DECIMAL(12,2), net_tutar DECIMAL(12,2),
 durum VARCHAR(20), aciklama TEXT, tahakkuk_tarihi VARCHAR(30),
 onay_tarihi VARCHAR(30), odeme_tarihi VARCHAR(30),
 created_by VARCHAR(36), created_at VARCHAR(30), updated_at VARCHAR(30)
);
CREATE TABLE hakedis_cetele (
 id VARCHAR(36) PRIMARY KEY, hakedis_id VARCHAR(36), cetele_id VARCHAR(36) UNIQUE,
 tutar DECIMAL(12,2), created_at VARCHAR(30),
 FOREIGN KEY (hakedis_id) REFERENCES hakedis(id) ON DELETE CASCADE,
 FOREIGN KEY (cetele_id) REFERENCES cetele(id) ON DELETE CASCADE
);
CREATE TABLE arac_isleten (vehicle_id VARCHAR(36), isleten_id VARCHAR(36), baslangic_tarihi DATE, bitis_tarihi DATE);
CREATE TABLE company_vehicles (id VARCHAR(36) PRIMARY KEY, company_id VARCHAR(36), vehicle_id VARCHAR(36), plate VARCHAR(50), route_id VARCHAR(36), route_name VARCHAR(255), is_active INT DEFAULT 1, updated_at VARCHAR(30));
CREATE TABLE route_plan_routes (id VARCHAR(36) PRIMARY KEY, route_id VARCHAR(36), vehicle_id VARCHAR(36), updated_at VARCHAR(30));
ALTER TABLE route_plan_routes ADD route_plan_id VARCHAR(36), ADD driver_id VARCHAR(36), ADD name VARCHAR(255),
 ADD metrics_json TEXT, ADD route_order INT DEFAULT 0;
CREATE TABLE route_plans (id VARCHAR(36) PRIMARY KEY, company_id VARCHAR(36), shift_id VARCHAR(36), name VARCHAR(255),
 direction VARCHAR(20) DEFAULT 'morning', status VARCHAR(30) DEFAULT 'draft', version_no INT DEFAULT 1,
 metrics_json TEXT, published_by VARCHAR(36), published_at VARCHAR(30), updated_at VARCHAR(30));
CREATE TABLE company_shifts (id INT PRIMARY KEY, company_id VARCHAR(36), shift_name VARCHAR(100), expected_time TIME, active INT DEFAULT 1);
ALTER TABLE company_shifts MODIFY id INT NOT NULL AUTO_INCREMENT, ADD tolerance_early INT DEFAULT 15, ADD tolerance_late INT DEFAULT 10;
ALTER TABLE route_plans ADD created_by VARCHAR(36), ADD created_at VARCHAR(30);
CREATE TABLE route_plan_stops (id VARCHAR(36) PRIMARY KEY, route_plan_route_id VARCHAR(36), name VARCHAR(255),
 lat DOUBLE, lng DOUBLE, stop_order INT DEFAULT 0, assigned_passenger_count INT DEFAULT 0);
CREATE TABLE route_plan_assignments (id VARCHAR(36) PRIMARY KEY, route_plan_stop_id VARCHAR(36), passenger_id VARCHAR(36));
CREATE TABLE route_plan_versions (id VARCHAR(36) PRIMARY KEY, route_plan_id VARCHAR(36), version_no INT,
 snapshot_json TEXT, created_by VARCHAR(36), created_at VARCHAR(30), UNIQUE(route_plan_id,version_no));
CREATE TABLE passengers (id VARCHAR(36) PRIMARY KEY, route_id VARCHAR(36), updated_at VARCHAR(30));
CREATE TABLE geofences (id VARCHAR(36) PRIMARY KEY, route_id VARCHAR(36), updated_at VARCHAR(30));
CREATE TABLE guzergah_atama_gecmisi (id VARCHAR(36) PRIMARY KEY, route_id VARCHAR(36), vehicle_id VARCHAR(36));
CREATE TABLE driver_assignments (vehicle_id VARCHAR(36));
CREATE TABLE vehicle_documents (vehicle_id VARCHAR(36));
CREATE TABLE vehicle_maintenance (vehicle_id VARCHAR(36));
CREATE TABLE audit_log (id VARCHAR(36) PRIMARY KEY, actor_user_id VARCHAR(36), action VARCHAR(100), entity_type VARCHAR(100), entity_id VARCHAR(36), details_json TEXT, created_at VARCHAR(30));
CREATE TABLE isleten_cari (
 id VARCHAR(36) PRIMARY KEY, isleten_id VARCHAR(36), tarih DATE, tutar DECIMAL(12,2),
 para_girisi DECIMAL(12,2), para_cikisi DECIMAL(12,2), aciklama VARCHAR(500),
 islem_turu VARCHAR(30), referans_id VARCHAR(36), referans_turu VARCHAR(50), created_by VARCHAR(36), created_at VARCHAR(30)
);
CREATE TABLE finans_hareket (
 id VARCHAR(64) PRIMARY KEY, tur VARCHAR(20), tarih DATE, tutar DECIMAL(14,2), net_tutar DECIMAL(14,2),
 kdv_tutari DECIMAL(14,2), para_birimi VARCHAR(10), kur DECIMAL(12,6), tutar_try DECIMAL(14,2),
 cari_id VARCHAR(36), kategori_id VARCHAR(36), vehicle_id VARCHAR(36), route_id VARCHAR(36),
 company_id VARCHAR(36), department_id VARCHAR(36), masraf_merkezi_id VARCHAR(36), proje_id VARCHAR(36),
 personel_id VARCHAR(36), kaynak_tip VARCHAR(20), kaynak_id VARCHAR(36), odeme_durumu VARCHAR(30),
 odenen_tutar DECIMAL(14,2), kasa_banka_id VARCHAR(36), durum VARCHAR(30), aciklama TEXT,
 created_by VARCHAR(36), created_at VARCHAR(30), updated_at VARCHAR(30)
);
CREATE TABLE import_jobs (id VARCHAR(36) PRIMARY KEY, module VARCHAR(30), status VARCHAR(30), skipped_rows INT DEFAULT 0, error_rows INT DEFAULT 0, approved_by VARCHAR(36), updated_at VARCHAR(30));
CREATE TABLE import_job_rows (id VARCHAR(36) PRIMARY KEY, job_id VARCHAR(36), row_no INT, target_id VARCHAR(36), status VARCHAR(30), errors_json TEXT, updated_at VARCHAR(30));

-- Form/search coverage: relevant columns and actual optional relationship constraints.
CREATE TABLE users (id VARCHAR(36) PRIMARY KEY, full_name VARCHAR(200));
ALTER TABLE vehicles ADD supplier_id VARCHAR(36), ADD type VARCHAR(50), ADD capacity INT,
 ADD brand VARCHAR(100), ADD model VARCHAR(100), ADD year INT, ADD driver_name VARCHAR(100),
 ADD driver_phone VARCHAR(30), ADD route_name VARCHAR(255), ADD status_code VARCHAR(50) DEFAULT 'active',
 ADD notes TEXT, ADD ruhsat_sahibi_id VARCHAR(36), ADD created_at VARCHAR(30), ADD updated_at VARCHAR(30);
ALTER TABLE company_vehicles ADD driver_name VARCHAR(100);
ALTER TABLE vehicle_documents ADD expiry_date DATE;
CREATE TABLE odeme_planlari (id VARCHAR(36) PRIMARY KEY, is_active INT DEFAULT 1);
ALTER TABLE passengers ADD company_id VARCHAR(36), ADD full_name VARCHAR(200), ADD phone VARCHAR(50), ADD email VARCHAR(100),
 ADD id_number VARCHAR(50), ADD type VARCHAR(30), ADD pickup_address TEXT, ADD pickup_lat DOUBLE, ADD pickup_lng DOUBLE,
 ADD dropoff_address TEXT, ADD notes TEXT, ADD status VARCHAR(30), ADD sinif VARCHAR(20), ADD sube VARCHAR(10),
 ADD barkod_no VARCHAR(50) UNIQUE, ADD odeme_plani_id VARCHAR(36), ADD sozlesme_durumu VARCHAR(30),
 ADD hizmet_durumu VARCHAR(30), ADD created_by VARCHAR(36), ADD created_at VARCHAR(30),
 ADD FOREIGN KEY (odeme_plani_id) REFERENCES odeme_planlari(id) ON DELETE SET NULL;
