import ExcelJS from "exceljs";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { nowIso } from "@/lib/time";
import { geocodeAddress } from "@/lib/geocode";

export type ImportModule = "companies" | "vehicles" | "drivers" | "passengers" | "routes" | "suppliers";

export type ImportColumn = {
  key: string;
  label: string;
  required?: boolean;
  sample?: string | number;
};

type ImportTemplate = {
  module: ImportModule;
  label: string;
  columns: ImportColumn[];
};

export const IMPORT_TEMPLATES: Record<ImportModule, ImportTemplate> = {
  companies: {
    module: "companies",
    label: "Firmalar",
    columns: [
      { key: "name", label: "Firma Adı", required: true, sample: "NARPLAS" },
      { key: "notes", label: "Not", sample: "Ana müşteri" },
    ],
  },
  vehicles: {
    module: "vehicles",
    label: "Araçlar",
    columns: [
      { key: "plate", label: "Plaka", required: true, sample: "34 ABC 123" },
      { key: "type", label: "Tip", sample: "minibus" },
      { key: "capacity", label: "Kapasite", sample: 16 },
      { key: "brand", label: "Marka", sample: "Mercedes" },
      { key: "model", label: "Model", sample: "Sprinter" },
      { key: "year", label: "Yıl", sample: 2021 },
      { key: "driver_name", label: "Sürücü Adı", sample: "Ahmet Yılmaz" },
      { key: "driver_phone", label: "Sürücü Telefon", sample: "05xx xxx xx xx" },
      { key: "status_code", label: "Durum", sample: "active" },
      { key: "notes", label: "Not", sample: "" },
    ],
  },
  suppliers: {
    module: "suppliers",
    label: "Tedarikçiler",
    columns: [
      { key: "title", label: "Tedarikçi Ünvanı", required: true, sample: "ABC Turizm" },
      { key: "contact_name", label: "Yetkili Kişi", sample: "Mehmet Kaya" },
      { key: "phone", label: "Telefon", sample: "05xx xxx xx xx" },
      { key: "email", label: "E-posta", sample: "info@example.com" },
      { key: "tax_id", label: "Vergi No", sample: "" },
      { key: "tax_office", label: "Vergi Dairesi", sample: "" },
      { key: "company_name", label: "Hizmet Verdiği Firma", sample: "NARPLAS" },
      { key: "notes", label: "Not", sample: "" },
    ],
  },
  drivers: {
    module: "drivers",
    label: "Sürücüler",
    columns: [
      { key: "name", label: "Ad Soyad", required: true, sample: "Ahmet Yılmaz" },
      { key: "phone", label: "Telefon", sample: "05xx xxx xx xx" },
      { key: "email", label: "E-posta", sample: "ahmet@example.com" },
      { key: "tc_no", label: "TC No", sample: "" },
      { key: "license_number", label: "Ehliyet No", sample: "" },
      { key: "license_class", label: "Ehliyet Sınıfı", sample: "D" },
      { key: "license_expiry", label: "Ehliyet Bitiş", sample: "2027-12-31" },
      { key: "src_expiry", label: "SRC Bitiş", sample: "2027-12-31" },
      { key: "psiko_expiry", label: "Psikoteknik Bitiş", sample: "2027-12-31" },
      { key: "health_expiry", label: "Sağlık Bitiş", sample: "2027-12-31" },
      { key: "status", label: "Durum", sample: "aktif" },
      { key: "notes", label: "Not", sample: "" },
    ],
  },
  passengers: {
    module: "passengers",
    label: "Yolcular/Personeller",
    columns: [
      { key: "full_name", label: "Ad Soyad", required: true, sample: "Ayşe Demir" },
      { key: "company_name", label: "Firma Adı", sample: "NARPLAS" },
      { key: "phone", label: "Telefon", sample: "05xx xxx xx xx" },
      { key: "email", label: "E-posta", sample: "ayse@example.com" },
      { key: "id_number", label: "TC/Pasaport", sample: "" },
      { key: "type", label: "Tür", sample: "personel" },
      { key: "pickup_address", label: "Alış Adresi", sample: "Pendik, İstanbul" },
      { key: "dropoff_address", label: "Bırakış Adresi", sample: "Gebze OSB" },
      { key: "status", label: "Durum", sample: "aktif" },
      { key: "notes", label: "Not", sample: "" },
    ],
  },
  routes: {
    module: "routes",
    label: "Güzergahlar",
    columns: [
      { key: "name", label: "Güzergah Adı", required: true, sample: "NARPLAS Sabah 1" },
      { key: "code", label: "Kod", sample: "NP-S1" },
      { key: "company_name", label: "Firma Adı", sample: "NARPLAS" },
      { key: "supplier_name", label: "Tedarikçi Adı", sample: "ABC Turizm" },
      { key: "direction", label: "Yön", sample: "both" },
      { key: "capacity", label: "Kapasite", sample: 16 },
      { key: "schedule_mode", label: "Çalışma Tipi", sample: "fixed" },
      { key: "shift_name", label: "Vardiya", sample: "" },
      { key: "morning_departure", label: "Sabah Kalkış", sample: "07:00" },
      { key: "morning_arrival", label: "Sabah Varış", sample: "08:00" },
      { key: "evening_departure", label: "Akşam Kalkış", sample: "18:00" },
      { key: "evening_arrival", label: "Akşam Varış", sample: "19:00" },
      { key: "stops", label: "Duraklar (; ile)", sample: "Kartal; Pendik; Tuzla" },
      { key: "price", label: "Fiyat", sample: 2500 },
      { key: "valid_from", label: "Fiyat Başlangıç", sample: "2026-05-01" },
      { key: "valid_to", label: "Fiyat Bitiş", sample: "" },
      { key: "plate", label: "Plaka", sample: "34 ABC 123" },
      { key: "vehicle_assignment_status", label: "Araç Durumu", sample: "fixed" },
      { key: "notes", label: "Not", sample: "" },
    ],
  },
};

