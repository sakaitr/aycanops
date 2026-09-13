// Real browser + real Next/React pages, mocked HTTP responses. Not authentication/DB E2E.
// Run a local Next dev server, then AYCANOPS_UI_TEST_URL=http://127.0.0.1:33319 node --test tests/ui-regressions.cjs
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const base = process.env.AYCANOPS_UI_TEST_URL;
if (!base || new URL(base).hostname !== "127.0.0.1") throw new Error("AYCANOPS_UI_TEST_URL must be a local isolated server");
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function fixture(overrides = async () => null) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.addCookies([{ name: "opsdesk_session", value: "synthetic-ui", url: base }]);
  await context.addInitScript(() => localStorage.setItem("aycan_global_company", "company"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const override = await overrides(url, route.request());
    if (override === "abort") return route.abort();
    let body = { ok: true, data: [], meta: { total: 0, page: 1, pages: 0 }, unreadCount: 0 };
    if (url.pathname === "/api/auth/me") body = { ok: true, data: { id: "ui", role: "admin", full_name: "Sentetik Test", allowed_companies: null } };
    if (url.pathname === "/api/companies") body = { ok: true, data: [{ id: "company", name: "Test Firma" }] };
    if (url.pathname === "/api/admin/nav-config") body = { ok: false };
    return route.fulfill({ status: override?.status ?? 200, contentType: "application/json", body: JSON.stringify(override?.body ?? body) });
  });
  return { page, errors, close: () => context.close() };
}

test("rapor tarihi İstanbul 23.59 00.00 00.15 ve 03.00 sınırlarında tutarlıdır", { timeout: 60000 }, async () => {
  const f = await fixture();
  try {
    for (const [instant, expected] of [
      ["2026-09-14T20:59:00Z", "2026-09-14"], ["2026-09-14T21:00:00Z", "2026-09-15"],
      ["2026-09-14T21:15:00Z", "2026-09-15"], ["2026-09-15T00:00:00Z", "2026-09-15"],
    ]) {
      await f.page.clock.setFixedTime(new Date(instant));
      await f.page.goto(base + "/raporlar");
      await f.page.getByRole("button", { name: /Günlük Giriş Raporu/ }).click();
      const dates = f.page.locator('main input[type="date"]');
      await dates.last().waitFor();
      assert.equal(await dates.last().inputValue(), expected);
      assert.equal(await dates.last().getAttribute("max"), expected);
    }
  } finally { await f.close(); }
});

test("390 px araç firma filtresi uzun isimle taşmaz", { timeout: 60000 }, async () => {
  const f = await fixture(async url => url.pathname === "/api/companies" ? {
    body: { ok: true, data: [{ id: "company", name: "Sentetik Çok Uzun Firma Unvanı Endüstriyel Üretim ve Personel Taşımacılığı Test Şirketi" }] },
  } : null);
  try {
    await f.page.setViewportSize({ width: 390, height: 844 });
    await f.page.goto(base + "/araclar");
    const select = f.page.locator("main select").filter({ has: f.page.locator("option[value='company']") }).first();
    await select.waitFor();
    const box = await select.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
  } finally { await f.close(); }
});

test("SLA paneli boş veride yüzde yerine veri yok gösterir", { timeout: 60000 }, async () => {
  const f = await fixture(async url => url.pathname === "/api/stats/kpi" ? { body: { ok: true, data: {
    sla: { total: 0, on_time: 0, percent: null, data_status: "no_data" },
    fleet: { total: 0, active: 0, percent: 0 }, inspection: { total: 0, pass: 0, percent: 0 },
  } } } : null);
  try {
    await f.page.goto(base + "/raporlar");
    const card = f.page.getByText("SLA Uyum Oranı", { exact: true }).locator("..");
    await card.waitFor();
    assert.match(await card.innerText(), /Veri yok/);
    assert.doesNotMatch(await card.innerText(), /\d+%/);
  } finally { await f.close(); }
});

