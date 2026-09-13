const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
const { createLoader } = require("./helpers/load-ts.cjs");

// No .env loading, remote hostname, configurable database name or production data.
// Start a disposable local MySQL and pass its non-default port explicitly.
const port = Number(process.env.AYCANOPS_TEST_MYSQL_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3306) {
  throw new Error("AYCANOPS_TEST_MYSQL_PORT must point to a disposable local MySQL on a non-default port.");
}
const database = "aycanops_financial_test_" + process.pid;
Object.assign(process.env, { DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_USER: "root", DB_PASS: "", DB_NAME: database });
let user = { id: "test-admin", role: "admin", allowed_companies: null };
const load = createLoader({ "@/lib/auth": { requireUser: async () => user } });
const { getDb } = load("lib/db.ts");
const settlement = load("app/api/firma-mutabakat/route.ts");
const settlementDetail = load("app/api/firma-mutabakat/[id]/route.ts");
const hakedis = load("app/api/hakedis/route.ts");
const hakedisDetail = load("app/api/hakedis/[id]/route.ts");
const bulkHakedis = load("app/api/hakedis/tahakkuk-toplu/route.ts");
const vehicle = load("app/api/vehicles/[id]/route.ts");
const vehicles = load("app/api/vehicles/route.ts");
const passengers = load("app/api/yolcular/route.ts");
const passenger = load("app/api/yolcular/[id]/route.ts");
const route = load("app/api/routes/[id]/route.ts");
const planPublish = load("app/api/route-plans/[id]/publish/route.ts");
const planCreate = load("app/api/route-plans/route.ts");
const shifts = load("app/api/company-shifts/route.ts");
const kpi = load("app/api/stats/kpi/route.ts");
const bulkCetele = load("app/api/cetele/bulk/route.ts");
const ceteleCreate = load("app/api/cetele/route.ts");
const ceteleDetail = load("app/api/cetele/[id]/route.ts");
const companyVehicle = load("app/api/companies/[id]/vehicles/route.ts");
const { rollbackImportJob } = load("lib/import-center.ts");
let conn;
const query = (...args) => conn.query(...args);
const params = (id) => ({ params: Promise.resolve({ id }) });
const request = (method, body, suffix = "") => new Request("http://localhost/test" + suffix, {
  method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});
const count = async (table) => Number((await query("SELECT COUNT(*) AS n FROM " + table))[0][0].n);
const addPrice = (id = "price", amount = 100, yon = null, from = "2026-09-01", currency = "TRY") =>
  query("INSERT INTO route_supplier_prices (id,company_id,route_id,vehicle_id,price_amount,yon,valid_from,currency) VALUES (?,'company','route','vehicle',?,?,?,?)", [id, amount, yon, from, currency]);
const addAgreement = (amount = 200, durum = "itiraz") =>
  query("INSERT INTO firma_mutabakat (id,company_id,donem,tutar,para_birimi,durum) VALUES ('agreement','company','2026-09-01',?,'TRY',?)", [amount, durum]);
const createHakedis = (extra = {}) => hakedis.POST(request("POST", {
  isleten_id: "operator", donem_baslangic: "2026-09-01", donem_bitis: "2026-09-30",
  brut_tutar: "100", kdv_orani: "20", tevkifat_orani: "50", ...extra,
}));
const hakedisAction = (id, action) => hakedisDetail.PUT(request("PUT", { action }), params(id));

test("SLA sıfır gözlemde yüzde yüz yerine veri yok döndürür", async () => {
  const res = await kpi.GET();
  assert.equal(res.status, 200);
  const sla = (await res.json()).data.sla;
  assert.equal(sla.total, 0);
  assert.equal(sla.percent, null);
  assert.equal(sla.data_status, "no_data");
});
test("KPI giriş grafiğinin son noktası İstanbul bugün tarihine aittir", async () => {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
  await query("INSERT INTO vehicle_arrivals VALUES ('arrival',?)", [today]);
  const data = (await (await kpi.GET()).json()).data;
  assert.equal(data.arrivals.today, 1);
  assert.equal(data.arrivals.spark.at(-1), 1);
  assert.equal(data.arrivals.spark.reduce((a, b) => a + b, 0), 1);
});
test("SLA sorgu hatasını boş veri olarak sunmaz", async () => {
  await query("RENAME TABLE tickets TO tickets_test_unavailable");
  try {
    const sla = (await (await kpi.GET()).json()).data.sla;
    assert.equal(sla.percent, null);
    assert.equal(sla.data_status, "unavailable");
  } finally { await query("RENAME TABLE tickets_test_unavailable TO tickets"); }
});
const publishPlan = (body = { activate: true }) => planPublish.POST(request("POST", body), params("plan"));
async function validPlan() {
  await query("INSERT INTO company_shifts(id,company_id,shift_name,expected_time,active) VALUES (1,'company','Sabah','08:00:00',1)");
  await query("INSERT INTO route_plans(id,company_id,shift_id,name) VALUES ('plan','company','1','Test Plan')");
  await query("INSERT INTO route_plan_routes(id,route_plan_id,vehicle_id,name) VALUES ('pr','plan','vehicle','Manuel Rota')");
  await query("UPDATE vehicles SET capacity=2");
  await query("INSERT INTO route_plan_stops VALUES ('stop','pr','Test Durak',41,29,0,2)");
}

