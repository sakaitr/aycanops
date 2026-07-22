import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";

/**
 * GET /api/search?q=...
 * Global search across vehicles, drivers, companies, routes, passengers.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json({ ok: true, data: [] });

    const db = getDb();
    const like = `%${q}%`;
    const results: { type: string; id: string; label: string; sub?: string; href: string }[] = [];

    // Vehicles (plaka)
    const vehicles = await db.prepare(
      `SELECT id, plate, brand, model FROM vehicles WHERE plate LIKE ? LIMIT 8`
    ).all(like) as any[];
    for (const v of vehicles) {
      results.push({
        type: "Araç",
        id: v.id,
        label: v.plate,
        sub: [v.brand, v.model].filter(Boolean).join(" ") || undefined,
        href: "/araclar",
      });
    }

    // Passengers / drivers
    const passengers = await db.prepare(
      `SELECT id, full_name, phone, type FROM passengers WHERE full_name LIKE ? OR phone LIKE ? LIMIT 6`
    ).all(like, like) as any[];
    for (const p of passengers) {
      results.push({
        type: p.type === "personel" ? "Personel" : p.type === "surucu" ? "Sürücü" : "Yolcu",
        id: p.id,
        label: p.full_name,
        sub: p.phone || undefined,
        href: "/yolcular",
      });
    }

    // Companies
    if (isAtLeast(user.role, "yetkili")) {
      const companies = await db.prepare(
        `SELECT id, name FROM companies WHERE name LIKE ? LIMIT 5`
      ).all(like) as any[];
      for (const c of companies) {
        results.push({ type: "Firma", id: c.id, label: c.name, href: "/firmalar" });
      }
    }

    // Routes
    const routes = await db.prepare(
      `SELECT r.id, r.name, c.name AS company_name FROM routes r LEFT JOIN companies c ON c.id = r.company_id WHERE r.name LIKE ? LIMIT 5`
    ).all(like) as any[];
    for (const r of routes) {
      results.push({
        type: "Güzergah",
        id: r.id,
        label: r.name,
        sub: r.company_name || undefined,
        href: "/guzergahlar",
      });
    }

    // Todos / tasks
    const todos = await db.prepare(
      `SELECT id, title, status_code FROM todos WHERE title LIKE ? LIMIT 5`
    ).all(like) as any[];
    for (const t of todos) {
      results.push({ type: "Görev", id: t.id, label: t.title, sub: t.status_code || undefined, href: "/gorevler" });
    }

    return NextResponse.json({ ok: true, data: results.slice(0, 20) });
  } catch (e) {
    console.error("[API search]", e);
    return NextResponse.json({ ok: true, data: [] });
  }
}
