const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createLoader } = require("./helpers/load-ts.cjs");
const load = createLoader();
const { routePriceCreateSchema } = load("lib/schemas.ts");
const { validatePeriod, financialNumber } = load("lib/financial-validation.ts");

test("açık sıfır fiyat kabul edilir; boş, bozuk ve negatif fiyat edilmez", () => {
  const base = { company_id: "c", route_id: "r", vehicle_id: "v", valid_from: "2026-09-01" };
  assert.equal(routePriceCreateSchema.safeParse({ ...base, price_amount: 0 }).success, true);
  for (const price_amount of ["", null, -1, "10abc"]) assert.equal(routePriceCreateSchema.safeParse({ ...base, price_amount }).success, false);
});
test("takvim doğrulaması taşan günleri ve ters dönemi reddeder", () => {
  for (const from of ["2026-02-30", "2026-13-01", "2026-9-01", "", null]) assert.throws(() => validatePeriod(from, "2026-09-30"));
  assert.throws(() => validatePeriod("2026-09-30", "2026-09-01"));
  assert.deepEqual(validatePeriod("2026-09-01", "2026-09-30"), { from: "2026-09-01", to: "2026-09-30" });
});
test("mali sayılar kısmi parse ve sınırsız hassasiyet kabul etmez", () => {
  for (const value of ["1abc", "1.001", true, Infinity, null, -1, ""]) assert.throws(() => financialNumber(value, "Tutar"));
  assert.equal(financialNumber("0.00", "Tutar"), 0);
});