test("duraksız plan yayınlanamaz", async () => {
  await validPlan(); await query("DELETE FROM route_plan_stops");
  assert.equal((await publishPlan()).status, 409);
  assert.equal((await query("SELECT status FROM route_plans"))[0][0].status, "draft");
});

test("okuma sonrası aktifleştirilen plan eski düzenleme isteğiyle ezilemez", async () => {
  await validPlan();
  const realDb = getDb();
  let activateBetweenReadAndWrite = true;
  const raceDb = { ...realDb, prepare(sql) {
    const stmt = realDb.prepare(sql);
    return { ...stmt, async get(...args) {
      const result = await stmt.get(...args);
      if (activateBetweenReadAndWrite && sql.includes("FROM route_plans rp")) {
        activateBetweenReadAndWrite = false;
        await query("UPDATE route_plans SET status='active' WHERE id='plan'");
      }
      return result;
    } };
  } };
  const raceLoad = createLoader({ "@/lib/auth": { requireUser: async () => user }, "@/lib/db": { getDb: () => raceDb }, "./db": { getDb } });
  const planDetail = raceLoad("app/api/route-plans/[id]/route.ts");
  const res = await planDetail.PUT(request("PUT", { name: "Eski istek" }), params("plan"));
  assert.equal(res.status, 409);
  const saved = (await query("SELECT status,name FROM route_plans WHERE id='plan'"))[0][0];
  assert.equal(saved.status, "active"); assert.equal(saved.name, "Test Plan");
  assert.equal(await count("route_plan_routes"), 1);
});

test("optimizasyon sürerken aktifleştirilen plan sonuçla ezilemez", async () => {
  await validPlan();
  await query("INSERT INTO passengers(id,company_id,full_name,status,pickup_lat,pickup_lng) VALUES ('p','company','Test Yolcu','aktif',41,29)");
  // Replace the external routing engine only; every plan read/write remains real SQL.
  const raceLoad = createLoader({ "@/lib/auth": { requireUser: async () => user }, "@/lib/db": { getDb }, "./db": { getDb }, "@/lib/planner": {
    planRoutes: async () => {
      await query("UPDATE route_plans SET status='active' WHERE id='plan'");
      return { engine: "synthetic", vehicles: [], unassigned: [], total_distance: 0, total_duration: 0 };
    },
  } });
  const optimize = raceLoad("app/api/route-plans/[id]/optimize/route.ts");
  const res = await optimize.POST(request("POST", { depot_lat: 41, depot_lng: 29, vehicle_ids: ["vehicle"] }), params("plan"));
  assert.equal(res.status, 409);
  assert.equal((await query("SELECT status FROM route_plans"))[0][0].status, "active");
  assert.equal(await count("route_plan_routes"), 1);
});

test("firma kapsamı dışındaki kullanıcı plan oluşturamaz", async () => {
  user.allowed_companies = JSON.stringify(["other"]);
  const res = await planCreate.POST(request("POST", { name: "Yetkisiz plan", company_id: "company", seed_from_routes: false }));
  assert.equal(res.status, 403);
  assert.equal(await count("route_plans"), 0);
});
test("plan başka firmanın vardiyasını kullanamaz", async () => {
  await validPlan();
  const res = await planCreate.POST(request("POST", { name: "Yanlış vardiya", company_id: "other", shift_id: "1", seed_from_routes: false }));
  assert.equal(res.status, 409);
  assert.equal(await count("route_plans"), 1);
});
test("vardiya API tüm yöntemlerde firma kapsamını uygular", async () => {
  await validPlan(); user.allowed_companies = JSON.stringify(["other"]);
  const responses = await Promise.all([
    shifts.GET(request("GET", undefined, "?company_id=company")),
    shifts.POST(request("POST", { company_id: "company", shift_name: "Yetkisiz", expected_time: "09:00" })),
    shifts.PUT(request("PUT", { id: 1, shift_name: "Yetkisiz" })),
    shifts.DELETE(request("DELETE", undefined, "?id=1")),
  ]);
  assert.deepEqual(responses.map(r => r.status), [403, 403, 403, 403]);
  assert.equal(await count("company_shifts"), 1);
  const row = (await query("SELECT shift_name, active FROM company_shifts WHERE id=1"))[0][0];
  assert.equal(row.shift_name, "Sabah"); assert.equal(row.active, 1);
});
test("planlanan üç yolcu iki koltuğa atanamaz", async () => {
  await validPlan(); await query("UPDATE route_plan_stops SET assigned_passenger_count=3");
  assert.equal((await publishPlan()).status, 409);
});
test("pasif firma veya araç ile plan yayınlanamaz", async () => {
  await validPlan(); await query("UPDATE companies SET is_active=0 WHERE id='company'");
  assert.equal((await publishPlan()).status, 409);
  await query("UPDATE companies SET is_active=1"); await query("UPDATE vehicles SET status_code='inactive'");
  assert.equal((await publishPlan()).status, 409);
});
test("saat dayanağı olmayan plan yayınlanamaz", async () => {
  await validPlan(); await query("UPDATE route_plans SET shift_id=NULL");
  assert.equal((await publishPlan()).status, 409);
});
test("geçerli manuel plan optimizasyon zorunluluğu olmadan yayınlanır", async () => {
  await validPlan();
  assert.equal((await publishPlan()).status, 200);
  assert.equal((await query("SELECT status FROM route_plans"))[0][0].status, "active");
});
test("aktif plan gerekçeyle arşivlenir ve rota geçmişi kalır", async () => {
  await validPlan(); await query("UPDATE route_plans SET status='active'");
  assert.equal((await publishPlan({ archive: true, reason: "Test planını kaldır" })).status, 200);
  assert.equal((await query("SELECT status FROM route_plans"))[0][0].status, "archived");
  assert.equal(await count("route_plan_routes"), 1);
});
test("plan yayın audit hatası aktifliği değiştirmez", async () => {
  await validPlan();
  await query("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic audit failure'");
  try {
    assert.equal((await publishPlan()).status, 500);
    assert.equal((await query("SELECT status FROM route_plans"))[0][0].status, "draft");
  } finally { await query("DROP TRIGGER reject_audit"); }
});

