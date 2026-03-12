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
});

// ─── Company vehicles ─────────────────────────────────────────────────
export const companyVehicleCreateSchema = z.object({
  plate: shortStr(20),
  driver_name: z.string().max(100).optional().nullable(),
  route_id: z.string().max(36).optional().nullable(),
  sort_order: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const companyVehicleUpdateSchema = companyVehicleCreateSchema;

// ─── Vehicles ─────────────────────────────────────────────────────────
export const vehicleCreateSchema = z.object({
  plate: shortStr(20),
  type: z.string().max(50).optional().nullable(),
  capacity: z.number().int().min(0).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  year: z.number().int().min(1900).max(2100).optional().nullable(),
  driver_name: z.string().max(100).optional().nullable(),
  driver_phone: z.string().max(20).optional().nullable(),
  status_code: z.string().max(50).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const vehicleUpdateSchema = vehicleCreateSchema.partial();

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
});

export const userUpdateSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  role: roleEnum.optional(),
  department_id: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  password: z.string().min(6).max(100).optional(),
  allowed_pages: z.array(z.string()).optional().nullable(),
  allowed_companies: z.array(z.string()).optional().nullable(),
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
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
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
  inspection_date: z.string().min(1, "Tarih zorunlu"),
  type: z.string().max(50).optional().nullable(),
  result: z.string().max(50).optional().nullable(),
  checklist: z
    .array(
      z.object({
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
  morning_departure: z.string().optional().nullable(),
  morning_arrival: z.string().optional().nullable(),
  evening_departure: z.string().optional().nullable(),
  evening_arrival: z.string().optional().nullable(),
  stops_json: z.unknown().optional().nullable(),
  vehicle_id: z.string().optional().nullable(),
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

// ─── Config: Statuses ─────────────────────────────────────────────────
export const statusUpdateSchema = z.object({
  type: z.enum(["ticket", "worklog"]),
  code: shortStr(50),
  label: z.string().max(100).optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
  is_terminal: z.boolean().optional(),
});
