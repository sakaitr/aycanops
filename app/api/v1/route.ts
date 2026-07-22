import { NextResponse } from "next/server";

// GET /api/v1 — API bilgisi ve yetenekler
export async function GET() {
  return NextResponse.json({
    api: "Aycan OPS Public API",
    version: "1.0.0",
    endpoints: [
      { path: "/api/v1/vehicles", methods: ["GET"], description: "Araç listesi" },
      { path: "/api/v1/trips",    methods: ["GET"], description: "Sefer/Transfer listesi" },
      { path: "/api/v1/drivers",  methods: ["GET"], description: "Sürücü listesi" },
    ],
    auth: "Bearer token veya X-API-Key header",
    docs: "https://aycanops.agno.digital/api/v1",
  });
}
