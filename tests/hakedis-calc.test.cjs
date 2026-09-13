const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createLoader } = require("./helpers/load-ts.cjs");
const { computeHakedisTutarlari } = createLoader()("lib/hakedis-calc.ts");

test("KDV tevkifatı hizmet bedelinden değil hesaplanan KDV'den kesilir", () => {
  assert.deepEqual(computeHakedisTutarlari(100, 20, 50), {
    kdvTutari: 20, tevkifatTutari: 10, netTutar: 110,
  });
});
test("tevkifatsız hesap brüt ve KDV toplamını korur", () => {
  assert.deepEqual(computeHakedisTutarlari(100, 20, 0), {
    kdvTutari: 20, tevkifatTutari: 0, netTutar: 120,
  });
});
test("KDV sıfırsa tevkifat da sıfırdır", () => {
  assert.deepEqual(computeHakedisTutarlari(100, 0, 50), {
    kdvTutari: 0, tevkifatTutari: 0, netTutar: 100,
  });
});
test("hesaplanan vergi ve kesinti kuruşa yuvarlanır", () => {
  assert.deepEqual(computeHakedisTutarlari(1234.56, 20, 50), {
    kdvTutari: 246.91, tevkifatTutari: 123.46, netTutar: 1358.01,
  });
});
test("yarım kuruş ikili kayan nokta nedeniyle aşağı yuvarlanmaz", () => {
  assert.deepEqual(computeHakedisTutarlari(0.29, 100, 50), { kdvTutari: 0.29, tevkifatTutari: 0.15, netTutar: 0.43 });
});
