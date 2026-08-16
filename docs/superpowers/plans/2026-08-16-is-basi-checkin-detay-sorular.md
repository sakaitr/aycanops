# İş Başı Check-in Detay Soruları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add koşullu takip (detay) soru desteği + bölüm başlığı gruplama to the existing `gunluk_soru` check-in system, and seed the final 8-question set merged from the boss's two form drafts.

**Architecture:** 5 new nullable columns on `gunluk_soru` (bölüm başlığı + detay soru/tip/seçenek/tetikleyici) and 1 new nullable column on `gunluk_cevap` (detay_cevap). No new tables, no breaking changes to existing rows. Admin CRUD API, public read API, and the two check-in UI pages (admin editor + `/gunluk/[date]` check-in gate) are extended to read/write the new fields. Detay visibility is computed both server-side (validation) and client-side (rendering) with the same trigger-match rule.

**Tech Stack:** Next.js App Router (route handlers under `app/api`), MySQL via `lib/db.ts`'s `getDb().prepare()` wrapper, Zod schemas in `lib/schemas.ts`, React client components (`"use client"`) styled with Tailwind (zinc/blue dark theme).

## Global Constraints

- All user-facing text is Turkish, matching existing copy style in the touched files.
- No unit test framework exists in this repo (no jest/vitest/`*.test.ts`). Verification is `tsc --noEmit` + live HTTP calls through a real logged-in session + direct DB queries (matches the established pattern in `.superpowers/sdd/progress.md` for this project's prior Faz1/Faz2 work).
- DB access for local verification: SSH tunnel `127.0.0.1:3307` → remote MySQL, credentials in `.superpowers/sdd` history (`aycanops`/`Kayra2190.`, db `aycanops_db`). **The SSH tunnel was down and reconnecting failed with "Permission denied" as of this plan's writing — resolve this (ask the user for a working SSH password, or an alternative DB access path) before running any live-verification step.**
- A working test login (previously `admin1`/`admin1`, admin role) is needed for live HTTP verification of the API routes — confirm it still works before Task 3; if not, ask the user for a working credential rather than forging a session (this is an explicit, previously-documented ban in this project).
- Migrations are idempotent: use `INSERT ... SELECT ... WHERE NOT EXISTS (...)` (see `migrations/082_finans_fatura_fis_detay.sql` for the exact pattern this repo uses) so re-running never duplicates rows.
- All SQL is parameterized via `db.prepare(...).run(...)` placeholders — never interpolate request data into SQL strings.
- PATCH/PUT routes follow the existing `if (d.field !== undefined) { fields.push(...); values.push(...) }` pattern already used in `app/api/admin/gunluk-sorulari/[id]/route.ts`.

---

### Task 1: Migration 104 — schema + final soru seti seed

**Files:**
- Create: `migrations/104_gunluk_soru_detay.sql`

**Interfaces:**
- Produces: `gunluk_soru.bolum_baslik` (VARCHAR NULL), `gunluk_soru.detay_label` (VARCHAR NULL), `gunluk_soru.detay_tip` (ENUM('metin','uzun_metin','secim') NULL), `gunluk_soru.detay_secenekler` (TEXT NULL, JSON array string), `gunluk_soru.detay_tetikleyici` (VARCHAR NULL — `"true"`/`"false"` for evet_hayir triggers, or the exact option string for secim/checklist triggers), `gunluk_cevap.detay_cevap` (TEXT NULL, JSON-stringified string or string[]). All later tasks read/write these columns.

- [ ] **Step 1: Write the migration file**

```sql
-- Migration: 104_gunluk_soru_detay
-- Tarih: 2026-08-16
-- Açıklama: İş başı check-in sorularına bölüm başlığı ve koşullu takip
-- (detay) sorusu desteği eklenir; patronun iki taslak formundan
-- tekilleştirilen final 8 soru seed edilir.

ALTER TABLE gunluk_soru
  ADD COLUMN bolum_baslik VARCHAR(200) NULL AFTER label,
  ADD COLUMN detay_label VARCHAR(500) NULL AFTER zorunlu,
  ADD COLUMN detay_tip ENUM('metin','uzun_metin','secim') NULL AFTER detay_label,
  ADD COLUMN detay_secenekler TEXT NULL AFTER detay_tip,
  ADD COLUMN detay_tetikleyici VARCHAR(200) NULL AFTER detay_secenekler;

ALTER TABLE gunluk_cevap ADD COLUMN detay_cevap TEXT NULL;

INSERT INTO gunluk_soru
  (id, label, tip, secenekler, zorunlu, sort_order, is_active,
   bolum_baslik, detay_label, detay_tip, detay_secenekler, detay_tetikleyici,
   created_at, updated_at)
SELECT
  UUID(), t.label, t.tip, t.secenekler, t.zorunlu,
  (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM gunluk_soru) + t.rel_order,
  1, t.bolum_baslik, t.detay_label, t.detay_tip, t.detay_secenekler, t.detay_tetikleyici,
  '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z'
FROM (
  SELECT
    'Dün işini eksiksiz tamamladın mı?' AS label, 'evet_hayir' AS tip, NULL AS secenekler,
    1 AS zorunlu, 0 AS rel_order, 'Dünün Değerlendirmesi' AS bolum_baslik,
    'Ne eksik kaldı?' AS detay_label, 'metin' AS detay_tip, NULL AS detay_secenekler, 'false' AS detay_tetikleyici
  UNION ALL
  SELECT
    'Açık/eksik güzergah var mı?', 'evet_hayir', NULL,
    1, 1, 'Dünün Değerlendirmesi',
    'Hangi güzergah, ne eksik?', 'metin', NULL, 'true'
  UNION ALL
  SELECT
    'Dünden bugüne devreden acil/önemli bir konu var mı?', 'evet_hayir', NULL,
    1, 2, 'Dünün Değerlendirmesi',
    'Konu nedir, kimden destek gerekiyor?', 'metin', NULL, 'true'
  UNION ALL
  SELECT
    'Bugün yapılacak öncelikli 1-2 iş nedir?', 'metin', NULL,
    1, 3, 'Bugüne Dair',
    NULL, NULL, NULL, NULL
  UNION ALL
  SELECT
    'Bugün acil çözülmesi gereken bir konu var mı?', 'evet_hayir', NULL,
    1, 4, 'Bugüne Dair',
    'Konu nedir?', 'metin', NULL, 'true'
  UNION ALL
  SELECT
    'Destek/yönlendirme ihtiyacım var', 'evet_hayir', NULL,
    1, 5, 'Bugüne Dair',
    'Kimden?', 'secim', '["Operasyon","Muhasebe","Pazarlama","İnsan Kaynakları","Yönetim","Diğer"]', 'true'
  UNION ALL
  SELECT
    'Genel gün durumu (dün+bugün)', 'secim',
    '["🟢 Planlandığı gibi","🟡 Takip gerekiyor","🔴 Yönetici müdahalesi gerekiyor"]',
    1, 6, 'Bugüne Dair',
    NULL, NULL, NULL, NULL
  UNION ALL
  SELECT
    'Eklemek istediğiniz başka bir not var mı?', 'uzun_metin', NULL,
    0, 7, 'Bugüne Dair',
    NULL, NULL, NULL, NULL
) t
WHERE NOT EXISTS (SELECT 1 FROM gunluk_soru gs WHERE gs.label = t.label);
```

- [ ] **Step 2: Verify the file is syntactically applied on next app start**

The app runs pending migrations automatically on startup via `lib/migrate.ts`'s `runMigrations()`. Start (or restart) the dev server so it picks up `104_gunluk_soru_detay.sql`, then check the server log for either `Migration 104_gunluk_soru_detay.sql applied successfully` or an error. If it errors, fix the SQL and restart — `runMigrations` records success in the `migrations` table only after a clean run, so a fixed file re-applies safely on the next restart.

- [ ] **Step 3: Verify live via DB query**

Reconnect the SSH tunnel first if needed (see Global Constraints), then run:

```bash
node -e "
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'aycanops', password: 'Kayra2190.', database: 'aycanops_db' });
  const [cols] = await conn.query(\"SHOW COLUMNS FROM gunluk_soru\");
  console.log('gunluk_soru columns:', cols.map(c => c.Field).join(', '));
  const [cols2] = await conn.query(\"SHOW COLUMNS FROM gunluk_cevap\");
  console.log('gunluk_cevap columns:', cols2.map(c => c.Field).join(', '));
  const [rows] = await conn.query('SELECT label, bolum_baslik, detay_label, detay_tetikleyici, sort_order FROM gunluk_soru ORDER BY sort_order');
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
})();
"
```

Expected: `gunluk_soru` columns list includes `bolum_baslik, detay_label, detay_tip, detay_secenekler, detay_tetikleyici`; `gunluk_cevap` columns list includes `detay_cevap`; exactly 8 rows returned, `sort_order` 0-7 (or offset if pre-existing rows existed), labels matching the 8 questions above.

- [ ] **Step 4: Commit**

```bash
git add migrations/104_gunluk_soru_detay.sql
git commit -m "feat: add gunluk_soru detay/bölüm alanları + final check-in soru seti"
```

---

### Task 2: Zod şema güncellemeleri

**Files:**
- Modify: `lib/schemas.ts:717-723` (`gunlukSoruSchema` / `gunlukSoruUpdateSchema`)
- Modify: `lib/schemas.ts:226-231` (`gunlukCevapSubmitSchema`)

**Interfaces:**
- Consumes: none (pure schema definitions).
- Produces: `gunlukSoruSchema` now validates `bolum_baslik?: string|null`, `detay_label?: string|null`, `detay_tip?: "metin"|"uzun_metin"|"secim"|null`, `detay_secenekler?: string[]|null`, `detay_tetikleyici?: string|null` in addition to the existing fields. `gunlukCevapSubmitSchema`'s `cevaplar[]` items now also accept `detay?: string|string[]|null`. Task 3, 4, 5 import and rely on these exact field names.

- [ ] **Step 1: Update `gunlukSoruSchema`**

Find this block (currently at `lib/schemas.ts:717-723`):

```ts
export const gunlukSoruSchema = z.object({
  label: shortStr(500),
  tip: z.enum(["evet_hayir", "metin", "uzun_metin", "checklist", "secim"]),
  secenekler: z.array(z.string().max(200)).optional().nullable(),
  zorunlu: z.boolean().optional(),
});
export const gunlukSoruUpdateSchema = gunlukSoruSchema.partial();
```

Replace with:

```ts
export const gunlukSoruSchema = z.object({
  label: shortStr(500),
  tip: z.enum(["evet_hayir", "metin", "uzun_metin", "checklist", "secim"]),
  secenekler: z.array(z.string().max(200)).optional().nullable(),
  zorunlu: z.boolean().optional(),
  bolum_baslik: z.string().max(200).optional().nullable(),
  detay_label: shortStr(500).optional().nullable(),
  detay_tip: z.enum(["metin", "uzun_metin", "secim"]).optional().nullable(),
  detay_secenekler: z.array(z.string().max(200)).optional().nullable(),
  detay_tetikleyici: z.string().max(200).optional().nullable(),
});
export const gunlukSoruUpdateSchema = gunlukSoruSchema.partial();
```

- [ ] **Step 2: Update `gunlukCevapSubmitSchema`**

Find this block (currently at `lib/schemas.ts:226-231`):

```ts
export const gunlukCevapSubmitSchema = z.object({
  cevaplar: z.array(z.object({
    soru_id: z.string().min(1),
    value: z.union([z.boolean(), z.string(), z.array(z.string())]).nullable(),
  })),
});
```

Replace with:

```ts
export const gunlukCevapSubmitSchema = z.object({
  cevaplar: z.array(z.object({
    soru_id: z.string().min(1),
    value: z.union([z.boolean(), z.string(), z.array(z.string())]).nullable(),
    detay: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  })),
});
```

- [ ] **Step 3: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no new errors (existing baseline should stay 0 given prior session's clean run).

- [ ] **Step 4: Commit**

```bash
git add lib/schemas.ts
git commit -m "feat: extend gunluk_soru/gunluk_cevap şemalarına detay alanları ekle"
```

---

### Task 3: Admin CRUD API — detay alanları

**Files:**
- Modify: `app/api/admin/gunluk-sorulari/route.ts` (POST handler)
- Modify: `app/api/admin/gunluk-sorulari/[id]/route.ts` (PUT handler)

**Interfaces:**
- Consumes: `gunlukSoruSchema`, `gunlukSoruUpdateSchema` from Task 2.
- Produces: no new exports — behavior change only (POST/PUT now persist the 5 new columns and validate detay consistency). Task 6 (admin UI) sends these fields in its request bodies.

- [ ] **Step 1: Update POST in `app/api/admin/gunluk-sorulari/route.ts`**

Replace the whole file with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { gunlukSoruSchema } from "@/lib/schemas";

function parseRow(row: any) {
  return {
    ...row,
    secenekler: row.secenekler ? JSON.parse(row.secenekler) : null,
    detay_secenekler: row.detay_secenekler ? JSON.parse(row.detay_secenekler) : null,
    zorunlu: !!row.zorunlu,
    is_active: !!row.is_active,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "gunluk_soru:read"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const db = getDb();
    const rows = await db.prepare(
      `SELECT * FROM gunluk_soru WHERE is_active = 1 ORDER BY sort_order ASC, created_at ASC`
    ).all() as any[];

    return NextResponse.json({ ok: true, data: rows.map(parseRow) });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "gunluk_soru:create"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const raw = await req.json();
    const parsed = gunlukSoruSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    if ((d.tip === "checklist" || d.tip === "secim") && (!d.secenekler || d.secenekler.length === 0)) {
      return NextResponse.json({ ok: false, error: "Checklist/seçim tipi için en az bir seçenek gerekli" }, { status: 400 });
    }
    if (d.detay_tip === "secim" && (!d.detay_secenekler || d.detay_secenekler.length === 0)) {
      return NextResponse.json({ ok: false, error: "Takip sorusu seçim tipi için en az bir seçenek gerekli" }, { status: 400 });
    }
    if (d.detay_label && !d.detay_tetikleyici) {
      return NextResponse.json({ ok: false, error: "Takip sorusu için tetikleyici cevap seçilmeli" }, { status: 400 });
    }

    const db = getDb();
    const id = uuidv4();
    const now = nowIso();
    const maxRow = await db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM gunluk_soru").get() as any;

    await db.prepare(
      `INSERT INTO gunluk_soru
       (id, label, tip, secenekler, zorunlu, sort_order, is_active, bolum_baslik, detay_label, detay_tip, detay_secenekler, detay_tetikleyici, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, d.label, d.tip, d.secenekler ? JSON.stringify(d.secenekler) : null, d.zorunlu === false ? 0 : 1, maxRow?.next_order ?? 0,
      d.bolum_baslik || null, d.detay_label || null, d.detay_tip || null,
      d.detay_secenekler ? JSON.stringify(d.detay_secenekler) : null, d.detay_tetikleyici || null,
      now, now
    );

    return NextResponse.json({ ok: true, data: { id } }, { status: 201 });
  } catch (e) { return apiError(e); }
}
```

(This preserves the existing `GET` handler as-is — only `parseRow` gained the `detay_secenekler` parse line and `POST` gained the two new validation checks + the 5 new columns in the INSERT.)

- [ ] **Step 2: Update PUT in `app/api/admin/gunluk-sorulari/[id]/route.ts`**

Replace the whole file with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { gunlukSoruUpdateSchema } from "@/lib/schemas";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "gunluk_soru:update"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const raw = await req.json();
    const parsed = gunlukSoruUpdateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const d = parsed.data;

    if (d.detay_tip === "secim" && (!d.detay_secenekler || d.detay_secenekler.length === 0)) {
      return NextResponse.json({ ok: false, error: "Takip sorusu seçim tipi için en az bir seçenek gerekli" }, { status: 400 });
    }
    if (d.detay_label && d.detay_tetikleyici === undefined) {
      return NextResponse.json({ ok: false, error: "Takip sorusu için tetikleyici cevap seçilmeli" }, { status: 400 });
    }

    const db = getDb();
    const existing = await db.prepare("SELECT id FROM gunluk_soru WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ ok: false, error: "Soru bulunamadı" }, { status: 404 });

    const fields: string[] = ["updated_at = ?"];
    const values: unknown[] = [nowIso()];
    if (d.label !== undefined) { fields.push("label = ?"); values.push(d.label); }
    if (d.tip !== undefined) { fields.push("tip = ?"); values.push(d.tip); }
    if (d.secenekler !== undefined) { fields.push("secenekler = ?"); values.push(d.secenekler ? JSON.stringify(d.secenekler) : null); }
    if (d.zorunlu !== undefined) { fields.push("zorunlu = ?"); values.push(d.zorunlu ? 1 : 0); }
    if (d.bolum_baslik !== undefined) { fields.push("bolum_baslik = ?"); values.push(d.bolum_baslik || null); }
    if (d.detay_label !== undefined) { fields.push("detay_label = ?"); values.push(d.detay_label || null); }
    if (d.detay_tip !== undefined) { fields.push("detay_tip = ?"); values.push(d.detay_tip || null); }
    if (d.detay_secenekler !== undefined) { fields.push("detay_secenekler = ?"); values.push(d.detay_secenekler ? JSON.stringify(d.detay_secenekler) : null); }
    if (d.detay_tetikleyici !== undefined) { fields.push("detay_tetikleyici = ?"); values.push(d.detay_tetikleyici || null); }
    values.push(id);

    await db.prepare(`UPDATE gunluk_soru SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
    if (!hasPermission(user, "gunluk_soru:delete"))
      return NextResponse.json({ ok: false, error: "Yetersiz yetki" }, { status: 403 });

    const { id } = await params;
    const db = getDb();
    await db.prepare("UPDATE gunluk_soru SET is_active = 0, updated_at = ? WHERE id = ?").run(nowIso(), id);
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
```

(`DELETE` is unchanged — reproduced verbatim so the file replacement is complete.)

- [ ] **Step 3: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Live verify (requires working SSH tunnel + test login — see Global Constraints)**

```bash
curl -s -c /tmp/aycan-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" -d '{"username":"admin1","password":"admin1"}' | head -c 300
echo
curl -s -b /tmp/aycan-cookies.txt -X POST http://localhost:3000/api/admin/gunluk-sorulari \
  -H "Content-Type: application/json" \
  -d '{"label":"Test detay sorusu","tip":"evet_hayir","zorunlu":true,"detay_label":"Detayı yaz","detay_tip":"metin","detay_tetikleyici":"true"}'
```

Expected: login returns `{"ok":true,...}`; POST returns `{"ok":true,"data":{"id":"..."}}` with HTTP 201. Then confirm via DB query (`SELECT label, detay_label, detay_tetikleyici FROM gunluk_soru WHERE label = 'Test detay sorusu'`) that the row has the detay fields set, and clean it up: `DELETE FROM gunluk_soru WHERE label = 'Test detay sorusu';` (test data, not part of the seeded 8).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/gunluk-sorulari/route.ts app/api/admin/gunluk-sorulari/[id]/route.ts
git commit -m "feat: admin gunluk-sorulari API'sine detay alanları ekle"
```

---

### Task 4: Public read API'ler — detay alanlarını dön

**Files:**
- Modify: `app/api/gunluk-sorulari/route.ts:9-24` (GET)
- Modify: `app/api/worklogs/[date]/route.ts:52-57` (GET, `cevapRows`/`cevaplar` block)

**Interfaces:**
- Consumes: existing `gunluk_soru`/`gunluk_cevap` columns from Task 1.
- Produces: `GET /api/gunluk-sorulari` response items now include `bolum_baslik`, `detay_label`, `detay_tip`, `detay_secenekler` (parsed array or null), `detay_tetikleyici`. `GET /api/worklogs/[date]` response `cevaplar[]` items now include `detay` (parsed value or null). Task 7 (check-in UI) reads both.

- [ ] **Step 1: Update `app/api/gunluk-sorulari/route.ts`**

Replace the whole file with:

```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

// GET /api/gunluk-sorulari — aktif soru listesi, herkes okuyabilir (işe
// başlama check-in'inde cevaplamak için). Düzenleme yetkisi ayrı
// (gunluk_soru:*), bkz. /api/admin/gunluk-sorulari.
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const db = getDb();
    const rows = await db.prepare(
      `SELECT id, label, tip, secenekler, zorunlu, bolum_baslik, detay_label, detay_tip, detay_secenekler, detay_tetikleyici
       FROM gunluk_soru WHERE is_active = 1 ORDER BY sort_order ASC, created_at ASC`
    ).all() as any[];

    return NextResponse.json({
      ok: true,
      data: rows.map(r => ({
        ...r,
        secenekler: r.secenekler ? JSON.parse(r.secenekler) : null,
        zorunlu: !!r.zorunlu,
        detay_secenekler: r.detay_secenekler ? JSON.parse(r.detay_secenekler) : null,
      })),
    });
  } catch (e) { return apiError(e); }
}
```

- [ ] **Step 2: Update the `cevapRows`/`cevaplar` block in `app/api/worklogs/[date]/route.ts`**

Find (currently at `app/api/worklogs/[date]/route.ts:52-57`):

```ts
    const cevapRows = await db.prepare(
      `SELECT c.soru_id, c.cevap_json, s.label, s.tip
       FROM gunluk_cevap c JOIN gunluk_soru s ON s.id = c.soru_id
       WHERE c.worklog_id = ?`
    ).all(worklog.id) as { soru_id: string; cevap_json: string; label: string; tip: string }[];
    const cevaplar = cevapRows.map(c => ({ soru_id: c.soru_id, label: c.label, tip: c.tip, value: JSON.parse(c.cevap_json) }));
```

Replace with:

```ts
    const cevapRows = await db.prepare(
      `SELECT c.soru_id, c.cevap_json, c.detay_cevap, s.label, s.tip
       FROM gunluk_cevap c JOIN gunluk_soru s ON s.id = c.soru_id
       WHERE c.worklog_id = ?`
    ).all(worklog.id) as { soru_id: string; cevap_json: string; detay_cevap: string | null; label: string; tip: string }[];
    const cevaplar = cevapRows.map(c => ({
      soru_id: c.soru_id, label: c.label, tip: c.tip,
      value: JSON.parse(c.cevap_json),
      detay: c.detay_cevap ? JSON.parse(c.detay_cevap) : null,
    }));
```

- [ ] **Step 3: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Live verify**

```bash
curl -s -b /tmp/aycan-cookies.txt http://localhost:3000/api/gunluk-sorulari | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  const j = JSON.parse(d);
  console.log(j.data.length, 'sorular');
  console.log(j.data.map(s => ({label: s.label, bolum: s.bolum_baslik, detay: s.detay_label})));
});
"
```

Expected: 8 sorular, each with `bolum` set to "Dünün Değerlendirmesi" or "Bugüne Dair", 5 of them with a non-null `detay`.

- [ ] **Step 5: Commit**

```bash
git add app/api/gunluk-sorulari/route.ts "app/api/worklogs/[date]/route.ts"
git commit -m "feat: check-in okuma API'lerine detay/bölüm alanlarını ekle"
```

---

### Task 5: Check-in kaydetme API — zorunlu detay kontrolü + kayıt

**Files:**
- Modify: `app/api/worklogs/[date]/cevaplar/route.ts` (entire file)

**Interfaces:**
- Consumes: `gunlukCevapSubmitSchema` from Task 2, `gunluk_soru.detay_label`/`detay_tetikleyici` and `gunluk_cevap.detay_cevap` from Task 1.
- Produces: `POST /api/worklogs/[date]/cevaplar` now accepts `cevaplar[].detay` in the request body, 400s with `"Detay cevap gerekli"` when a triggered detay is missing, and persists `detay_cevap`. Task 7 (check-in UI) sends this shape.

- [ ] **Step 1: Replace the whole file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowIso } from "@/lib/time";
import { apiError } from "@/lib/api-error";
import { gunlukCevapSubmitSchema } from "@/lib/schemas";

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function detayTetikleniyor(value: unknown, tetikleyici: string | null): boolean {
  if (!tetikleyici) return false;
  if (Array.isArray(value)) return value.includes(tetikleyici);
  return String(value) === tetikleyici;
}

// POST /api/worklogs/[date]/cevaplar — işe başlama check-in'i: sabah
// sorularının cevaplarını (ve varsa koşullu takip/detay cevaplarını) kaydeder
// ve worklogs.checkin_at'i doldurur. Bugüne ait worklog henüz yoksa (ilk kez
// check-in yapılıyorsa) burada oluşturulur — /api/worklogs POST'un create
// mantığıyla aynı, tekrar edilmedi çünkü tek satırlık bir INSERT.
export async function POST(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

    const { date } = await params;
    const raw = await req.json();
    const parsed = gunlukCevapSubmitSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { cevaplar } = parsed.data;

    const db = getDb();
    const sorular = await db.prepare(
      "SELECT id, zorunlu, detay_label, detay_tetikleyici FROM gunluk_soru WHERE is_active = 1"
    ).all() as { id: string; zorunlu: number; detay_label: string | null; detay_tetikleyici: string | null }[];

    const answerBySoruId = new Map(cevaplar.map(c => [c.soru_id, c.value]));
    const detayBySoruId = new Map(cevaplar.map(c => [c.soru_id, c.detay]));

    const missing = sorular.filter(s => s.zorunlu && isEmpty(answerBySoruId.get(s.id)));
    if (missing.length > 0) {
      return NextResponse.json({ ok: false, error: "Zorunlu sorular cevaplanmadı", missing: missing.map(s => s.id) }, { status: 400 });
    }

    const missingDetay = sorular.filter(s =>
      s.detay_label && detayTetikleniyor(answerBySoruId.get(s.id), s.detay_tetikleyici) && isEmpty(detayBySoruId.get(s.id))
    );
    if (missingDetay.length > 0) {
      return NextResponse.json({ ok: false, error: "Detay cevap gerekli", missing: missingDetay.map(s => s.id) }, { status: 400 });
    }

    const now = nowIso();
    let worklog = await db.prepare(
      "SELECT id, checkin_at FROM worklogs WHERE user_id = ? AND work_date = ?"
    ).get(user.id, date) as { id: string; checkin_at: string | null } | undefined;

    if (!worklog) {
      const id = uuidv4();
      await db.prepare(
        `INSERT INTO worklogs (id, user_id, work_date, summary, status_code, created_at, updated_at)
         VALUES (?, ?, ?, '', 'draft', ?, ?)`
      ).run(id, user.id, date, now, now);
      worklog = { id, checkin_at: null };
    }

    for (const c of cevaplar) {
      await db.prepare(
        `INSERT INTO gunluk_cevap (id, worklog_id, soru_id, cevap_json, detay_cevap, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE cevap_json = VALUES(cevap_json), detay_cevap = VALUES(detay_cevap), updated_at = VALUES(updated_at)`
      ).run(uuidv4(), worklog.id, c.soru_id, JSON.stringify(c.value), c.detay != null ? JSON.stringify(c.detay) : null, now, now);
    }

    if (!worklog.checkin_at) {
      await db.prepare("UPDATE worklogs SET checkin_at = ?, updated_at = ? WHERE id = ?").run(now, now, worklog.id);
    }

    return NextResponse.json({ ok: true, data: { worklog_id: worklog.id, checkin_at: worklog.checkin_at || now } });
  } catch (e) { return apiError(e); }
}
```

- [ ] **Step 2: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Live verify — missing-detay rejection**

Pick today's date (`YYYY-MM-DD`) and one of the seeded evet_hayir soru ids with a detay (e.g. "Açık/eksik güzergah var mı?" — triggers on `true`). Get its id:

```bash
curl -s -b /tmp/aycan-cookies.txt http://localhost:3000/api/gunluk-sorulari | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  const j = JSON.parse(d);
  const s = j.data.find(x => x.label === 'Açık/eksik güzergah var mı?');
  console.log(s.id);
});
"
```

Then, with that id as `SORU_ID`:

```bash
curl -s -b /tmp/aycan-cookies.txt -X POST "http://localhost:3000/api/worklogs/$(date +%F)/cevaplar" \
  -H "Content-Type: application/json" \
  -d "{\"cevaplar\":[{\"soru_id\":\"$SORU_ID\",\"value\":true,\"detay\":null}]}"
```

Expected: `{"ok":false,"error":"Zorunlu sorular cevaplanmadı",...}` if other zorunlu sorular weren't answered in the same call, or `{"ok":false,"error":"Detay cevap gerekli",...}` once all other zorunlu sorular are included and only the detay is left blank — confirms the new validation fires. (Full happy-path round trip is covered in Task 8's smoke test, which submits all 8 answers together.)

- [ ] **Step 4: Commit**

```bash
git add "app/api/worklogs/[date]/cevaplar/route.ts"
git commit -m "feat: check-in kaydetmede zorunlu detay kontrolü + detay_cevap persist"
```

---

### Task 6: Admin panel — bölüm başlığı + takip sorusu editörü

**Files:**
- Modify: `app/admin/gunluk-sorulari/page.tsx` (entire file)

**Interfaces:**
- Consumes: `POST`/`PUT /api/admin/gunluk-sorulari` from Task 3 (now accepting the 5 new fields).
- Produces: no new exports (page component only). Admin users can now set `bolum_baslik` and a detay block per soru.

- [ ] **Step 1: Replace the whole file**

```tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";

const TIP_LABELS: Record<string, string> = {
  evet_hayir: "Evet / Hayır",
  metin: "Kısa Metin",
  uzun_metin: "Uzun Metin",
  checklist: "Checklist (çoklu seçim)",
  secim: "Tekli Seçim",
};
const TIPLER = Object.keys(TIP_LABELS);
const OPTION_TIPLER = new Set(["checklist", "secim"]);
const DETAY_TIP_LABELS: Record<string, string> = {
  metin: "Kısa Metin",
  uzun_metin: "Uzun Metin",
  secim: "Tekli Seçim",
};
const DETAY_TIPLER = Object.keys(DETAY_TIP_LABELS);
// Detay (takip sorusu) yalnızca ayrık bir cevap değeri üretebilen tiplerde
// anlamlı — serbest metin cevaplara "hangi cevapta tetiklensin" sorulamaz.
const DETAY_APPLICABLE_TIPLER = new Set(["evet_hayir", "secim", "checklist"]);

const EMPTY_FORM = {
  label: "", tip: "evet_hayir", secenekler: [] as string[], zorunlu: true,
  bolum_baslik: "", detay_label: "", detay_tip: "" as "" | "metin" | "uzun_metin" | "secim",
  detay_secenekler: [] as string[], detay_tetikleyici: "",
};

export default function GunlukSorulariPage() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  const [sorular, setSorular] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [optionInput, setOptionInput] = useState("");
  const [detayOptionInput, setDetayOptionInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.ok) { router.replace("/login"); return; }
      setUser(d.data);
    }).catch(() => router.replace("/login"));
  }, [router]);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/gunluk-sorulari");
      const d = await r.json();
      if (d.ok) setSorular(d.data);
    } finally { setLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setOptionInput("");
    setDetayOptionInput("");
    setSaveError(null);
    setShowForm(true);
  }

  function openEdit(s: any) {
    setEditing(s);
    setForm({
      label: s.label, tip: s.tip, secenekler: s.secenekler || [], zorunlu: s.zorunlu,
      bolum_baslik: s.bolum_baslik || "", detay_label: s.detay_label || "",
      detay_tip: s.detay_tip || "", detay_secenekler: s.detay_secenekler || [],
      detay_tetikleyici: s.detay_tetikleyici || "",
    });
    setOptionInput("");
    setDetayOptionInput("");
    setSaveError(null);
    setShowForm(true);
  }

  function addOption() {
    if (!optionInput.trim()) return;
    setForm(f => ({ ...f, secenekler: [...f.secenekler, optionInput.trim()] }));
    setOptionInput("");
  }

  function removeOption(idx: number) {
    setForm(f => ({ ...f, secenekler: f.secenekler.filter((_, i) => i !== idx) }));
  }

  function addDetayOption() {
    if (!detayOptionInput.trim()) return;
    setForm(f => ({ ...f, detay_secenekler: [...f.detay_secenekler, detayOptionInput.trim()] }));
    setDetayOptionInput("");
  }

  function removeDetayOption(idx: number) {
    setForm(f => ({ ...f, detay_secenekler: f.detay_secenekler.filter((_, i) => i !== idx) }));
  }

  async function save() {
    if (!form.label.trim()) { setSaveError("Soru metni zorunlu"); return; }
    if (OPTION_TIPLER.has(form.tip) && form.secenekler.length === 0) {
      setSaveError("Bu tip için en az bir seçenek eklenmeli");
      return;
    }
    const detayVarMi = DETAY_APPLICABLE_TIPLER.has(form.tip) && form.detay_label.trim();
    if (detayVarMi && !form.detay_tetikleyici) {
      setSaveError("Takip sorusu için tetikleyici cevap seçilmeli");
      return;
    }
    if (detayVarMi && form.detay_tip === "secim" && form.detay_secenekler.length === 0) {
      setSaveError("Takip sorusu seçim tipi için en az bir seçenek eklenmeli");
      return;
    }
    setSaving(true); setSaveError(null);
    try {
      const body = {
        label: form.label, tip: form.tip,
        secenekler: OPTION_TIPLER.has(form.tip) ? form.secenekler : null,
        zorunlu: form.zorunlu,
        bolum_baslik: form.bolum_baslik.trim() || null,
        detay_label: detayVarMi ? form.detay_label.trim() : null,
        detay_tip: detayVarMi ? form.detay_tip || null : null,
        detay_secenekler: detayVarMi && form.detay_tip === "secim" ? form.detay_secenekler : null,
        detay_tetikleyici: detayVarMi ? form.detay_tetikleyici : null,
      };
      const url = editing ? `/api/admin/gunluk-sorulari/${editing.id}` : "/api/admin/gunluk-sorulari";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!d.ok) { setSaveError(typeof d.error === "string" ? d.error : "Kayıt hatası"); return; }
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Bu soru silinsin mi?")) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/admin/gunluk-sorulari/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (d.ok) load(); else alert(d.error);
    } finally { setDeletingId(null); }
  }

  if (!user) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500">Yükleniyor...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav user={user} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a href="/admin" className="text-zinc-500 hover:text-white text-sm transition-colors">Yönetim</a>
              <span className="text-zinc-700">/</span>
              <span className="text-white text-sm">Günlük Soruları</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Günlük Soruları</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{sorular.length} soru — işe başlama check-in'inde sırayla gösterilir</p>
          </div>
          <button onClick={openCreate}
            className="bg-white text-zinc-950 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors whitespace-nowrap">
            + Soru Ekle
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Yükleniyor...</div>
        ) : sorular.length === 0 ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Henüz soru eklenmedi</div>
        ) : (
          <div className="space-y-2">
            {sorular.map((s, idx) => (
              <div key={s.id} onClick={() => openEdit(s)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4 cursor-pointer hover:border-zinc-700 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-zinc-600 text-xs w-5 shrink-0">{idx + 1}.</span>
                  <span className="text-white text-sm flex-1">{s.label}</span>
                  {s.bolum_baslik && <span className="text-xs text-blue-400 border border-blue-800/60 px-2 py-0.5 rounded-full shrink-0">{s.bolum_baslik}</span>}
                  <span className="text-xs text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded-full shrink-0">{TIP_LABELS[s.tip]}</span>
                  {!s.zorunlu && <span className="text-xs text-zinc-600 shrink-0">opsiyonel</span>}
                  <button onClick={e => { e.stopPropagation(); remove(s.id); }} disabled={deletingId === s.id}
                    className="text-xs text-zinc-700 hover:text-red-400 transition-colors px-1 disabled:opacity-40 shrink-0">
                    {deletingId === s.id ? "..." : "Sil"}
                  </button>
                </div>
                {s.secenekler && s.secenekler.length > 0 && (
                  <p className="text-zinc-600 text-xs mt-1.5 ml-8">{s.secenekler.join(", ")}</p>
                )}
                {s.detay_label && (
                  <p className="text-zinc-600 text-xs mt-1.5 ml-8">↳ takip: {s.detay_label}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md my-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editing ? "Soruyu Düzenle" : "Soru Ekle"}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-600 hover:text-white text-xl">×</button>
            </div>
            <div className="space-y-3">
              {saveError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded-lg">{saveError}</div>}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Bölüm Başlığı (opsiyonel)</label>
                <input value={form.bolum_baslik} onChange={e => setForm(f => ({ ...f, bolum_baslik: e.target.value }))}
                  placeholder="Örn: Dünün Değerlendirmesi"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                <p className="text-zinc-600 text-xs mt-1">Aynı başlığa sahip ardışık sorular check-in'de tek başlık altında gruplanır.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Soru Metni *</label>
                <textarea value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} rows={2}
                  placeholder="Örn: Araç kontrolü yapıldı mı?"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Cevap Tipi</label>
                <select value={form.tip} onChange={e => setForm(f => ({ ...f, tip: e.target.value, detay_tetikleyici: "" }))}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                  {TIPLER.map(t => <option key={t} value={t}>{TIP_LABELS[t]}</option>)}
                </select>
              </div>

              {OPTION_TIPLER.has(form.tip) && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Seçenekler *</label>
                  <div className="space-y-1 mb-2">
                    {form.secenekler.map((o, i) => (
                      <div key={i} className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-3 py-1.5">
                        <span className="flex-1 text-zinc-300 text-sm">{o}</span>
                        <button onClick={() => removeOption(i)} className="text-zinc-600 hover:text-red-400 text-xs transition-colors">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={optionInput} onChange={e => setOptionInput(e.target.value)}
                      placeholder="Seçenek yazıp Ekle'ye basın"
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
                      className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                    <button onClick={addOption} disabled={!optionInput.trim()}
                      className="bg-zinc-800 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-zinc-700 disabled:opacity-40 transition-colors">
                      Ekle
                    </button>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 py-1 cursor-pointer">
                <input type="checkbox" checked={form.zorunlu} onChange={e => setForm(f => ({ ...f, zorunlu: e.target.checked }))}
                  className="accent-white" />
                <span className="text-sm text-zinc-300">Zorunlu (cevaplanmadan check-in tamamlanamaz)</span>
              </label>

              {DETAY_APPLICABLE_TIPLER.has(form.tip) && (
                <div className="border-t border-zinc-800 pt-3 mt-1">
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Bağlı Takip Sorusu (opsiyonel)</p>

                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Hangi cevapta gösterilsin?</label>
                  {form.tip === "evet_hayir" ? (
                    <div className="flex gap-2 mb-3">
                      <button onClick={() => setForm(f => ({ ...f, detay_tetikleyici: "true" }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${form.detay_tetikleyici === "true" ? "bg-emerald-700 border-emerald-600 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                        Evet
                      </button>
                      <button onClick={() => setForm(f => ({ ...f, detay_tetikleyici: "false" }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${form.detay_tetikleyici === "false" ? "bg-red-800 border-red-700 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                        Hayır
                      </button>
                    </div>
                  ) : (
                    <select value={form.detay_tetikleyici} onChange={e => setForm(f => ({ ...f, detay_tetikleyici: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 mb-3">
                      <option value="">— Seçenek seçin —</option>
                      {form.secenekler.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  )}

                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Takip Sorusu Metni</label>
                  <textarea value={form.detay_label} onChange={e => setForm(f => ({ ...f, detay_label: e.target.value }))} rows={2}
                    placeholder="Örn: Ne eksik kaldı?"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500 resize-none mb-3" />

                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Takip Cevap Tipi</label>
                  <select value={form.detay_tip} onChange={e => setForm(f => ({ ...f, detay_tip: e.target.value as any }))}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2.5 rounded-lg focus:outline-none focus:border-zinc-500">
                    <option value="">— Seçin —</option>
                    {DETAY_TIPLER.map(t => <option key={t} value={t}>{DETAY_TIP_LABELS[t]}</option>)}
                  </select>

                  {form.detay_tip === "secim" && (
                    <div className="mt-3">
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Takip Seçenekleri *</label>
                      <div className="space-y-1 mb-2">
                        {form.detay_secenekler.map((o, i) => (
                          <div key={i} className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-3 py-1.5">
                            <span className="flex-1 text-zinc-300 text-sm">{o}</span>
                            <button onClick={() => removeDetayOption(i)} className="text-zinc-600 hover:text-red-400 text-xs transition-colors">✕</button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input value={detayOptionInput} onChange={e => setDetayOptionInput(e.target.value)}
                          placeholder="Seçenek yazıp Ekle'ye basın"
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addDetayOption(); } }}
                          className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                        <button onClick={addDetayOption} disabled={!detayOptionInput.trim()}
                          className="bg-zinc-800 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-zinc-700 disabled:opacity-40 transition-colors">
                          Ekle
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2.5 rounded-lg hover:bg-zinc-700 transition-colors">İptal</button>
              <button onClick={save} disabled={saving} className="flex-1 bg-white text-zinc-950 text-sm font-semibold py-2.5 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Live browser check**

Using the project's dev server preview (start it if not running, navigate to `/admin/gunluk-sorulari` logged in as `admin1`): confirm the 8 seeded questions list with their bölüm etiketi and "↳ takip: ..." lines where applicable; open one (e.g. "Açık/eksik güzergah var mı?") and confirm the "Bağlı Takip Sorusu" block shows "Evet" pre-selected and the detay fields pre-filled; edit and save a trivial change (e.g. toggle zorunlu off and back on) to confirm PUT round-trips without error.

- [ ] **Step 4: Commit**

```bash
git add app/admin/gunluk-sorulari/page.tsx
git commit -m "feat: admin panelde bölüm başlığı + takip sorusu editörü"
```

---

### Task 7: Check-in ekranı — bölüm başlıkları + koşullu detay render

**Files:**
- Modify: `app/gunluk/[date]/page.tsx:56-60` (state)
- Modify: `app/gunluk/[date]/page.tsx:87-93` (`loadWorklog` prefill)
- Modify: `app/gunluk/[date]/page.tsx:116-126` (helpers, insert after)
- Modify: `app/gunluk/[date]/page.tsx:132` (`saveCevaplar` payload)
- Modify: `app/gunluk/[date]/page.tsx:312-358` (sorular render block)

**Interfaces:**
- Consumes: `GET /api/gunluk-sorulari` and `GET /api/worklogs/[date]` (Task 4, now returning detay fields), `POST /api/worklogs/[date]/cevaplar` (Task 5, now accepting `detay`).
- Produces: no new exports (page component only). This is the final consumer of the whole chain.

- [ ] **Step 1: Add `detayForm` state**

Find (currently at `app/gunluk/[date]/page.tsx:56-60`):

```tsx
  // Güne Başla — işe başlama check-in soruları
  const [sorular, setSorular] = useState<any[]>([]);
  const [sorularLoading, setSorularLoading] = useState(true);
  const [cevapForm, setCevapForm] = useState<Record<string, any>>({});
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);
```

Replace with:

```tsx
  // Güne Başla — işe başlama check-in soruları
  const [sorular, setSorular] = useState<any[]>([]);
  const [sorularLoading, setSorularLoading] = useState(true);
  const [cevapForm, setCevapForm] = useState<Record<string, any>>({});
  const [detayForm, setDetayForm] = useState<Record<string, any>>({});
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);
```

- [ ] **Step 2: Prefill `detayForm` in `loadWorklog`**

Find (currently at `app/gunluk/[date]/page.tsx:87-93`):

```tsx
        const prefill: Record<string, any> = {};
        for (const c of d.data.cevaplar || []) prefill[c.soru_id] = c.value;
        setCevapForm(prefill);
        loadNotes(d.data.id);
      } else {
        setWorklog(null); setRows([]); setDescription(""); setDescSaved("");
        setVisits([]); setIssues([]); setCevapForm({});
      }