test("mali dayanak SQL update ve delete ile değiştirilemez", async () => {
  await createHakedis();
  assert.equal(await count("financial_snapshots"), 1);
  await assert.rejects(query("UPDATE financial_snapshots SET event='tampered'"), /append-only/);
  await assert.rejects(query("DELETE FROM financial_snapshots"), /append-only/);
  assert.equal(await count("financial_snapshots"), 1);
});

test("mali dayanak yazılamazsa hakediş ve hizmet bağları oluşmaz", async () => {
  await addPrice();
  await query("CREATE TRIGGER reject_snapshot BEFORE INSERT ON financial_snapshots FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic snapshot failure'");
  try {
    assert.equal((await createHakedis({ cetele_ids: ["in", "out"] })).status, 500);
    assert.equal(await count("hakedis"), 0);
    assert.equal(await count("hakedis_cetele"), 0);
  } finally { await query("DROP TRIGGER reject_snapshot"); }
});

test("hakediş hizmet dayanağı ad plaka fiyat ve hizmet silinse de korunur", async () => {
  await addPrice();
  const { data } = await (await createHakedis({ cetele_ids: ["in", "out"] })).json();
  await query("UPDATE routes SET name='Yeni Hat'");
  await query("UPDATE vehicles SET plate='34 NEW 1'");
  await query("DELETE FROM cetele");
  await query("DELETE FROM audit_log");
  const res = await hakedisDetail.GET(request("GET"), params(data.id));
  assert.equal(res.status, 200);
  const saved = (await res.json()).data;
  assert.equal(saved.calculation_source, "financial_snapshot");
  assert.equal(saved.cetele.length, 2);
  assert.equal(saved.cetele[0].plate, "34 TEST 1");
  assert.equal(saved.cetele[0].route_name, "Test Hat");
  assert.equal(saved.cetele.reduce((sum, c) => sum + Number(c.tutar), 0), 200);
});

test("mutabakat onay dayanağı audit temizliğinden bağımsızdır", async () => {
  await addPrice();
  const { data } = await (await settlement.POST(request("POST", { company_id: "company", donem: "2026-09-01" }))).json();
  assert.equal((await settlementDetail.PUT(request("PUT", { action: "onayla" }), params(data.id))).status, 200);
  await query("DELETE FROM cetele");
  await query("DELETE FROM audit_log");
  const saved = (await (await settlementDetail.GET(request("GET"), params(data.id))).json()).data;
  assert.equal(saved.calculation_source, "financial_snapshot");
  assert.equal(saved.cetele.length, 2);
  assert.equal(saved.historical_evidence_missing, false);
});

test("toplu tahakkuk audit hatasında ilgili kaydı taslak bırakır", async () => {
  const { data } = await (await createHakedis()).json();
  await query("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic audit failure'");
  try {
    assert.equal((await bulkHakedis.POST(request("POST", { ids: [data.id] }))).status, 500);
    assert.equal((await query("SELECT durum FROM hakedis"))[0][0].durum, "taslak");
  } finally { await query("DROP TRIGGER reject_audit"); }
});

test("taslak silme audit hatasında hizmet bağlantılarını korur", async () => {
  await addPrice();
  const { data } = await (await createHakedis({ cetele_ids: ["in", "out"] })).json();
  await query("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic audit failure'");
  try {
    assert.equal((await hakedisDetail.DELETE(request("DELETE"), params(data.id))).status, 500);
    assert.equal(await count("hakedis"), 1);
    assert.equal(await count("hakedis_cetele"), 2);
  } finally { await query("DROP TRIGGER reject_audit"); }
});

test("defter dayanağı eksik eski onaylı hakediş ödeme işaretlenemez", async () => {
  const { data } = await (await createHakedis()).json();
  await query("UPDATE hakedis SET durum='onaylandi'");
  assert.equal((await hakedisAction(data.id, "odendi")).status, 409);
  assert.equal((await query("SELECT durum FROM hakedis"))[0][0].durum, "onaylandi");
  assert.equal(await count("isleten_cari"), 0);
});

test("cari yazımı başarısızsa hakediş onay durumuna geçmez", async () => {
  const { data } = await (await createHakedis()).json();
  assert.equal((await hakedisAction(data.id, "tahakkuk")).status, 200);
  await query("CREATE TRIGGER reject_cari BEFORE INSERT ON isleten_cari FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic cari failure'");
  try {
    assert.equal((await hakedisAction(data.id, "onayla")).status, 500);
    assert.equal((await query("SELECT durum FROM hakedis"))[0][0].durum, "tahakkuk");
    assert.equal(await count("finans_hareket"), 0);
  } finally { await query("DROP TRIGGER reject_cari"); }
});

