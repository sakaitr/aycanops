/**
 * VROOM istemcisi — self-hosted VRP çözücü.
 * VROOM kendi routing backend'inden (Valhalla) yol matrisini alır;
 * biz sadece problem tanımını gönderiyoruz.
 * Base URL: VROOM_URL env, yoksa sidecar container adı.
 */
import { routingFetch, RoutingError } from "./http";

export const VROOM_URL = process.env.VROOM_URL || "http://aycanops_vroom:3000";

/** Koordinatlar VROOM'da [lng, lat] sırasında. */
export interface VroomVehicle {
  id: number;
  /** Valhalla costing adı. vroom-express bu değeri routing backend'e geçirir. */
  profile?: string;
  start: [number, number];
  end: [number, number];
  capacity: [number];
  time_window?: [number, number];
  skills?: number[];
  description?: string;
}

export interface VroomJob {
  id: number;
  location: [number, number];
  amount: [number];
  skills?: number[];
  service?: number;
  description?: string;
}

export interface VroomStep {
  type: "start" | "job" | "end" | "break";
  id?: number;
  location?: [number, number];
  arrival: number;
  duration: number;
  distance: number;
}

export interface VroomRoute {
  vehicle: number;
  cost: number;
  duration: number;
  distance: number;
  geometry?: string; // encoded polyline precision 5 (options.g=true iken)
  steps: VroomStep[];
}

export interface VroomSolution {
  code: number;
  error?: string;
  routes: VroomRoute[];
  unassigned: Array<{ id: number; type: string; location: [number, number] }>;
  summary: {
    cost: number;
    unassigned: number;
    duration: number;
    distance: number;
    routes: number;
  };
}

export async function vroomSolve(
  vehicles: VroomVehicle[],
  jobs: VroomJob[],
  opts: { geometry?: boolean; timeoutMs?: number } = {},
): Promise<VroomSolution> {
  const body = {
    vehicles,
    jobs,
    options: { g: opts.geometry ?? true },
  };

  const data = await routingFetch<VroomSolution>(`${VROOM_URL}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: opts.timeoutMs ?? 60_000,
  });

  if (data.code !== 0) {
    throw new RoutingError(`VROOM hata kodu ${data.code}: ${data.error ?? "bilinmeyen"}`);
  }
  return data;
}

/** Servis ayakta mı (deploy doğrulama). */
export async function vroomHealth(): Promise<boolean> {
  try {
    await routingFetch(`${VROOM_URL}/health`, { timeoutMs: 5_000 });
    return true;
  } catch {
    return false;
  }
}