```

Replace with:

```tsx
        const prefill: Record<string, any> = {};
        const detayPrefill: Record<string, any> = {};
        for (const c of d.data.cevaplar || []) {
          prefill[c.soru_id] = c.value;
          if (c.detay != null) detayPrefill[c.soru_id] = c.detay;
        }
        setCevapForm(prefill);
        setDetayForm(detayPrefill);
        loadNotes(d.data.id);
      } else {
        setWorklog(null); setRows([]); setDescription(""); setDescSaved("");
        setVisits([]); setIssues([]); setCevapForm({}); setDetayForm({});
      }
```

- [ ] **Step 3: Add `detayTetikleniyor`/`updateDetay` helpers**

Find (currently at `app/gunluk/[date]/page.tsx:116-126`):

```tsx
  function updateCevap(soruId: string, value: any) {
    setCevapForm(f => ({ ...f, [soruId]: value }));
  }

  function toggleChecklistOption(soruId: string, option: string) {
    setCevapForm(f => {
      const current: string[] = Array.isArray(f[soruId]) ? f[soruId] : [];
      const next = current.includes(option) ? current.filter(o => o !== option) : [...current, option];
      return { ...f, [soruId]: next };
    });
  }
```

Replace with:

```tsx
  function updateCevap(soruId: string, value: any) {
    setCevapForm(f => ({ ...f, [soruId]: value }));
  }

  function toggleChecklistOption(soruId: string, option: string) {
    setCevapForm(f => {
      const current: string[] = Array.isArray(f[soruId]) ? f[soruId] : [];
      const next = current.includes(option) ? current.filter(o => o !== option) : [...current, option];
      return { ...f, [soruId]: next };
    });
  }

  function updateDetay(soruId: string, value: any) {
    setDetayForm(f => ({ ...f, [soruId]: value }));
  }

  function detayTetikleniyor(value: any, tetikleyici: string | null | undefined): boolean {
    if (!tetikleyici) return false;
    if (Array.isArray(value)) return value.includes(tetikleyici);
    return String(value) === tetikleyici;
  }
