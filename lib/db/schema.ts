import Dexie, { type Table } from 'dexie';

// ─── Entity Interfaces — mirrors MySQL schema ───────────────────────────────

export interface LocalVehicle {
  id: string;           // CHAR(36) UUID
  plate: string;
  type: string;
  capacity: number;
  brand?: string;
  model?: string;
  year?: number;
  driver_name?: string;
  driver_phone?: string;
  status_code: string;
  notes?: string;
  updated_at: string;   // ISO string — Last Write Wins
  _dirty?: 1;           // 1 = local change not yet synced
}

export interface LocalRoute {
  id: string;
  name: string;
  code?: string;
  direction: string;
  morning_departure?: string;
  morning_arrival?: string;
  evening_departure?: string;
  evening_arrival?: string;
  vehicle_id?: string;
  is_active: number;
  notes?: string;
  updated_at: string;
  _dirty?: 1;
}

export interface LocalTrip {
  id: string;
  trip_date: string;
  route_id: string;
  vehicle_id?: string;
  direction: string;
  status_code: string;
  passenger_count?: number;
  notes?: string;
  updated_at: string;
  _dirty?: 1;
}

export interface LocalCompany {
  id: string;
  name: string;
  is_active: number;
  phone?: string;
  updated_at: string;
  _dirty?: 1;
}

export interface LocalEntryControl {
  id: string;
  control_date: string;
  route_id: string;
  planned_count: number;
  actual_count: number;
  notes?: string;
  updated_at: string;
  _dirty?: 1;
}

export interface SyncQueueItem {
  id?: number;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body: string; // JSON.stringify'd
  timestamp: number;
  retries: number;
}

// ─── Dexie Database ─────────────────────────────────────────────────────────

class AycanDB extends Dexie {
  vehicles!: Table<LocalVehicle>;
  routes!: Table<LocalRoute>;
  trips!: Table<LocalTrip>;
  companies!: Table<LocalCompany>;
  entry_controls!: Table<LocalEntryControl>;
  sync_queue!: Table<SyncQueueItem>;

  constructor() {
    super('AycanOPS');

    this.version(1).stores({
      vehicles:      'id, plate, status_code, updated_at, _dirty',
      routes:        'id, name, code, is_active, updated_at, _dirty',
      trips:         'id, trip_date, route_id, vehicle_id, status_code, updated_at, _dirty',
      companies:     'id, name, is_active, updated_at, _dirty',
      entry_controls:'id, control_date, route_id, updated_at, _dirty',
      sync_queue:    '++id, endpoint, timestamp',
    });
  }
}

export const db = new AycanDB();