export function isImportModule(value: string | null): value is ImportModule {
  return value === "companies" || value === "vehicles" || value === "drivers" || value === "passengers" || value === "routes" || value === "suppliers";
}

function safeWorksheetName(name: string) {
  const cleaned = name.replace(/[\\/*?:\[\]]/g, "-").replace(/\s+/g, " ").trim();
  return (cleaned || "Sayfa").slice(0, 31);
}

function cellToValue(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && value.text) return String(value.text);
    if ("result" in value && value.result != null) return String(value.result);
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map(r => r.text).join("");
    if ("hyperlink" in value && "text" in value) return String(value.text ?? value.hyperlink);
    return String(value);
  }
  return String(value).trim();
}

function normalizePlate(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR");
}

function normalizeDate(value: string) {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return trimmed;
}

function normalizeRow(module: ImportModule, raw: Record<string, string>) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const row: Record<string, unknown> = {};

  for (const column of IMPORT_TEMPLATES[module].columns) {
    const value = (raw[column.key] ?? "").trim();
    if (column.required && !value) errors.push(`${column.label} zorunludur`);
    row[column.key] = value || null;
  }

  if (module === "companies") {
    if (row.name) row.name = String(row.name).trim();
  }

  if (module === "vehicles") {
    if (row.plate) row.plate = normalizePlate(String(row.plate));
    if (row.capacity) row.capacity = Math.max(1, Number(row.capacity) || 14);
    if (row.year) row.year = Number(row.year) || null;
    if (!row.type) row.type = "minibus";
    if (!row.status_code) row.status_code = "active";
    if (row.plate && !/^\d{2}\s?[A-ZÇĞİÖŞÜ]{1,3}\s?\d{2,4}$/i.test(String(row.plate))) warnings.push("Plaka formatı kontrol edilmeli");
  }

  if (module === "suppliers") {
    if (row.title) row.title = String(row.title).trim();
  }

  if (module === "drivers") {
    if (!row.status) row.status = "aktif";
    for (const key of ["license_expiry", "src_expiry", "psiko_expiry", "health_expiry"]) row[key] = normalizeDate(String(row[key] ?? ""));
  }

  if (module === "passengers") {
    if (!row.type) row.type = "personel";
    if (!row.status) row.status = "aktif";
  }

  if (module === "routes") {
    if (!row.direction) row.direction = "both";
    if (!row.schedule_mode) row.schedule_mode = "fixed";
    if (row.capacity) row.capacity = Math.max(0, Number(row.capacity) || 0);
    if (row.price) row.price = Number(row.price) || null;
    for (const key of ["valid_from", "valid_to"]) row[key] = normalizeDate(String(row[key] ?? ""));
    if (row.plate) row.plate = normalizePlate(String(row.plate));
    if (!row.vehicle_assignment_status) row.vehicle_assignment_status = row.plate ? "fixed" : "searching";
    if (row.stops) {
      const stops = String(row.stops).split(";").map((name, index) => ({ name: name.trim(), order: index + 1 })).filter(s => s.name);
      row.stops_json = stops;
      if (stops.length < 2) warnings.push("Harita için en az 2 durak önerilir");
    }
  }

  return { normalized: row, errors, warnings };
}

export async function createTemplateWorkbook(module: ImportModule) {
  const template = IMPORT_TEMPLATES[module];
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(safeWorksheetName(template.label));
  sheet.columns = template.columns.map(c => ({ header: c.label, key: c.key, width: Math.max(16, c.label.length + 4) }));
  sheet.addRow(Object.fromEntries(template.columns.map(c => [c.key, c.sample ?? ""])));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F2FE" } };
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function parseImportWorkbook(module: ImportModule, buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Excel sayfası bulunamadı");

  const template = IMPORT_TEMPLATES[module];
  const headerRow = sheet.getRow(1);
  const headerMap = new Map<number, string>();

  headerRow.eachCell((cell, colNumber) => {
    const label = cellToValue(cell.value).toLocaleLowerCase("tr-TR");
    const col = template.columns.find(c => c.label.toLocaleLowerCase("tr-TR") === label || c.key.toLocaleLowerCase("tr-TR") === label);
    if (col) headerMap.set(colNumber, col.key);
  });

  if (headerMap.size === 0) throw new Error("Şablon kolonları eşleşmedi");

  const rows: Array<{ rowNo: number; raw: Record<string, string>; normalized: Record<string, unknown>; errors: string[]; warnings: string[] }> = [];
  sheet.eachRow((row, rowNo) => {
    if (rowNo === 1) return;
    const raw: Record<string, string> = {};
    for (const column of template.columns) raw[column.key] = "";
    headerMap.forEach((key, colNumber) => { raw[key] = cellToValue(row.getCell(colNumber).value); });
    if (Object.values(raw).every(v => !v)) return;
    const normalized = normalizeRow(module, raw);
    rows.push({ rowNo, raw, ...normalized });
  });
  return rows;
}

export async function createImportJob(module: ImportModule, fileName: string, buffer: Buffer, userId: string) {
  const db = getDb();
  const rows = await parseImportWorkbook(module, buffer);
  const id = uuidv4();
  const now = nowIso();
  const validRows = rows.filter(r => r.errors.length === 0).length;
  const warningRows = rows.filter(r => r.errors.length === 0 && r.warnings.length > 0).length;
  const errorRows = rows.filter(r => r.errors.length > 0).length;

  await db.prepare(
    `INSERT INTO import_jobs (id, module, status, file_name, total_rows, valid_rows, warning_rows, error_rows, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, module, errorRows > 0 ? "needs_fix" : "validated", fileName, rows.length, validRows, warningRows, errorRows, userId, now, now);

  for (const row of rows) {
    await db.prepare(
      `INSERT INTO import_job_rows (id, job_id, row_no, status, raw_json, normalized_json, errors_json, warnings_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuidv4(), id, row.rowNo, row.errors.length > 0 ? "error" : "valid",
      JSON.stringify(row.raw), JSON.stringify(row.normalized), JSON.stringify(row.errors), JSON.stringify(row.warnings), now, now
    );
  }

  return { id, totalRows: rows.length, validRows, warningRows, errorRows };
}

async function findCompanyId(name: string | null | undefined) {
  if (!name) return null;
  const db = getDb();
  const row = await db.prepare("SELECT id FROM companies WHERE name = ? LIMIT 1").get(name) as { id: string } | undefined;
  return row?.id ?? null;
}

async function findSupplierId(title: string | null | undefined) {
  if (!title) return null;
  const db = getDb();
  const row = await db.prepare("SELECT id FROM suppliers WHERE title = ? LIMIT 1").get(title) as { id: string } | undefined;
  return row?.id ?? null;
}

async function findOrBindVehicleId(plate: string | null | undefined, supplierId: string | null, userId: string) {
  if (!plate) return null;
  const db = getDb();
  const now = nowIso();
  const existing = await db.prepare("SELECT id, supplier_id FROM vehicles WHERE plate = ? LIMIT 1").get(plate) as { id: string; supplier_id: string | null } | undefined;
  if (existing) {
    if (existing.supplier_id && supplierId && existing.supplier_id !== supplierId) throw new Error(`${plate} plakası başka tedarikçiye bağlı`);
    if (supplierId && !existing.supplier_id) await db.prepare("UPDATE vehicles SET supplier_id=?, updated_at=? WHERE id=?").run(supplierId, now, existing.id);
    return existing.id;
  }
  const id = uuidv4();
  await db.prepare(`INSERT INTO vehicles (id, supplier_id, plate, type, capacity, status_code, created_by, created_at, updated_at) VALUES (?, ?, ?, 'minibus', 14, 'active', ?, ?, ?)`)
    .run(id, supplierId || null, plate, userId, now, now);
  return id;
}

async function insertRoutePriceIfMissing(params: { companyId: string; routeId: string; vehicleId: string | null; plate: string | null; price: number; validFrom: string; validTo: string | null; userId: string }) {
  const db = getDb();
  const plate = params.plate?.trim().toUpperCase() || null;
  const overlap = await db.prepare(
    `SELECT id FROM route_supplier_prices
     WHERE company_id=? AND route_id=?
       AND COALESCE(plate, '') = COALESCE(?, '')
       AND COALESCE(vehicle_id, '') = COALESCE(?, '')
       AND valid_from <= COALESCE(?, '9999-12-31')
       AND COALESCE(valid_to, '9999-12-31') >= ?
     LIMIT 1`
  ).get(params.companyId, params.routeId, plate, params.vehicleId, params.validTo, params.validFrom);
  if (overlap) return;
  const now = nowIso();
  await db.prepare(`INSERT INTO route_supplier_prices (id, company_id, route_id, supplier_id, vehicle_id, plate, price_amount, currency, valid_from, valid_to, created_by, created_at, updated_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, 'TRY', ?, ?, ?, ?, ?)`)
    .run(uuidv4(), params.companyId, params.routeId, params.vehicleId, plate, params.price, params.validFrom, params.validTo, params.userId, now, now);
}

async function geocodePickupAddress(address: string | null | undefined) {
  try {
    return await geocodeAddress(address);
  } catch {
    return null;
  }
}

async function executeRow(module: ImportModule, normalized: Record<string, any>, userId: string, allowedCompanies: string[] | null) {
  const db = getDb();
  const now = nowIso();

  function assertCompanyAllowed(companyId: string | null) {
    if (!allowedCompanies) return;
    if (!companyId || !allowedCompanies.includes(companyId)) {
      throw new Error("Bu firmaya erişim yetkiniz yok");
    }
  }

  if (module === "companies") {
    // Firma bazlı kısıtlı kullanıcılar yeni firma oluşturamaz/güncelleyemez
    if (allowedCompanies) throw new Error("Firma oluşturma/güncelleme yetkiniz yok");
    const existing = await db.prepare("SELECT id FROM companies WHERE name = ? LIMIT 1").get(normalized.name) as { id: string } | undefined;
    if (existing) {
      await db.prepare("UPDATE companies SET notes = COALESCE(?, notes), updated_at = ? WHERE id = ?").run(normalized.notes, now, existing.id);
      return { id: existing.id, mode: "updated" as const };
    }
    const id = uuidv4();
    await db.prepare("INSERT INTO companies (id, name, notes, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)").run(id, normalized.name, normalized.notes, userId, now, now);
    return { id, mode: "inserted" as const };
  }

  if (module === "vehicles") {
    const existing = await db.prepare("SELECT id FROM vehicles WHERE plate = ? LIMIT 1").get(normalized.plate) as { id: string } | undefined;
    if (existing) {
      await db.prepare(`UPDATE vehicles SET type=?, capacity=?, brand=?, model=?, year=?, driver_name=?, driver_phone=?, status_code=?, notes=?, updated_at=? WHERE id=?`)
        .run(normalized.type, normalized.capacity, normalized.brand, normalized.model, normalized.year, normalized.driver_name, normalized.driver_phone, normalized.status_code, normalized.notes, now, existing.id);
      return { id: existing.id, mode: "updated" as const };
    }
    const id = uuidv4();
    await db.prepare(`INSERT INTO vehicles (id, plate, type, capacity, brand, model, year, driver_name, driver_phone, status_code, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, normalized.plate, normalized.type, normalized.capacity, normalized.brand, normalized.model, normalized.year, normalized.driver_name, normalized.driver_phone, normalized.status_code, normalized.notes, userId, now, now);
    return { id, mode: "inserted" as const };
  }

  if (module === "drivers") {
    const existing = await db.prepare("SELECT id FROM drivers WHERE name = ? AND COALESCE(phone, '') = COALESCE(?, '') LIMIT 1").get(normalized.name, normalized.phone) as { id: string } | undefined;
    if (existing) {
      await db.prepare(`UPDATE drivers SET email=?, tc_no=?, license_number=?, license_class=?, license_expiry=?, src_expiry=?, psiko_expiry=?, health_expiry=?, notes=?, status=?, updated_at=? WHERE id=?`)
        .run(normalized.email, normalized.tc_no, normalized.license_number, normalized.license_class, normalized.license_expiry, normalized.src_expiry, normalized.psiko_expiry, normalized.health_expiry, normalized.notes, normalized.status, now, existing.id);
      return { id: existing.id, mode: "updated" as const };
    }
    const id = uuidv4();
    await db.prepare(`INSERT INTO drivers (id, name, phone, email, tc_no, license_number, license_class, license_expiry, src_expiry, psiko_expiry, health_expiry, notes, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, normalized.name, normalized.phone, normalized.email, normalized.tc_no, normalized.license_number, normalized.license_class, normalized.license_expiry, normalized.src_expiry, normalized.psiko_expiry, normalized.health_expiry, normalized.notes, normalized.status, userId, now, now);
    return { id, mode: "inserted" as const };
  }

  if (module === "suppliers") {
    const companyId = await findCompanyId(normalized.company_name);
    if (companyId) assertCompanyAllowed(companyId);
    const existing = await db.prepare("SELECT id FROM suppliers WHERE title = ? LIMIT 1").get(normalized.title) as { id: string } | undefined;
    const supplierId = existing?.id ?? uuidv4();
    if (existing) {
      await db.prepare(`UPDATE suppliers SET contact_name=?, phone=?, email=?, tax_id=?, tax_office=?, notes=?, updated_at=? WHERE id=?`)
        .run(normalized.contact_name, normalized.phone, normalized.email, normalized.tax_id, normalized.tax_office, normalized.notes, now, supplierId);
    } else {
      await db.prepare(`INSERT INTO suppliers (id, title, contact_name, phone, email, tax_id, tax_office, notes, is_active, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
        .run(supplierId, normalized.title, normalized.contact_name, normalized.phone, normalized.email, normalized.tax_id, normalized.tax_office, normalized.notes, userId, now, now);
    }
    if (companyId) {
      await db.prepare(`INSERT INTO company_suppliers (id, company_id, supplier_id, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?, ?) ON DUPLICATE KEY UPDATE status='active', updated_at=VALUES(updated_at)`)
        .run(uuidv4(), companyId, supplierId, userId, now, now);
    }
    return { id: supplierId, mode: existing ? "updated" as const : "inserted" as const };
  }

  if (module === "passengers") {
    const companyId = await findCompanyId(normalized.company_name);
    assertCompanyAllowed(companyId);
    const geo = await geocodePickupAddress(normalized.pickup_address);
    const existing = await db.prepare("SELECT id FROM passengers WHERE full_name = ? AND COALESCE(phone, '') = COALESCE(?, '') LIMIT 1").get(normalized.full_name, normalized.phone) as { id: string } | undefined;
    if (existing) {
      await db.prepare(`UPDATE passengers SET company_id=?, email=?, id_number=?, type=?, pickup_address=?, pickup_lat=COALESCE(?, pickup_lat), pickup_lng=COALESCE(?, pickup_lng), dropoff_address=?, notes=?, status=?, updated_at=? WHERE id=?`)
        .run(companyId, normalized.email, normalized.id_number, normalized.type, normalized.pickup_address, geo?.lat ?? null, geo?.lng ?? null, normalized.dropoff_address, normalized.notes, normalized.status, now, existing.id);
      return { id: existing.id, mode: "updated" as const };
    }
    const id = uuidv4();
    await db.prepare(`INSERT INTO passengers (id, company_id, full_name, phone, email, id_number, type, pickup_address, pickup_lat, pickup_lng, dropoff_address, notes, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, companyId, normalized.full_name, normalized.phone, normalized.email, normalized.id_number, normalized.type, normalized.pickup_address, geo?.lat ?? null, geo?.lng ?? null, normalized.dropoff_address, normalized.notes, normalized.status, userId, now, now);
    return { id, mode: "inserted" as const };
  }

  const companyId = await findCompanyId(normalized.company_name);
  assertCompanyAllowed(companyId);
  const supplierId = await findSupplierId(normalized.supplier_name);
  const vehicleId = await findOrBindVehicleId(normalized.plate, supplierId, userId);
  const existing = await db.prepare("SELECT id FROM routes WHERE name = ? AND ((company_id = ?) OR (company_id IS NULL AND ? IS NULL)) LIMIT 1").get(normalized.name, companyId, companyId) as { id: string } | undefined;
  const stopsJson = normalized.stops_json ? JSON.stringify(normalized.stops_json) : null;
  if (existing) {
    await db.prepare(`UPDATE routes SET code=?, company_id=?, supplier_id=NULL, direction=?, capacity=?, schedule_mode=?, shift_name=?, morning_departure=?, morning_arrival=?, evening_departure=?, evening_arrival=?, stops_json=?, vehicle_id=?, vehicle_assignment_status=?, notes=?, updated_at=? WHERE id=?`)
      .run(normalized.code, companyId, normalized.direction, normalized.capacity ?? null, normalized.schedule_mode, normalized.shift_name, normalized.morning_departure, normalized.morning_arrival, normalized.evening_departure, normalized.evening_arrival, stopsJson, vehicleId, normalized.vehicle_assignment_status, normalized.notes, now, existing.id);
    if (normalized.price && companyId && (normalized.plate || vehicleId)) await insertRoutePriceIfMissing({ companyId, routeId: existing.id, vehicleId, plate: normalized.plate, price: normalized.price, validFrom: normalized.valid_from || now.slice(0, 10), validTo: normalized.valid_to || null, userId });
    return { id: existing.id, mode: "updated" as const };
  }
  const id = uuidv4();
  await db.prepare(`INSERT INTO routes (id, name, code, company_id, supplier_id, direction, capacity, schedule_mode, shift_name, morning_departure, morning_arrival, evening_departure, evening_arrival, stops_json, vehicle_id, vehicle_assignment_status, is_active, notes, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
    .run(id, normalized.name, normalized.code, companyId, null, normalized.direction, normalized.capacity ?? null, normalized.schedule_mode, normalized.shift_name, normalized.morning_departure, normalized.morning_arrival, normalized.evening_departure, normalized.evening_arrival, stopsJson, vehicleId, normalized.vehicle_assignment_status, normalized.notes, userId, now, now);
  if (normalized.price && companyId && (normalized.plate || vehicleId)) await insertRoutePriceIfMissing({ companyId, routeId: id, vehicleId, plate: normalized.plate, price: normalized.price, validFrom: normalized.valid_from || now.slice(0, 10), validTo: normalized.valid_to || null, userId });
  return { id, mode: "inserted" as const };
}

export async function executeImportJob(jobId: string, userId: string, allowedCompanies: string[] | null = null) {
  const db = getDb();
  const job = await db.prepare("SELECT * FROM import_jobs WHERE id = ?").get(jobId) as { id: string; module: ImportModule; error_rows: number } | undefined;
  if (!job) throw new Error("Import job bulunamadı");
  if (job.error_rows > 0) throw new Error("Hatalı satırlar düzeltilmeden import çalıştırılamaz");

  const rows = await db.prepare("SELECT * FROM import_job_rows WHERE job_id = ? ORDER BY row_no ASC").all(jobId) as Array<{ id: string; normalized_json: string; status: string }>;
  let inserted = 0, updated = 0, skipped = 0, errors = 0;
  const now = nowIso();

  for (const row of rows) {
    if (row.status === "error") { skipped++; continue; }
    try {
      const normalized = JSON.parse(row.normalized_json || "{}");
      const result = await executeRow(job.module, normalized, userId, allowedCompanies);
      if (result.mode === "inserted") inserted++;
      else updated++;
      await db.prepare("UPDATE import_job_rows SET status=?, target_id=?, updated_at=? WHERE id=?").run(result.mode === "inserted" ? "executed_inserted" : "executed_updated", result.id, now, row.id);
    } catch (error) {
      errors++;
      await db.prepare("UPDATE import_job_rows SET status='error', errors_json=?, updated_at=? WHERE id=?").run(JSON.stringify([error instanceof Error ? error.message : "Satır işlenemedi"]), now, row.id);
    }
  }

  await db.prepare(`UPDATE import_jobs SET status=?, inserted_rows=?, updated_rows=?, skipped_rows=?, error_rows=?, approved_by=?, executed_at=?, updated_at=? WHERE id=?`)
    .run(errors > 0 ? "partial" : "completed", inserted, updated, skipped, errors, userId, now, now, jobId);

  return { inserted, updated, skipped, errors };
}

export async function rollbackImportJob(jobId: string, userId: string) {
  const db = getDb();
  const job = await db.prepare("SELECT * FROM import_jobs WHERE id = ?").get(jobId) as { id: string; module: ImportModule; status: string } | undefined;
  if (!job) throw new Error("Import job bulunamadı");
  if (job.status !== "completed" && job.status !== "partial") throw new Error("Sadece tamamlanmış import işleri geri alınabilir");

  const tableByModule: Record<ImportModule, string> = {
    companies: "companies",
    vehicles: "vehicles",
    drivers: "drivers",
    passengers: "passengers",
    routes: "routes",
    suppliers: "suppliers",
  };
  const table = tableByModule[job.module];
  const rows = await db.prepare("SELECT id, target_id, status FROM import_job_rows WHERE job_id = ? AND target_id IS NOT NULL ORDER BY row_no DESC").all(jobId) as Array<{ id: string; target_id: string; status: string }>;
  const now = nowIso();
  let rolledBack = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    if (row.status !== "executed_inserted") {
      skipped++;
      await db.prepare("UPDATE import_job_rows SET status='rollback_skipped', updated_at=? WHERE id=?").run(now, row.id);
      continue;
    }
    try {
      const result = await db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.target_id);
      if (result.affectedRows > 0) rolledBack++;
      else skipped++;
      await db.prepare("UPDATE import_job_rows SET status='rolled_back', updated_at=? WHERE id=?").run(now, row.id);
    } catch (error) {
      errors++;
      await db.prepare("UPDATE import_job_rows SET status='rollback_error', errors_json=?, updated_at=? WHERE id=?").run(JSON.stringify([error instanceof Error ? error.message : "Geri alma başarısız"]), now, row.id);
    }
  }

  await db.prepare("UPDATE import_jobs SET status=?, skipped_rows=skipped_rows+?, error_rows=?, approved_by=?, updated_at=? WHERE id=?")
    .run(errors > 0 ? "rollback_partial" : "rolled_back", skipped, errors, userId, now, jobId);

  return { rolledBack, skipped, errors };
}