```

- [ ] **Step 4: Include `detay` in `saveCevaplar` payload**

Find (currently at `app/gunluk/[date]/page.tsx:132`):

```tsx
      const cevaplar = sorular.map(s => ({ soru_id: s.id, value: cevapForm[s.id] ?? null }));
```

Replace with:

```tsx
      const cevaplar = sorular.map(s => ({ soru_id: s.id, value: cevapForm[s.id] ?? null, detay: detayForm[s.id] ?? null }));
```

- [ ] **Step 5: Group by `bolum_baslik` and render detay input in the sorular map**

Find (currently at `app/gunluk/[date]/page.tsx:312-358`):

```tsx
                    sorular.map((s: any) => (
                      <div key={s.id}>
                        <label className="block text-sm text-zinc-300 mb-1.5">
                          {s.label}{s.zorunlu && <span className="text-red-400"> *</span>}
                        </label>
                        {s.tip === "evet_hayir" && (
                          <div className="flex gap-2">
                            <button onClick={() => updateCevap(s.id, true)}
                              className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${cevapForm[s.id] === true ? "bg-emerald-700 border-emerald-600 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                              Evet
                            </button>
                            <button onClick={() => updateCevap(s.id, false)}
                              className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${cevapForm[s.id] === false ? "bg-red-800 border-red-700 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                              Hayır
                            </button>
                          </div>
                        )}
                        {s.tip === "metin" && (
                          <input value={cevapForm[s.id] || ""} onChange={e => updateCevap(s.id, e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                        )}
                        {s.tip === "uzun_metin" && (
                          <textarea value={cevapForm[s.id] || ""} onChange={e => updateCevap(s.id, e.target.value)} rows={3}
                            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
                        )}
                        {s.tip === "checklist" && (
                          <div className="space-y-1.5">
                            {(s.secenekler || []).map((opt: string) => {
                              const checked = Array.isArray(cevapForm[s.id]) && cevapForm[s.id].includes(opt);
                              return (
                                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={checked} onChange={() => toggleChecklistOption(s.id, opt)} className="accent-white" />
                                  <span className="text-sm text-zinc-300">{opt}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        {s.tip === "secim" && (
                          <select value={cevapForm[s.id] || ""} onChange={e => updateCevap(s.id, e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                            <option value="">— Seçin —</option>
                            {(s.secenekler || []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        )}
                      </div>
                    ))
```

Replace with:

```tsx
                    sorular.map((s: any, idx: number) => {
                      const prevBolum = idx > 0 ? sorular[idx - 1].bolum_baslik : null;
                      const showBolum = s.bolum_baslik && s.bolum_baslik !== prevBolum;
                      const detayAcik = s.detay_label && detayTetikleniyor(cevapForm[s.id], s.detay_tetikleyici);
                      return (
                        <div key={s.id}>
                          {showBolum && (
                            <p className="text-[11px] font-semibold text-blue-400/80 uppercase tracking-widest pt-2 pb-1 first:pt-0">
                              {s.bolum_baslik}
                            </p>
                          )}
                          <label className="block text-sm text-zinc-300 mb-1.5">
                            {s.label}{s.zorunlu && <span className="text-red-400"> *</span>}
                          </label>
                          {s.tip === "evet_hayir" && (
                            <div className="flex gap-2">
                              <button onClick={() => updateCevap(s.id, true)}
                                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${cevapForm[s.id] === true ? "bg-emerald-700 border-emerald-600 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                                Evet
                              </button>
                              <button onClick={() => updateCevap(s.id, false)}
                                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${cevapForm[s.id] === false ? "bg-red-800 border-red-700 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                                Hayır
                              </button>
                            </div>
                          )}
                          {s.tip === "metin" && (
                            <input value={cevapForm[s.id] || ""} onChange={e => updateCevap(s.id, e.target.value)}
                              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                          )}
                          {s.tip === "uzun_metin" && (
                            <textarea value={cevapForm[s.id] || ""} onChange={e => updateCevap(s.id, e.target.value)} rows={3}
                              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
                          )}
                          {s.tip === "checklist" && (
                            <div className="space-y-1.5">
                              {(s.secenekler || []).map((opt: string) => {
                                const checked = Array.isArray(cevapForm[s.id]) && cevapForm[s.id].includes(opt);
                                return (
                                  <label key={opt} className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={checked} onChange={() => toggleChecklistOption(s.id, opt)} className="accent-white" />
                                    <span className="text-sm text-zinc-300">{opt}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          {s.tip === "secim" && (
                            <select value={cevapForm[s.id] || ""} onChange={e => updateCevap(s.id, e.target.value)}
                              className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                              <option value="">— Seçin —</option>
                              {(s.secenekler || []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          )}
                          {detayAcik && (
                            <div className="mt-2 pl-3 border-l-2 border-zinc-700">
                              <label className="block text-xs text-zinc-400 mb-1">{s.detay_label}</label>
                              {s.detay_tip === "metin" && (
                                <input value={detayForm[s.id] || ""} onChange={e => updateDetay(s.id, e.target.value)}
                                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500" />
                              )}
                              {s.detay_tip === "uzun_metin" && (
                                <textarea value={detayForm[s.id] || ""} onChange={e => updateDetay(s.id, e.target.value)} rows={2}
                                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500 resize-none" />
                              )}
                              {s.detay_tip === "secim" && (
                                <select value={detayForm[s.id] || ""} onChange={e => updateDetay(s.id, e.target.value)}
                                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-zinc-500">
                                  <option value="">— Seçin —</option>
                                  {(s.detay_secenekler || []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
```

- [ ] **Step 6: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add "app/gunluk/[date]/page.tsx"
git commit -m "feat: check-in ekranına bölüm başlığı + koşullu detay soru render"
```

---

### Task 8: Uçtan uca smoke test

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: nothing — confirms the full chain works together.

- [ ] **Step 1: Confirm/reconnect the SSH tunnel and DB access**

```bash
nc -z -w3 127.0.0.1 3307 && echo TUNNEL_UP || echo TUNNEL_DOWN
```

If down, reconnect (ask the user for a working SSH password first — the password used earlier in this project's session failed):

```bash
sshpass -p '<password>' ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -f -N -L 3307:172.22.0.3:3306 root@212.64.201.150
```

- [ ] **Step 2: Full `tsc` pass across the whole feature**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 0 errors (confirms Tasks 2-7 didn't drift against each other).

- [ ] **Step 3: Live browser walkthrough of `/gunluk/<bugünün tarihi>`**

Start the dev server preview, log in as `admin1`/`admin1` (or whatever working credential Task 3 confirmed), navigate to `/gunluk/<YYYY-MM-DD for today>`. Confirm:
- The "Güne Başla" gate shows 8 sorular grouped under exactly 2 section headers ("Dünün Değerlendirmesi", "Bugüne Dair").
- Answering "Hayır" to "Dün işini eksiksiz tamamladın mı?" reveals a text input labeled "Ne eksik kaldı?"; answering "Evet" hides it again.
- Answering "Evet" to "Destek/yönlendirme ihtiyacım var" reveals a dropdown labeled "Kimden?" with the 6 department options.
- Clicking "Kaydet ve Devam Et" without filling a revealed required detay shows the `checkinError` message from the API's `"Detay cevap gerekli"` response.
- Filling every question (including all revealed detay fields) and saving succeeds, the check-in gate disappears, and "Güne başlandı: HH:MM" appears.
- Reloading the page keeps the check-in gate hidden (checkin_at persisted) and, if the manager view or a re-opened edit path exposes the saved answers, the detay values are still there (verify via the DB query in Step 4 if the UI doesn't surface a read-back view).
- Backward compatibility: navigate to `/gunluk/<a date from before this feature shipped>` (any worklog created before Task 1's migration ran). Confirm the page renders without error — its `gunluk_cevap` rows have `detay_cevap = NULL`, which Task 4's `c.detay_cevap ? JSON.parse(...) : null` guard and Task 7's `s.detay_label && ...` guard must both handle silently.

- [ ] **Step 4: DB confirmation of the saved answers**

```bash
node -e "
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'aycanops', password: 'Kayra2190.', database: 'aycanops_db' });
  const [rows] = await conn.query(\`
    SELECT s.label, c.cevap_json, c.detay_cevap
    FROM gunluk_cevap c JOIN gunluk_soru s ON s.id = c.soru_id
    JOIN worklogs w ON w.id = c.worklog_id
    WHERE w.work_date = CURDATE()
    ORDER BY s.sort_order
  \`);
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
})();
"
```

Expected: 8 rows, `cevap_json`/`detay_cevap` matching what was entered in Step 3.

- [ ] **Step 5: Update `.superpowers/sdd/progress.md`**

Append a line documenting this feature's completion, following the existing entries' style (one line per task/phase, noting commits and any fix rounds), so future sessions have the same continuity this project's Faz1/Faz2 work maintained.

- [ ] **Step 6: Final commit (if Step 5 produced changes)**

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs: iş başı check-in detay soruları tamamlandı"
```
