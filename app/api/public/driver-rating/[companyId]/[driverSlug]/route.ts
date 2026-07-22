import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function slugToName(slug: string) {
  // We can't perfectly reverse a slug to a name, so we use a LIKE match
  // after replacing hyphens with spaces in the DB driver_name (lowercased).
  return slug.replace(/-/g, " ");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; driverSlug: string }> }
) {
  const { companyId, driverSlug } = await params;

  // Don't require auth — this is a public route
  const db = getDb();

  // Look up by company_id and match driver_name via slug comparison
  // We match driver names whose lowercase-slug version equals driverSlug
  const namePart = slugToName(driverSlug);

  const rows = await db.prepare(
    `SELECT de.*,
       c.name AS company_name,
       c.company_slug
     FROM driver_evaluations de
     LEFT JOIN companies c ON c.id = de.company_id
     WHERE de.company_id = ?
       AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
         REPLACE(REPLACE(TRIM(de.driver_name), 'ç','c'), 'ğ','g'), 'ı','i'), 'ö','o'), 'ş','s'), 'ü','u'),
         ' ', '-'), '  ', '-')) = LOWER(?)
     ORDER BY de.evaluation_date DESC`
  ).all(companyId, driverSlug);

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ ok: false, error: "Sürücü bulunamadı" }, { status: 404 });
  }

  const company = { id: companyId, name: (rows[0] as any).company_name };
  const driver = { name: (rows[0] as any).driver_name, plate: (rows[0] as any).plate };

  // Calculate averages
  const CRITERIA = ["score_punctuality", "score_driving", "score_communication", "score_cleanliness", "score_route_compliance", "score_appearance"];
  const avg = (field: string) => (rows as any[]).reduce((s, r) => s + (r[field] || 0), 0) / rows.length;
  const averages = Object.fromEntries(CRITERIA.map(k => [k, avg(k)]));
  const overall = Object.values(averages).reduce((s, v) => s + v, 0) / CRITERIA.length;

  return NextResponse.json({
    ok: true,
    company,
    driver,
    evaluations: rows,
    averages,
    overall,
    count: rows.length,
  });
}
