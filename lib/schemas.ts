import { z } from "zod";

// ─── Shared primitives ────────────────────────────────────────────────
const optStr = z.string().max(5000).optional().nullable();
const shortStr = (max = 200) => z.string().min(1).max(max);

// ─── Companies ────────────────────────────────────────────────────────
export const companyCreateSchema = z.object({
  name: shortStr(200),
  notes: z.string().max(1000).optional().nullable(),
});

export const companyUpdateSchema = z.object({
  name: shortStr(200),
  notes: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().optional(),
  responsible_id: z.string().optional().nullable(),
  sort_mode: z.enum(["manual", "auto"]).optional(),
  // Faza 4: genişletilmiş firma alanları
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().max(150).optional().nullable(),
  address: z.string().max(2000).optional().nullable(),
  tax_id: z.string().max(20).optional().nullable(),
  tax_office: z.string().max(100).optional().nullable(),
  contract_start: z.string().max(10).optional().nullable(),
  contract_end: z.string().max(10).optional().nullable(),
  sector: z.string().max(100).optional().nullable(),
  website: z.string().max(255).optional().nullable(),
});

// ─── Company vehicles ─────────────────────────────────────────────────
export const companyVehicleCreateSchema = z.object({
  plate: shortStr(20),
  driver_name: z.string().max(100).optional().nullable(),
  route_name: z.string().max(100).optional().nullable(),
  route_id: z.string().max(36).optional().nullable(),
  phone_number: z.string().max(20).optional().nullable(),
  sort_order: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  is_temporary: z.boolean().optional(),
});

export const companyVehicleUpdateSchema = companyVehicleCreateSchema;

// ─── Vehicles ─────────────────────────────────────────────────────────
export const vehicleCreateSchema = z.object({
  plate: shortStr(20),
  supplier_id: z.string().max(36).optional().nullable(),
  type: z.string().max(50).optional().nullable(),
  capacity: z.number().int().min(0).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  year: z.number().int().min(1900).max(2100).optional().nullable(),
  driver_id: z.string().max(36).optional().nullable(),
  driver_name: z.string().max(100).optional().nullable(),
  driver_phone: z.string().max(20).optional().nullable(),
  route_name: z.string().max(255).optional().nullable(),
  status_code: z.string().max(50).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  ruhsat_sahibi_id: z.string().max(36).optional().nullable(),
});

export const vehicleUpdateSchema = vehicleCreateSchema.partial();

// ─── Route suppliers / prices ────────────────────────────────────────
export const supplierCreateSchema = z.object({
  title: shortStr(255),
  contact_name: z.string().max(150).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().max(150).optional().nullable().or(z.literal("")),
  tax_id: z.string().max(30).optional().nullable(),
  tax_office: z.string().max(150).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().optional(),
  company_ids: z.array(z.string().max(36)).optional(),
});

export const supplierUpdateSchema = supplierCreateSchema.partial();

export const supplierVehicleCreateSchema = vehicleCreateSchema.extend({
  plate: shortStr(20),
});