test("çetele takvim iptal hatasını başarı saymaz ve araç değiştirmeyi açmaz", { timeout: 60000 }, async () => {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
  const f = await fixture(async (url) => {
    if (url.pathname === "/api/routes") return { body: { ok: true, data: [{ id: "route", name: "Test Hat", company_id: "company", vehicle_id: "vehicle", plate: "34 TEST 1", time_slots: [] }] } };
    if (url.pathname === "/api/cetele") return { body: { ok: true, data: [{ id: "in", route_id: "route", vehicle_id: "vehicle", tarih: today, hareket_tipi: "Genel", yon: "giris", durum: "onaylandi", plate: "34 TEST 1" }] } };
    if (url.pathname === "/api/cetele/in") return { status: 409, body: { ok: false, error: "Hakedişe bağlı hizmet iptal edilemez" } };
    return null;
  });
  try {
    await f.page.addInitScript(() => { window.testToasts = []; window.addEventListener("__toast__", e => window.testToasts.push(e.detail)); });
    f.page.on("dialog", d => d.accept("Test gerekçesi"));
    await f.page.goto(base + "/cetele");
    await f.page.getByRole("button", { name: "Takvim", exact: true }).click();
    await f.page.getByTitle("Aksiyonlar", { exact: true }).last().click();
    await f.page.getByRole("button", { name: "İptal Et", exact: true }).click();
    await f.page.waitForFunction(() => window.testToasts.length > 0);
    assert.equal((await f.page.evaluate(() => window.testToasts)).at(-1).type, "error");
    await f.page.getByTitle("Aksiyonlar", { exact: true }).last().click();
    await f.page.getByRole("button", { name: "Tek seferlik araç değiştir", exact: true }).click();
    await f.page.waitForFunction(() => window.testToasts.length > 1);
    assert.equal(await f.page.getByRole("heading", { name: "Bugün için araç değiştir" }).count(), 0);
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

test("plan ekranı arşiv gerekçesini gönderir ve arşiv durumunu gösterir", { timeout: 60000 }, async () => {
  let archived = false;
  const f = await fixture(async (url, req) => {
    if (url.pathname === "/api/route-plans") return { body: { ok: true, data: [{ id: "plan", name: "Test Plan", status: archived ? "archived" : "active", direction: "morning", version_no: 1 }] } };
    if (url.pathname === "/api/route-plans/plan/publish") {
      const body = req.postDataJSON();
      assert.equal(body.archive, true);
      assert.equal(body.reason, "Test temizliği");
      archived = true;
      return { body: { ok: true } };
    }
    return null;
  });
  try {
    f.page.on("dialog", dialog => dialog.accept("Test temizliği"));
    await f.page.goto(base + "/rota-planlama");
    await f.page.getByRole("button", { name: "Arşivle", exact: true }).click({ timeout: 10000 });
    await f.page.getByText("Arşiv", { exact: true }).waitFor({ timeout: 10000 });
    assert.equal(archived, true);
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

test("yeni plan seçilen firma vardiyasıyla oluşturulur", { timeout: 60000 }, async () => {
  let created;
  const f = await fixture(async (url, req) => {
    if (url.pathname === "/api/company-shifts") return { body: { ok: true, data: [{ id: 1, shift_name: "Sabah", expected_time: "08:00:00" }] } };
    if (url.pathname === "/api/route-plans" && req.method() === "POST") {
      created = req.postDataJSON(); return { body: { ok: true } };
    }
    return null;
  });
  try {
    await f.page.goto(base + "/rota-planlama");
    await f.page.getByRole("combobox", { name: "Plan firması" }).selectOption("company", { timeout: 10000 });
    await f.page.getByRole("combobox", { name: "Plan vardiyası" }).selectOption("1");
    await f.page.getByPlaceholder(/NARPLAS/).fill("Test Plan");
    const response = f.page.waitForResponse(r => new URL(r.url()).pathname === "/api/route-plans" && r.request().method() === "POST");
    await f.page.getByRole("button", { name: "Plan oluştur", exact: true }).click();
    await response;
    assert.equal(created.company_id, "company");
    assert.equal(created.shift_id, "1");
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

test("araç formu negatif kapasitede ve alan-hatası yanıtında açık kalır", { timeout: 60000 }, async () => {
  const f = await fixture(async (url, req) => url.pathname === "/api/vehicles" && req.method() === "POST"
    ? { status: 400, body: { ok: false, error: { capacity: ["Sentetik alan hatası"] } } } : null);
  try {
    await f.page.goto(base + "/araclar");
    await f.page.getByRole("button", { name: /Araç Ekle/ }).click();
    await f.page.getByPlaceholder(/34/).fill("34 TEST 99");
    const capacity = f.page.getByText("Kapasite", { exact: true }).locator("..").locator("input");
    await capacity.fill("-1");
    await f.page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await f.page.getByText("Kapasite 0 veya daha büyük bir tam sayı olmalıdır").waitFor();
    await capacity.fill("2");
    await f.page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await f.page.getByText("capacity: Sentetik alan hatası").waitFor();
    assert.equal(await capacity.inputValue(), "2");
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

test("yolcu formu 500 ve ağ hatasında adı ve pencereyi korur", { timeout: 60000 }, async () => {
  let attempts = 0;
  const f = await fixture(async (url, req) => {
    if (url.pathname === "/api/yolcular" && req.method() === "POST") {
      attempts++;
      return attempts === 1 ? { status: 500, body: { ok: false, error: "Sentetik sunucu hatası" } } : "abort";
    }
    return null;
  });
  try {
    await f.page.goto(base + "/yolcular");
    await f.page.getByRole("button", { name: /Yeni Kayıt/ }).click();
    const name = f.page.getByPlaceholder("Adı Soyadı");
    await name.fill("Sentetik Yolcu");
    await f.page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await f.page.getByRole("alert").filter({ hasText: "Sentetik sunucu hatası" }).waitFor();
    assert.equal(await name.inputValue(), "Sentetik Yolcu");
    await f.page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await f.page.getByRole("alert").filter({ hasText: "Bağlantı hatası" }).waitFor();
    assert.equal(await name.inputValue(), "Sentetik Yolcu");
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

test("güzergah seçicisi sunucuda arar, sayfalar ve ağ hatasını boş sonuçtan ayırır", { timeout: 60000 }, async () => {
  const searches = [];
  const f = await fixture(async url => {
    if (url.pathname !== "/api/vehicles") return null;
    searches.push(url.searchParams.toString());
    if (url.searchParams.get("q") === "hata") return { status: 500, body: { ok: false } };
    const matches = url.searchParams.get("q") === "1004" || url.searchParams.get("id") === "v1004" || url.searchParams.get("page") === "2";
    return { body: { ok: true, data: matches ? [{ id: "v1004", plate: "34 TEST 1004", driver_name: "Test Sürücü" }] : [],
      meta: { total: 31, page: Number(url.searchParams.get("page") || 1), pages: 2 } } };
  });
  try {
    await f.page.goto(base + "/guzergahlar");
    await f.page.getByRole("button", { name: /Güzergah Ekle/ }).click();
    await f.page.getByRole("button", { name: "— Araç seç —" }).click();
    await f.page.getByRole("button", { name: "Daha fazla yükle" }).click();
    await f.page.getByRole("button", { name: /34 TEST 1004/ }).waitFor();
    const input = f.page.getByPlaceholder("Plaka veya şoför ara...");
    await input.fill("1004");
    await f.page.getByRole("button", { name: /34 TEST 1004/ }).click();
    await f.page.getByRole("button", { name: /34 TEST 1004/ }).click();
    await input.fill("hata");
    await f.page.getByRole("alert").filter({ hasText: "Araçlar yüklenemedi" }).waitFor();
    assert.ok(searches.some(s => s.includes("q=1004") && s.includes("company_id=company")));
    assert.ok(searches.some(s => s.includes("id=v1004")));
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
