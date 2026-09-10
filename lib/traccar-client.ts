/**
 * Traccar REST istemcisi — cihaz kaydı + geofence push.
 * Konum verisi Traccar'dan webhook ile GELİR (bkz.
 * app/api/integrations/traccar/webhook), bu istemci sadece dışa yazma için.
 *
 * Env: TRACCAR_URL (ör. http://aycanops_traccar:8082), TRACCAR_USER, TRACCAR_PASS.
 */
const TRACCAR_URL = process.env.TRACCAR_URL || "http://aycanops_traccar:8082";
const TRACCAR_USER = process.env.TRACCAR_USER || "";
const TRACCAR_PASS = process.env.TRACCAR_PASS || "";

function authHeader(): Record<string, string> {
  if (!TRACCAR_USER) return {};
  return { Authorization: "Basic " + Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString("base64") };
}

async function tc<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${TRACCAR_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeader(), ...(init.headers || {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Traccar ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return (res.status === 204 ? (undefined as T) : ((await res.json()) as T));
}

export interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  lastUpdate: string | null;
}

export interface TraccarGeofence {
  id: number;
  name: string;
  area: string; // WKT: "CIRCLE (lat lng, radiusMeters)" veya "POLYGON ((...))"
}

export const traccar = {
  isConfigured(): boolean {
    return !!TRACCAR_USER;
  },

  listDevices(): Promise<TraccarDevice[]> {
    return tc<TraccarDevice[]>("/api/devices");
  },

  createDevice(name: string, uniqueId: string): Promise<TraccarDevice> {
    return tc<TraccarDevice>("/api/devices", { method: "POST", body: JSON.stringify({ name, uniqueId }) });
  },

  listGeofences(): Promise<TraccarGeofence[]> {
    return tc<TraccarGeofence[]>("/api/geofences");
  },

  createCircleGeofence(name: string, lat: number, lng: number, radiusM: number): Promise<TraccarGeofence> {
    return tc<TraccarGeofence>("/api/geofences", {
      method: "POST",
      body: JSON.stringify({ name, area: `CIRCLE (${lat} ${lng}, ${radiusM})` }),
    });
  },

  deleteGeofence(id: number): Promise<void> {
    return tc<void>(`/api/geofences/${id}`, { method: "DELETE" });
  },

  /** Bir geofence'i tüm cihazlara bağla (permissions API). */
  linkGeofenceToDevice(deviceId: number, geofenceId: number): Promise<void> {
    return tc<void>("/api/permissions", { method: "POST", body: JSON.stringify({ deviceId, geofenceId }) });
  },
};

export { TRACCAR_URL };