test("eşzamanlı hakediş onayı ve ödeme birer cari hareket üretir", async () => {
  const { data } = await (await createHakedis()).json();
  await hakedisAction(data.id, "tahakkuk");
  const approvals = await Promise.all([hakedisAction(data.id, "onayla"), hakedisAction(data.id, "onayla")]);
  assert.deepEqual(approvals.map(r => r.status).sort(), [200, 400]);
  assert.equal(await count("isleten_cari"), 1);
  assert.equal(await count("finans_hareket"), 1);
  const payments = await Promise.all([hakedisAction(data.id, "odendi"), hakedisAction(data.id, "odendi")]);
  assert.deepEqual(payments.map(r => r.status).sort(), [200, 400]);
  assert.equal(await count("isleten_cari"), 2);
  const ledger = (await query("SELECT * FROM finans_hareket"))[0][0];
  assert.equal(Number(ledger.tutar), 120);
  assert.equal(Number(ledger.odenen_tutar), 110);
  assert.equal(ledger.odeme_durumu, "odendi");
});

test("tek defter hatası hakediş onayını ve cari hareketini geri alır", async () => {
  const { data } = await (await createHakedis()).json();
  await hakedisAction(data.id, "tahakkuk");
  await query("CREATE TRIGGER reject_ledger BEFORE INSERT ON finans_hareket FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic ledger failure'");
  try {
    assert.equal((await hakedisAction(data.id, "onayla")).status, 500);
    assert.equal((await query("SELECT durum FROM hakedis"))[0][0].durum, "tahakkuk");
    assert.equal(await count("isleten_cari"), 0);
  } finally { await query("DROP TRIGGER reject_ledger"); }
});

test("ödeme audit hatası durum cari ve defteri geri alır", async () => {
  const { data } = await (await createHakedis()).json();
  await hakedisAction(data.id, "tahakkuk");
  assert.equal((await hakedisAction(data.id, "onayla")).status, 200);
  await query("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic audit failure'");
  try {
    assert.equal((await hakedisAction(data.id, "odendi")).status, 500);
    assert.equal((await query("SELECT durum FROM hakedis"))[0][0].durum, "onaylandi");
    assert.equal(await count("isleten_cari"), 1);
    assert.equal(Number((await query("SELECT odenen_tutar FROM finans_hareket"))[0][0].odenen_tutar), 0);
  } finally { await query("DROP TRIGGER reject_audit"); }
});