export const routePriceCreateSchema = z.object({
  company_id: z.string().min(1).max(36),
  route_id: z.string().min(1).max(36),
  supplier_id: z.string().max(36).optional().nullable(),
  vehicle_id: z.string().max(36).optional().nullable(),
  plate: z.string().max(50).optional().nullable(),
  price_amount: z.coerce.number().positive(),
  currency: z.string().min(3).max(3).default("TRY"),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valid_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const routePriceBulkUpdateSchema = z.object({
  ids: z.array(z.string().min(1).max(36)).min(1),
  mode: z.enum(["percent", "amount"]),
  value: z.coerce.number(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const routePriceRequestCreateSchema = routePriceCreateSchema.extend({
  reason: z.string().max(2000).optional().nullable(),
});

export const routePriceRequestDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  decision_note: z.string().max(2000).optional().nullable(),
});

export const routePriceAuthorityUpdateSchema = z.object({
  user_id: z.string().min(1).max(36),
  can_request: z.boolean(),
  can_approve: z.boolean(),
});

// ─── Departments ──────────────────────────────────────────────────────
export const departmentSchema = z.object({
  name: shortStr(100),
});

// ─── Users ────────────────────────────────────────────────────────────
const roleEnum = z.enum(["personel", "yetkili", "yonetici", "admin"]);

export const userCreateSchema = z.object({
  username: z.string().min(3, "En az 3 karakter").max(50),
  password: z.string().min(6, "En az 6 karakter").max(100),
  full_name: shortStr(100),
  role: roleEnum,
  department_id: z.string().optional().nullable(),
  allowed_pages: z.array(z.string()).optional().nullable(),
  allowed_companies: z.array(z.string()).optional().nullable(),
  whatsapp_phone: z.string().max(20).regex(/^\d*$/, "Sadece rakam giriniz").optional().nullable(),
});

export const userUpdateSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  role: roleEnum.optional(),
  department_id: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  password: z.string().min(6).max(100).optional(),
  allowed_pages: z.array(z.string()).optional().nullable(),
  allowed_companies: z.array(z.string()).optional().nullable(),
  whatsapp_phone: z.string().max(20).regex(/^\d*$/, "Sadece rakam giriniz").optional().nullable(),
});

// ─── Tickets ──────────────────────────────────────────────────────────
export const ticketCreateSchema = z.object({
  title: shortStr(200),
  description: optStr,
  category_id: z.string().optional().nullable(),
  priority_code: z.string().max(50).optional().nullable(),
  tag_ids: z.array(z.string()).optional(),
  assigned_to: z.string().optional().nullable(),
  department_id: z.string().optional().nullable(),
});

export const ticketUpdateSchema = z.object({
  status_code: z.string().max(50).optional(),
  priority_code: z.string().max(50).optional().nullable(),
  category_id: z.string().optional().nullable(),
  assigned_to: z.string().optional().nullable(),
  tag_ids: z.array(z.string()).optional(),
});

export const ticketActionCreateSchema = z.object({
  title: shortStr(200),
  is_done: z.boolean().optional(),
});

export const ticketActionUpdateSchema = z.object({
  is_done: z.boolean(),
  title: z.string().min(1).max(200).optional(),
});

// ─── Comments ─────────────────────────────────────────────────────────
export const commentSchema = z.object({
  comment: z.string().min(1, "Yorum zorunlu").max(5000),
});

// ─── Todos ────────────────────────────────────────────────────────────
export const todoCreateSchema = z.object({
  title: shortStr(200),
  description: optStr,
  priority_code: z.string().max(50).optional().nullable(),
  assigned_to: z.string().optional().nullable(),
  department_id: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  bulk_targets: z
    .object({
      target_type: z.string().min(1),
      target_value: z.string().min(1),
    })
    .optional()
    .nullable(),
});

export const todoUpdateSchema = z.object({
  status_code: z.string().max(50).optional(),
  assigned_to: z.string().optional().nullable(),
  priority_code: z.string().max(50).optional().nullable(),
  due_date: z.string().optional().nullable(),
  description: optStr,
});

// ─── Worklogs ─────────────────────────────────────────────────────────
export const worklogCreateSchema = z.object({
  work_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD formatı bekleniyor"),
  summary: optStr,
});

export const worklogUpdateSchema = z.object({
  summary: optStr,
  status_code: z.string().max(50).optional(),
});

export const worklogItemCreateSchema = z.object({
  title: shortStr(200),
  category_id: z.string().optional().nullable(),
  duration_minutes: z.number().int().min(0).optional().nullable(),
  tag_ids: z.array(z.string()).optional(),
  linked_todo_id: z.string().optional().nullable(),
  linked_ticket_id: z.string().optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

export const worklogItemUpdateSchema = z.object({
  title: shortStr(200),
});

// ─── Trips ────────────────────────────────────────────────────────────
export const tripCreateSchema = z.object({
  trip_date: z.string().min(1, "Tarih zorunlu"),
  route_id: z.string().optional().nullable(),
  vehicle_id: z.string().optional().nullable(),
  direction: z.enum(["morning", "evening", "both"]).optional(),
  planned_departure: z.string().optional().nullable(),
  planned_arrival: z.string().optional().nullable(),
  passenger_count: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export const tripUpdateSchema = z.object({
  vehicle_id: z.string().optional().nullable(),
  direction: z.string().max(20).optional(),
  actual_departure: z.string().optional().nullable(),
  actual_arrival: z.string().optional().nullable(),
  passenger_count: z.number().int().min(0).optional(),
  status_code: z.string().max(50).optional(),
  delay_minutes: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

// ─── Arrivals ─────────────────────────────────────────────────────────
export const arrivalCreateSchema = z.object({
  vehicle_id: z.string().min(1, "vehicle_id zorunlu"),
  company_id: z.string().min(1, "company_id zorunlu"),
  date: z.string().min(1, "date zorunlu"),
  shift: z.string().max(100).default("sabah"),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const arrivalNoteSchema = z.object({
  note: z.string().max(500).nullable(),
});

// ─── Entry Controls ───────────────────────────────────────────────────
export const entryControlCreateSchema = z.object({
  control_date: z.string().min(1, "Tarih zorunlu"),
  route_id: z.string().min(1, "route_id zorunlu"),
  trip_id: z.string().optional().nullable(),
  planned_time: z.string().min(1, "Planlanan saat zorunlu"),
  actual_time: z.string().optional().nullable(),
  passenger_expected: z.number().int().min(0).optional(),
  passenger_actual: z.number().int().min(0).optional(),
  status_code: z.string().max(50).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const entryControlUpdateSchema = z.object({
  actual_time: z.string().optional().nullable(),
  planned_time: z.string().optional().nullable(),
  passenger_expected: z.number().int().min(0).optional(),
  passenger_actual: z.number().int().min(0).optional(),
  status_code: z.string().max(50).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

// ─── Inspections ──────────────────────────────────────────────────────
export const inspectionCreateSchema = z.object({
  vehicle_id: z.string().optional().nullable(),
  company_vehicle_id: z.string().optional().nullable(),
  company_vehicle_plate: z.string().max(20).optional().nullable(),
  company_id: z.string().optional().nullable(),
  inspection_date: z.string().min(1, "Tarih zorunlu"),
  type: z.string().max(50).optional().nullable(),
  result: z.string().max(50).optional().nullable(),
  checklist: z
    .array(
      z.object({
        label: z.string().max(255).optional(),
        ok: z.boolean().nullable(),
        note: z.string().max(500).optional(),
      })
    )
    .optional(),
  notes: z.string().max(2000).optional().nullable(),
});

// ─── Driver Evaluations ───────────────────────────────────────────────
const scoreField = z.number().min(1, "Min 1").max(5, "Max 5");

export const driverEvaluationCreateSchema = z.object({
  evaluation_date: z.string().min(1, "Tarih zorunlu"),
  driver_name: shortStr(100),
  plate: shortStr(20),
  vehicle_info: z.string().max(200).optional().nullable(),
  route_text: z.string().max(200).optional().nullable(),
  company_id: z.string().optional().nullable(),
  score_punctuality: scoreField,
  score_driving: scoreField,
  score_communication: scoreField,
  score_cleanliness: scoreField,
  score_route_compliance: scoreField,
  score_appearance: scoreField,
  notes: z.string().max(2000).optional().nullable(),
});

// ─── Driver Records ───────────────────────────────────────────────────
export const driverRecordCreateSchema = z.object({
  driver_name: shortStr(100),
  vehicle_id: z.string().optional().nullable(),
  vehicle_plate: z.string().max(20).optional().nullable(),
  incident_date: z.string().min(1, "Tarih zorunlu"),
  category: z.string().max(100).optional().nullable(),
  severity: z.number().int().min(1, "Min 1").max(4, "Max 4"),
  description: z.string().min(1, "Açıklama zorunlu").max(2000),
  action_taken: z.string().max(2000).optional().nullable(),
});

// ─── Routes ───────────────────────────────────────────────────────────
export const routeCreateSchema = z.object({
  name: shortStr(200),
  code: z.string().max(50).optional().nullable(),
  direction: z.enum(["morning", "evening", "both"]).optional(),
  capacity: z.number().int().min(0).max(1000).optional().nullable(),
  schedule_mode: z.enum(["fixed", "shift"]).optional().nullable(),
  shift_name: z.string().max(100).optional().nullable(),
  morning_departure: z.string().optional().nullable(),
  morning_arrival: z.string().optional().nullable(),
  evening_departure: z.string().optional().nullable(),
  evening_arrival: z.string().optional().nullable(),
  stops_json: z.unknown().optional().nullable(),
  vehicle_id: z.string().optional().nullable(),
  supplier_id: z.string().optional().nullable(),
  vehicle_assignment_status: z.enum(["fixed", "temporary", "searching"]).optional(),
  company_id: z.string().optional().nullable(),
  driver_name: z.string().max(255).optional().nullable(),
  driver_phone: z.string().max(50).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const routeUpdateSchema = routeCreateSchema
  .omit({ name: true })
  .extend({ name: z.string().min(1).max(200).optional() });

// ─── Config: Category ─────────────────────────────────────────────────
export const categorySchema = z.object({
  type: shortStr(50),
  name: shortStr(100),
  color: z.string().max(20).optional().nullable(),
});

// ─── Config: Priority ─────────────────────────────────────────────────
export const priorityCreateSchema = z.object({
  type: shortStr(50),
  code: shortStr(50),
  label: shortStr(100),
  sort_order: z.number().int().optional(),
});

// ─── Config: Tag ──────────────────────────────────────────────────────
export const tagSchema = z.object({
  type: shortStr(50),
  name: shortStr(100),
  color: z.string().max(20).optional().nullable(),
});

// ─── Config: SLA ──────────────────────────────────────────────────────
export const slaCreateSchema = z.object({
  priority_code: shortStr(50),
  due_minutes: z.number().int().min(1, "Süre en az 1 dakika olmalı"),
});

// ─── Config: Template ─────────────────────────────────────────────────
export const templateCreateSchema = z.object({
  title: shortStr(200),
  description: optStr,
  role_target: z.string().max(50).optional().nullable(),
  department_id: z.string().optional().nullable(),
  apply_now: z.boolean().optional(),
});

// ─── Notes ────────────────────────────────────────────────────────────
export const noteCreateSchema = z.object({
  title:   z.string().max(255).optional().default(""),
  content: z.string().max(20000).optional().default(""),
});

export const noteUpdateSchema = z.object({
  title:   z.string().max(255).optional(),
  content: z.string().max(20000).optional(),
});

// ─── Warnings ─────────────────────────────────────────────────────────
export const warningCreateSchema = z.object({
  plate:       shortStr(20),
  driver_name: shortStr(255),
  reason:      z.string().min(1, "Uyarı nedeni zorunlu").max(5000),
  deadline:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD formatı bekleniyor").optional().nullable(),
});

export const warningUpdateSchema = z.object({
  is_done: z.boolean(),
});

// ─── Notifications ────────────────────────────────────────────────────
export const notificationCreateSchema = z.object({
  user_id: z.string().optional().nullable(),
  title:   shortStr(255),
  body:    z.string().max(2000).optional().nullable(),
  link:    z.string().max(255).optional().nullable(),
});

// ─── Todos (reminder_daily_max) ───────────────────────────────────────
export const todoReminderMaxSchema = z.object({
  reminder_daily_max: z.number().int().min(1).max(24).optional(),
});

// ─── Suggestions ──────────────────────────────────────────────────────
export const suggestionCreateSchema = z.object({
  title:       shortStr(200),
  description: optStr,
  category:    z.enum(["oneri", "talep", "sikayet", "istek"]),
  kaynak:      z.string().max(50).optional().nullable(),
});

export const suggestionUpdateSchema = z.object({
  status:      z.enum(["open", "closed"]).optional(),
  assigned_to: z.string().optional().nullable(),
  title:       z.string().min(1).max(200).optional(),
  description: optStr,
  category:    z.enum(["oneri", "talep", "sikayet", "istek"]).optional(),
});

// ─── Config: Statuses ─────────────────────────────────────────────────
export const statusUpdateSchema = z.object({
  type: z.enum(["ticket", "worklog"]),
  code: shortStr(50),
  label: z.string().max(100).optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
  is_terminal: z.boolean().optional(),
});

// ─── Finans: Hesap Planı ─────────────────────────────────────────────
export const finansHesapPlaniSchema = z.object({
  kod: shortStr(20),
  ad: shortStr(200),
  ust_hesap_id: z.string().optional().nullable(),
  tip: z.enum(["varlik", "borc", "ozkaynak", "gelir", "gider"]),
});

// ─── Finans: Kategori ─────────────────────────────────────────────────
export const finansKategoriSchema = z.object({
  ad: shortStr(200),
  tip: z.enum(["gelir", "gider"]),
  hesap_id: z.string().optional().nullable(),
});

// ─── Finans: Masraf Merkezi ───────────────────────────────────────────
export const finansMasrafMerkeziSchema = z.object({
  ad: shortStr(200),
  company_id: z.string().optional().nullable(),
});

// ─── Finans: Proje ─────────────────────────────────────────────────────
export const finansProjeSchema = z.object({
  ad: shortStr(200),
  kod: z.string().max(50).optional().nullable(),
  company_id: z.string().optional().nullable(),
  baslangic_tarihi: z.string().optional().nullable(),
  bitis_tarihi: z.string().optional().nullable(),
  durum: z.enum(["planlanan", "aktif", "tamamlandi", "iptal"]).optional(),
});

// ─── Finans: Kasa/Banka Hesabı ─────────────────────────────────────────
export const finansKasaBankaSchema = z.object({
  ad: shortStr(200),
  tip: z.enum(["kasa", "banka", "kredi_karti", "pos"]),
  banka_adi: z.string().max(200).optional().nullable(),
  iban: z.string().max(50).optional().nullable(),
  para_birimi_kod: z.string().max(10).optional(),
  acilis_bakiyesi: z.number().optional(),
  company_id: z.string().optional().nullable(),
});

// ─── Finans: Vergi Kodu ─────────────────────────────────────────────────
export const finansVergiKoduSchema = z.object({
  ad: shortStr(100),
  oran: z.number().min(0).max(100),
  gecerlilik_baslangic: z.string().min(1),
  gecerlilik_bitis: z.string().optional().nullable(),
});

// ─── Finans: Ödeme Yöntemi ──────────────────────────────────────────────
export const finansOdemeYontemiSchema = z.object({
  ad: shortStr(100),
});

// ─── Finans: Gelir-Gider ────────────────────────────────────────────────
export const finansGelirGiderSchema = z.object({
  tur: z.enum(["gelir", "gider"]),
  belge_tarihi: z.string().min(1),
  tahakkuk_tarihi: z.string().optional().nullable(),
  vade_tarihi: z.string().optional().nullable(),
  cari_tip: z.enum(["musteri", "tedarikci"]).optional().nullable(),
  cari_id: z.string().optional().nullable(),
  kategori_id: z.string().optional().nullable(),
  net_tutar: z.number().min(0),
  vergi_tutari: z.number().min(0).optional(),
  brut_tutar: z.number().min(0),
  para_birimi_kod: z.string().max(10).optional(),
  kur: z.number().optional(),
  company_id: z.string().optional().nullable(),
  department_id: z.string().optional().nullable(),
  proje_id: z.string().optional().nullable(),
  masraf_merkezi_id: z.string().optional().nullable(),
  aciklama: z.string().max(2000).optional().nullable(),
  etiketler: z.array(z.string()).optional().nullable(),
});

// ─── Finans: Masraf Talebi ──────────────────────────────────────────────
export const finansMasrafTalebiSchema = z.object({
  tarih: z.string().min(1),
  baslik: shortStr(300),
  aciklama: z.string().max(2000).optional().nullable(),
  tahmini_tutar: z.number().min(0),
  para_birimi_kod: z.string().max(10).optional(),
  kategori_id: z.string().optional().nullable(),
  department_id: z.string().optional().nullable(),
  proje_id: z.string().optional().nullable(),
  masraf_merkezi_id: z.string().optional().nullable(),
});
