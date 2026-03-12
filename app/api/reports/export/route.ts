import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAtLeast } from "@/lib/permissions";
import { generateCSV } from "@/lib/csv";
import ExcelJS from "exceljs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Yetkisiz erişim" },
        { status: 401 }
      );
    }

    if (!isAtLeast(user.role, "yonetici")) {
      return NextResponse.json(
        { ok: false, error: "Yetersiz yetki" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type) {
      return NextResponse.json(
        { ok: false, error: "Rapor tipi gerekli (worklog, todo, ticket, giris-kontrol)" },
        { status: 400 }
      );
    }

    const db = getDb();
    let rows: unknown[] = [];
    let filename = "export.csv";

    if (type === "worklog") {
      rows = await db
        .prepare(
          `SELECT 
             worklogs.work_date,
             users.full_name as user_name,
             worklogs.status_code,
             worklogs.summary
           FROM worklogs
           JOIN users ON users.id = worklogs.user_id
           ORDER BY worklogs.work_date DESC`
        )
        .all();
      filename = "worklog_export.csv";
    } else if (type === "todo") {
      rows = await db
        .prepare(
          `SELECT 
             todos.title,
             todos.status_code,
             todos.priority_code,
             users.full_name as assigned_name,
             todos.due_date,
             todos.created_at
           FROM todos
           LEFT JOIN users ON users.id = todos.assigned_to
           ORDER BY todos.created_at DESC`
        )
        .all();
      filename = "todo_export.csv";
    } else if (type === "ticket") {
      rows = await db
        .prepare(
          `SELECT 
             tickets.ticket_no,
             tickets.title,
             tickets.status_code,
             tickets.priority_code,
             users.full_name as assigned_name,
             tickets.sla_due_at,
             tickets.created_at,
             tickets.closed_at
           FROM tickets
           LEFT JOIN users ON users.id = tickets.assigned_to
           ORDER BY tickets.created_at DESC`
        )
        .all();
      filename = "ticket_export.csv";
    } else if (type === "giris-kontrol") {
      const company_id = searchParams.get("company_id");
      const date_from = searchParams.get("date_from");
      const date_to = searchParams.get("date_to");

      const params: string[] = [];
      let where = "";
      if (company_id) { where += " AND va.company_id = ?"; params.push(company_id); }
      if (date_from)  { where += " AND va.arrival_date >= ?"; params.push(date_from); }
      if (date_to)    { where += " AND va.arrival_date <= ?"; params.push(date_to); }

      const gcRows = await db.prepare(`
        SELECT
          c.name                              AS "Firma",
          cv.plate                            AS "Plaka",
          COALESCE(cv.driver_name, '')        AS "Şöför",
          COALESCE(cv.notes, '')              AS "Notlar",
          va.arrival_date                     AS "Tarih",
          DATE_FORMAT(DATE_ADD(STR_TO_DATE(SUBSTRING(va.arrived_at, 1, 19), '%Y-%m-%dT%H:%i:%s'), INTERVAL 3 HOUR), '%H:%i') AS "Giriş Saati",
          u.full_name                         AS "Kaydeden",
          ROUND(COALESCE(va.latitude, 0), 6)  AS "Enlem",
          ROUND(COALESCE(va.longitude, 0), 6) AS "Boylam"
        FROM vehicle_arrivals va
        JOIN company_vehicles cv ON cv.id = va.vehicle_id
        JOIN companies c         ON c.id  = va.company_id
        LEFT JOIN users u        ON u.id  = va.recorded_by
        WHERE 1=1 ${where}
        ORDER BY va.arrived_at DESC
      `).all(...params) as Record<string, unknown>[];

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Giriş Kontrol");
      if (gcRows.length > 0) {
        ws.columns = Object.keys(gcRows[0]).map(key => ({ header: key, key })) as ExcelJS.Column[];
        gcRows.forEach(row => ws.addRow(row));
      }
      const buf = await wb.xlsx.writeBuffer();

      const companyRow = company_id
        ? (await db.prepare("SELECT name FROM companies WHERE id = ?").get(company_id) as any)
        : null;
      const safeName = (companyRow?.name || "tum_firmalar").replace(/[^a-zA-Z0-9_\-]/g, "_");
      const fileDate  = date_from || new Date().toISOString().split("T")[0];
      const xlsxFilename = `giris_kontrol_${safeName}_${fileDate}.xlsx`;

        return new NextResponse(buf as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${xlsxFilename}"`,
        },
      });
    } else {
      return NextResponse.json(
        { ok: false, error: "Geçersiz rapor tipi" },
        { status: 400 }
      );
    }

    const csv = generateCSV(rows as Record<string, unknown>[]);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { ok: false, error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}