before(async () => {
  conn = await mysql.createConnection({ host: "127.0.0.1", port, user: "root", password: "", multipleStatements: true, timezone: "+03:00" });
  await query("CREATE DATABASE " + database + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  await conn.changeUser({ database });
  await query(fs.readFileSync(path.join(__dirname, "fixtures/financial.sql"), "utf8"));
  await query(fs.readFileSync(path.join(__dirname, "../migrations/113_financial_snapshots.sql"), "utf8"));
});
beforeEach(async () => {
  user = { id: "test-admin", role: "admin", allowed_companies: null };
  const [tables] = await query("SHOW TABLES");
  await query("SET FOREIGN_KEY_CHECKS=0");
  for (const row of tables) await query("TRUNCATE TABLE " + Object.values(row)[0]);
  await query("SET FOREIGN_KEY_CHECKS=1");
  await query("INSERT INTO companies VALUES ('company','Test Firma',1),('other','Diğer Firma',1)");
  await query("INSERT INTO vehicles (id,plate) VALUES ('vehicle','34 TEST 1')");
  await query("INSERT INTO routes (id,name,company_id,vehicle_id) VALUES ('route','Test Hat','company','vehicle')");
  await query("INSERT INTO cetele (id,vehicle_id,route_id,tarih,hareket_tipi,yon,durum) VALUES ('in','vehicle','route','2026-09-12','Genel','giris','onaylandi'),('out','vehicle','route','2026-09-12','Genel','cikis','onaylandi')");
  await query("INSERT INTO isleten VALUES ('operator','Test İşleten','TEST')");
  await query("INSERT INTO arac_isleten VALUES ('vehicle','operator','2026-09-01',NULL)");
  await query("INSERT INTO company_vehicles (id,company_id,vehicle_id,plate,route_id) VALUES ('cv','company','vehicle','34 TEST 1','route')");
});
after(async () => {
  await getDb().pool.end();
  if (conn) { await query("DROP DATABASE " + database); await conn.end(); }
});

const bulkRequest = () => request("POST", { tarih: "2026-09-13", entries: [{ route_id: "route", vehicle_id: "vehicle", hareket_tipi: "Genel", yon: "giris" }] });
const cancelCetele = (reason = "Hizmet gerçekleşmedi") => ceteleDetail.PUT(request("PUT", { action: "iptal", geri_alma_nedeni: reason }), params("in"));
test("çetele iptali boş gerekçeyi reddeder", async () => {
  assert.equal((await cancelCetele("  ")).status, 400);
  assert.equal((await query("SELECT durum FROM cetele WHERE id='in'"))[0][0].durum, "onaylandi");
});
test("hakedişe bağlı çetele doğrudan iptal edilemez", async () => {
  await addPrice();
  assert.equal((await createHakedis({ cetele_ids: ["in"] })).status, 201);
  assert.equal((await cancelCetele()).status, 409);
  assert.equal((await query("SELECT durum FROM cetele WHERE id='in'"))[0][0].durum, "onaylandi");
});
test("hakediş oluşturma ve iptal yarışı çelişkili hizmet bırakmaz", async () => {
  await addPrice();
  const [finance, cancel] = await Promise.all([createHakedis({ cetele_ids: ["in"] }), cancelCetele()]);
  const state = (await query("SELECT durum FROM cetele WHERE id='in'"))[0][0].durum;
  if (finance.status === 201) {
    assert.equal(cancel.status, 409);
    assert.equal(state, "onaylandi");
    assert.equal(await count("hakedis_cetele"), 1);
  } else {
    assert.equal(finance.status, 409);
    assert.equal(cancel.status, 200);
    assert.equal(state, "iptal");
    assert.equal(await count("hakedis_cetele"), 0);
  }
});
test("çetele iptali ortak araç üzerinden firma kapsamını aşamaz", async () => {
  user.allowed_companies = JSON.stringify(["company"]);
  await query("UPDATE routes SET company_id='other'");
  assert.equal((await cancelCetele()).status, 403);
  assert.equal((await query("SELECT durum FROM cetele WHERE id='in'"))[0][0].durum, "onaylandi");
});
test("çetele iptal audit hatası hizmet durumunu değiştirmez", async () => {
  await query("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic audit failure'");
  try {
    assert.equal((await cancelCetele()).status, 500);
    assert.equal((await query("SELECT durum FROM cetele WHERE id='in'"))[0][0].durum, "onaylandi");
  } finally { await query("DROP TRIGGER reject_audit"); }
});
test("çetele tekrar iptal edilince ilk gerekçe ve audit korunur", async () => {
  assert.equal((await cancelCetele()).status, 200);
  assert.equal((await cancelCetele("Başka gerekçe")).status, 409);
  assert.equal((await query("SELECT geri_alma_nedeni FROM cetele WHERE id='in'"))[0][0].geri_alma_nedeni, "Hizmet gerçekleşmedi");
  assert.equal(await count("audit_log"), 1);
});
test("eşzamanlı çetele onayı tek audit üretir", async () => {
  await query("UPDATE cetele SET durum='bekliyor' WHERE id='in'");
  const responses = await Promise.all(Array.from({ length: 5 }, () => ceteleDetail.PUT(request("PUT", { action: "onayla" }), params("in"))));
  assert.equal(responses.filter(r => r.status === 200).length, 1);
  assert.equal(await count("audit_log"), 1);
});
test("çetele onay audit hatası kaydı bekliyor bırakır", async () => {
  await query("UPDATE cetele SET durum='bekliyor' WHERE id='in'");
  await query("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic audit failure'");
  try {
    assert.equal((await ceteleDetail.PUT(request("PUT", { action: "onayla" }), params("in"))).status, 500);
    assert.equal((await query("SELECT durum FROM cetele WHERE id='in'"))[0][0].durum, "bekliyor");
  } finally { await query("DROP TRIGGER reject_audit"); }
});
const manualRequest = () => request("POST", { tarih: "2026-09-13", route_id: "route", vehicle_id: "vehicle", hareket_tipi: "Genel", yon: "giris" });
test("manuel çetele toplu onaylanmış hizmeti tekrar oluşturamaz", async () => {
  await bulkCetele.POST(bulkRequest());
  assert.equal((await ceteleCreate.POST(manualRequest())).status, 409);
  assert.equal(await count("cetele"), 3);
});
test("manuel ve toplu çetele aynı hizmet kilidini paylaşır", async () => {
  const responses = await Promise.all([ceteleCreate.POST(manualRequest()), bulkCetele.POST(bulkRequest())]);
  assert.ok([201, 409].includes(responses[0].status));
  assert.equal(responses[1].status, 201);
  assert.equal(await count("cetele"), 3);
});
test("manuel çetele başka firmanın güzergahını ortak araçla kullanamaz", async () => {
  user.allowed_companies = JSON.stringify(["company"]);
  await query("UPDATE routes SET company_id='other'");
  assert.equal((await ceteleCreate.POST(manualRequest())).status, 403);
  assert.equal(await count("cetele"), 2);
});
test("manuel çetele audit hatasında geri alınır", async () => {
  await query("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic audit failure'");
  try {
    assert.equal((await ceteleCreate.POST(manualRequest())).status, 500);
    assert.equal(await count("cetele"), 2);
  } finally { await query("DROP TRIGGER reject_audit"); }
});
test("eşzamanlı toplu onay aynı hizmeti bir kez oluşturur", async () => {
  const responses = await Promise.all(Array.from({ length: 8 }, () => bulkCetele.POST(bulkRequest())));
  for (const res of responses) assert.equal(res.status, 201);
  assert.equal(await count("cetele"), 3);
  assert.equal(await count("audit_log"), 1);
});
test("toplu çetele audit hatasında kayıt geri alınır", async () => {
  await query("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic audit failure'");
  try {
    assert.equal((await bulkCetele.POST(bulkRequest())).status, 500);
    assert.equal(await count("cetele"), 2);
  } finally { await query("DROP TRIGGER reject_audit"); }
});
test("toplu çetele bekleyen kaydı onaylandı diye sunmaz", async () => {
  await query("UPDATE cetele SET durum='bekliyor',tarih='2026-09-13' WHERE id='in'");
  const res = await bulkCetele.POST(bulkRequest());
  const data = (await res.json()).data;
  assert.equal(data.created, 0);
  assert.equal(data.skipped[0].existing_id, "in");
  assert.equal(data.skipped[0].status, "bekliyor");
});

test("mutabakat eksik fiyatı sıfıra çevirmeden reddeder", async () => {
  const res = await settlement.POST(request("POST", { company_id: "company", donem: "2026-09-01" }));
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /fiyat/i);
  assert.equal(await count("firma_mutabakat"), 0);
});
test("açık 0 TL fiyat ücretsiz hizmet olarak kabul edilir", async () => {
  await addPrice("free", 0);
  const res = await settlement.POST(request("POST", { company_id: "company", donem: "2026-09-01" }));
  assert.equal(res.status, 201);
  assert.equal((await res.json()).data.tutar, 0);
});
test("yeniden hesaplama yön fiyatlarını ilk hesapla aynı şekilde seçer", async () => {
  await addPrice("generic", 100);
  await addPrice("in-price", 50, "giris", "2026-09-05");
  await addPrice("out-price", 80, "cikis", "2026-09-10");
  const created = await settlement.POST(request("POST", { company_id: "company", donem: "2026-09-01" }));
  const body = await created.json();
  assert.equal(body.data.tutar, 130);
  const res = await settlementDetail.PUT(request("PUT", { action: "yeniden-hesapla" }), params(body.data.id));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.tutar, 130);
});
test("yeniden hesaplamada eksik fiyat eski tutarı ve itirazı değiştirmez", async () => {
  await addPrice("in-only", 100, "giris");
  await addAgreement();
  const res = await settlementDetail.PUT(request("PUT", { action: "yeniden-hesapla" }), params("agreement"));
  assert.equal(res.status, 409);
  const row = (await query("SELECT tutar,durum FROM firma_mutabakat"))[0][0];
  assert.equal(Number(row.tutar), 200);
  assert.equal(row.durum, "itiraz");
});
test("TRY hesabı yabancı para fiyatını sessizce toplamaz", async () => {
  await addPrice("euro", 100, null, "2026-09-01", "EUR");
  const res = await settlement.POST(request("POST", { company_id: "company", donem: "2026-09-01" }));
  assert.equal(res.status, 409);
  assert.equal(await count("firma_mutabakat"), 0);
});
test("eski fiyatsız mutabakat onaylanamaz", async () => {
  await addAgreement(0, "bekliyor");
  const res = await settlementDetail.PUT(request("PUT", { action: "onayla" }), params("agreement"));
  assert.equal(res.status, 409);
});
test("fiyat değiştiyse eski tutarı onaylamak yerine yeniden hesaplama gerekir", async () => {
  await addAgreement(200, "bekliyor");
  await addPrice("new-price", 150);
  const res = await settlementDetail.PUT(request("PUT", { action: "onayla" }), params("agreement"));
  assert.equal(res.status, 409);
});
test("başka firma kapsamındaki kullanıcı mutabakat oluşturamaz", async () => {
  user.allowed_companies = JSON.stringify(["other"]);
  await addPrice();
  assert.equal((await settlement.POST(request("POST", { company_id: "company", donem: "2026-09-01" }))).status, 403);
});
test("başka firma kapsamındaki kullanıcı mutabakat ayrıntısını okuyamaz veya değiştiremez", async () => {
  await addAgreement();
  user.allowed_companies = JSON.stringify(["other"]);
  assert.equal((await settlementDetail.GET(request("GET"), params("agreement"))).status, 403);
  assert.equal((await settlementDetail.PUT(request("PUT", { action: "yeniden-hesapla" }), params("agreement"))).status, 403);
});
test("ters hakediş dönemi yazılmadan reddedilir", async () => {
  assert.equal((await createHakedis({ donem_baslangic: "2026-09-30", donem_bitis: "2026-09-01" })).status, 400);
  assert.equal(await count("hakedis"), 0);
});
test("hakediş oluşturma hesaplanan KDV üzerinden tevkifat saklar", async () => {
  assert.equal((await createHakedis()).status, 201);
  const row = (await query("SELECT * FROM hakedis"))[0][0];
  assert.equal(Number(row.tevkifat_tutari), 10);
  assert.equal(Number(row.net_tutar), 110);
});
test("taslak hakediş düzenlemede ters dönem reddedilir", async () => {
  const body = await (await createHakedis()).json();
  const res = await hakedisDetail.PUT(request("PUT", { donem_bitis: "2026-08-31" }), params(body.data.id));
  assert.equal(res.status, 400);
});
test("negatif veya bozuk tutar ve 100 üzerindeki oran reddedilir", async () => {
  for (const extra of [{ brut_tutar: "-1" }, { brut_tutar: "100abc" }, { kdv_orani: "101" }, { tevkifat_orani: "101" }]) {
    assert.equal((await createHakedis(extra)).status, 400, JSON.stringify(extra));
  }
  assert.equal(await count("hakedis"), 0);
});
test("seçili fiyatsız hizmetler elle girilen brütle gizlenemez", async () => {
  assert.equal((await createHakedis({ cetele_ids: ["in", "out"], brut_tutar: "999" })).status, 409);
  assert.equal(await count("hakedis"), 0);
});
test("ücretsiz seçili hizmet elle girilen brüte dönmez", async () => {
  await addPrice("free", 0);
  const res = await createHakedis({ cetele_ids: ["in", "out"], brut_tutar: "999" });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).data.brut_tutar, 0);
});
test("çetelesi olan araç silinemez ve hizmetler korunur", async () => {
  const res = await vehicle.DELETE(request("DELETE"), params("vehicle"));
  assert.equal(res.status, 409);
  assert.equal(await count("vehicles"), 1);
  assert.equal(await count("cetele"), 2);
});
test("çetelesi olan güzergah silinemez, mutabakat dayanağı korunur", async () => {
  await addPrice();
  await addAgreement();
  assert.equal((await route.DELETE(request("DELETE"), params("route"))).status, 409);
  const res = await settlementDetail.GET(request("GET"), params("agreement"));
  assert.equal((await res.json()).data.cetele.length, 2);
});
test("firma içinden kalıcı silme korumayı atlamaz ve ilişkiyi yarım silmez", async () => {
  const res = await companyVehicle.DELETE(request("DELETE", undefined, "?vehicleId=cv&hard=true"), params("company"));
  assert.equal(res.status, 409);
  assert.equal(await count("company_vehicles"), 1);
  assert.equal(await count("cetele"), 2);
});
test("Excel geri alma hizmete bağlanan aracı korur ve satır hatası bildirir", async () => {
  await query("INSERT INTO import_jobs(id,module,status) VALUES ('job','vehicles','completed')");
  await query("INSERT INTO import_job_rows(id,job_id,row_no,target_id,status) VALUES ('jr','job',1,'vehicle','executed_inserted')");
  const res = await rollbackImportJob("job", "test-admin");
  assert.equal(res.errors, 1);
  assert.equal(res.rolledBack, 0);
  assert.equal(await count("vehicles"), 1);
  assert.equal(await count("cetele"), 2);
});
test("plan içindeki araç ve güzergahın referansları koparılamaz", async () => {
  await query("DELETE FROM cetele");
  await query("INSERT INTO route_plan_routes(id,route_id,vehicle_id) VALUES ('pr','route','vehicle')");
  assert.equal((await vehicle.DELETE(request("DELETE"), params("vehicle"))).status, 409);
  assert.equal((await route.DELETE(request("DELETE"), params("route"))).status, 409);
});
test("kullanılmamış test güzergahı ve aracı silinebilir", async () => {
  await query("DELETE FROM cetele");
  assert.equal((await route.DELETE(request("DELETE"), params("route"))).status, 200);
  assert.equal((await vehicle.DELETE(request("DELETE"), params("vehicle"))).status, 200);
});

test("onaylı eski hakediş okununca veya düzenleme reddedilince değişmez", async () => {
  const body = await (await createHakedis()).json();
  await query("UPDATE hakedis SET durum='onaylandi',tevkifat_tutari=50,net_tutar=70");
  assert.equal((await hakedisDetail.PUT(request("PUT", { brut_tutar: 500 }), params(body.data.id))).status, 400);
  assert.equal(Number((await query("SELECT net_tutar FROM hakedis"))[0][0].net_tutar), 70);
});
test("eski taslağın açıklama düzenlemesi mali değerleri sessizce değiştirmez", async () => {
  const body = await (await createHakedis()).json();
  await query("UPDATE hakedis SET tevkifat_tutari=50,net_tutar=70");
  assert.equal((await hakedisDetail.PUT(request("PUT", { aciklama: "Sadece not" }), params(body.data.id))).status, 200);
  assert.equal(Number((await query("SELECT net_tutar FROM hakedis"))[0][0].net_tutar), 70);
});
test("eski hatalı hesap tekil ve toplu tahakkuka geçemez", async () => {
  const body = await (await createHakedis()).json();
  await query("UPDATE hakedis SET tevkifat_tutari=50,net_tutar=70");
  assert.equal((await hakedisDetail.PUT(request("PUT", { action: "tahakkuk" }), params(body.data.id))).status, 409);
  const res = await bulkHakedis.POST(request("POST", { ids: [body.data.id] }));
  const data = (await res.json()).data;
  assert.equal(data.updated, 0);
  assert.equal(data.skipped.length, 1);
});
test("bağlı hizmetlerin dönemi ve saklanan brüt toplamı düzenleme ile bozulamaz", async () => {
  await addPrice();
  const body = await (await createHakedis({ cetele_ids: ["in", "out"] })).json();
  for (const change of [{ donem_bitis: "2026-09-10" }, { brut_tutar: 900 }]) {
    assert.equal((await hakedisDetail.PUT(request("PUT", change), params(body.data.id))).status, 409);
  }
});
test("aynı hizmet için eşzamanlı iki hakediş yalnız bir tam kayıt üretir", async () => {
  await addPrice();
  const responses = await Promise.all([createHakedis({ cetele_ids: ["in", "out"] }), createHakedis({ cetele_ids: ["in", "out"] })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal(await count("hakedis"), 1);
  assert.equal(await count("hakedis_cetele"), 2);
});
test("audit yazımı başarısızsa hakediş ve bağlantıları tamamen geri alınır", async () => {
  await addPrice();
  await query("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic audit failure'");
  try {
    assert.equal((await createHakedis({ cetele_ids: ["in", "out"] })).status, 500);
    assert.equal(await count("hakedis"), 0);
    assert.equal(await count("hakedis_cetele"), 0);
  } finally { await query("DROP TRIGGER reject_audit"); }
});
test("aynı toplamlı fiyat değişikliği de mutabakat onayından önce görülmelidir", async () => {
  await addPrice("in-price", 50, "giris");
  await addPrice("out-price", 80, "cikis");
  const body = await (await settlement.POST(request("POST", { company_id: "company", donem: "2026-09-01" }))).json();
  await query("UPDATE route_supplier_prices SET price_amount=60 WHERE id='in-price'");
  await query("UPDATE route_supplier_prices SET price_amount=70 WHERE id='out-price'");
  assert.equal((await settlementDetail.PUT(request("PUT", { action: "onayla" }), params(body.data.id))).status, 409);
});
test("onaylı mutabakat yeniden hesaplanamaz", async () => {
  await addAgreement(200, "onaylandi");
  await addPrice("changed", 999);
  assert.equal((await settlementDetail.PUT(request("PUT", { action: "yeniden-hesapla" }), params("agreement"))).status, 400);
  assert.equal(Number((await query("SELECT tutar FROM firma_mutabakat"))[0][0].tutar), 200);
});

test("negatif araç kapasitesi string hata ve alan hatası verir", async () => {
  const res = await vehicles.POST(request("POST", { plate: "34 FORM", capacity: -1 }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(typeof body.error, "string");
  assert.ok(body.fieldErrors.capacity.length);
});
test("sıfır kapasite varsayılan 14 ile değiştirilmez", async () => {
  const res = await vehicles.POST(request("POST", { plate: "34 ZERO", capacity: 0 }));
  assert.equal(res.status, 200);
  assert.equal((await query("SELECT capacity FROM vehicles WHERE plate='34 ZERO'"))[0][0].capacity, 0);
});
test("plansız yolcu ve personel boş barkodla art arda kaydedilebilir", async () => {
  for (const type of ["yolcu", "personel"]) {
    const res = await passengers.POST(request("POST", { full_name: "Sentetik " + type, type, company_id: "", route_id: "", odeme_plani_id: "", barkod_no: "" }));
    assert.equal(res.status, 201);
  }
  const rows = (await query("SELECT odeme_plani_id,barkod_no FROM passengers"))[0];
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.odeme_plani_id === null && r.barkod_no === null));
});
test("geçersiz ödeme planı SQL ayrıntısı olmadan reddedilir; geçerli plan kaldırılabilir", async () => {
  const invalid = await passengers.POST(request("POST", { full_name: "Sentetik", odeme_plani_id: "missing" }));
  assert.equal(invalid.status, 400);
  assert.doesNotMatch(JSON.stringify(await invalid.json()), /foreign|constraint|sql|passengers/i);
  await query("INSERT INTO odeme_planlari VALUES ('plan',1)");
  const body = await (await passengers.POST(request("POST", { full_name: "Sentetik", odeme_plani_id: "plan" }))).json();
  const updated = await passenger.PUT(request("PUT", { full_name: "Sentetik", odeme_plani_id: "" }), params(body.id));
  assert.equal(updated.status, 200);
  assert.equal((await query("SELECT odeme_plani_id FROM passengers"))[0][0].odeme_plani_id, null);
});
test("araç araması ilk 100 dışındaki kaydı firma kapsamında bulur", async () => {
  const values = Array.from({ length: 1005 }, (_, i) => ["v" + i, "34 SEARCH " + String(i).padStart(4, "0")]);
  await query("INSERT INTO vehicles(id,plate) VALUES ?", [values]);
  await query("INSERT INTO company_vehicles(id,company_id,vehicle_id,plate) VALUES ('search-cv','company','v1004','34 SEARCH 1004')");
  const res = await vehicles.GET(request("GET", undefined, "?q=1004&company_id=company&limit=20"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.data.map(v => v.id), ["v1004"]);
  assert.equal(body.meta.total, 1);
  user.allowed_companies = JSON.stringify(["other"]);
  assert.equal((await vehicles.GET(request("GET", undefined, "?q=1004&company_id=company"))).status, 403);
  const hidden = await (await vehicles.GET(request("GET", undefined, "?id=v1004"))).json();
  assert.deepEqual(hidden.data, []);
});

test("değişmeyen mutabakat onaylanır ve sonradan fiyat değişse de onay dayanağı sabit kalır", async () => {
  await addPrice();
  const body = await (await settlement.POST(request("POST", { company_id: "company", donem: "2026-09-01" }))).json();
  const approved = await settlementDetail.PUT(request("PUT", { action: "onayla" }), params(body.data.id));
  assert.equal(approved.status, 200, JSON.stringify(await approved.json()));
  await query("UPDATE route_supplier_prices SET price_amount=500");
  const detail = await (await settlementDetail.GET(request("GET"), params(body.data.id))).json();
  assert.equal(Number(detail.data.tutar), 200);
  assert.deepEqual(detail.data.cetele.map(r => Number(r.birim_ucret)), [100,100]);
});
test("hareket tipi ve fiyat tarih sınırı tüm hesaplamalarda korunur", async () => {
  await query("UPDATE cetele SET tarih='2026-09-14' WHERE id='in'");
  await query("UPDATE cetele SET tarih='2026-09-15' WHERE id='out'");
  await addPrice("old", 100);
  await query("UPDATE route_supplier_prices SET valid_to='2026-09-14' WHERE id='old'");
  await addPrice("new", 150, null, "2026-09-15");
  await addPrice("other-movement", 999, null, "2026-09-15");
  await query("UPDATE route_supplier_prices SET hareket_tipi='Ek İş' WHERE id='other-movement'");
  const body = await (await settlement.POST(request("POST", { company_id: "company", donem: "2026-09-01" }))).json();
  assert.equal(body.data.tutar, 250);
  const recalculated = await (await settlementDetail.PUT(request("PUT", { action: "yeniden-hesapla" }), params(body.data.id))).json();
  assert.equal(recalculated.data.tutar, 250);
});
