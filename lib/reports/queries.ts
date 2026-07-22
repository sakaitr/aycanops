import { getDb } from "@/lib/db";

export type ReportRow = Record<string, unknown>;

export interface ChartSeries { label: string; value: number; color?: string }
export interface ChartData { type: "bar" | "line" | "donut" | "radar"; title: string; series: ChartSeries[]; labels?: string[] }
export interface ReportResult { rows: ReportRow[]; charts: ChartData[]; totals?: Record<string, unknown>; sections?: { title: string; rows: ReportRow[]; charts: ChartData[] }[] }

function db() { return getDb(); }

function whereDates(dateFrom?: string | null, dateTo?: string | null, col = "DATE(created_at)"): { sql: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  if (dateFrom) { parts.push(`${col} >= ?`); params.push(dateFrom); }
  if (dateTo)   { parts.push(`${col} <= ?`); params.push(dateTo); }
  return { sql: parts.length ? " AND " + parts.join(" AND ") : "", params };
}

function whereCompanies(companyIds: string[], alias = "va.company_id"): { sql: string; params: string[] } {
  if (!companyIds.length) return { sql: "", params: [] };
  return { sql: ` AND ${alias} IN (${companyIds.map(() => "?").join(",")})`, params: companyIds };
}

function wherePlates(plates: string[], alias = "cv.plate"): { sql: string; params: string[] } {
  if (!plates.length) return { sql: "", params: [] };
  return { sql: ` AND ${alias} IN (${plates.map(() => "?").join(",")})`, params: plates };
}

// ─── Report 1: Araç Giriş Raporu ──────────────────────────────────────────────
export async function r01_aracGiris(companyIds: string[], dateFrom?: string, dateTo?: string, vehiclePlates?: string[]): Promise<ReportResult> {
  const c = whereCompanies(companyIds);
  const d = whereDates(dateFrom, dateTo, "va.arrival_date");
  const p = wherePlates(vehiclePlates ?? []);
  const rows = await db().prepare(`
    SELECT
      c.name                       AS "Firma",
      cv.plate                     AS "Plaka",
      COALESCE(cv.route_name,'')   AS "Güzergah",
      va.arrival_date              AS "Tarih",
      COALESCE(va.shift,'—')       AS "Vardiya",
      DATE_FORMAT(DATE_ADD(STR_TO_DATE(SUBSTRING(va.arrived_at,1,19),'%Y-%m-%dT%H:%i:%s'), INTERVAL 3 HOUR),'%H:%i') AS "Giriş Saati",
      u.full_name                  AS "Kaydeden",
      COALESCE(va.note,'')         AS "Not"
    FROM vehicle_arrivals va
    JOIN company_vehicles cv ON cv.id = va.vehicle_id
    JOIN companies c          ON c.id = va.company_id
    LEFT JOIN users u         ON u.id = va.recorded_by
    WHERE 1=1 ${c.sql} ${d.sql} ${p.sql}
    ORDER BY c.name ASC, va.arrived_at DESC
    LIMIT 5000
  `).all(...c.params, ...d.params, ...p.params) as ReportRow[];

  // Group rows by company → one section per company
  const byCompany = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const firma = String(r["Firma"] || "Diğer");
    if (!byCompany.has(firma)) byCompany.set(firma, []);
    byCompany.get(firma)!.push(r);
  }

  const sections = Array.from(byCompany.entries()).map(([firma, firmRows]) => {
    const byDay: Record<string, number> = {};
    const byShift: Record<string, number> = {};
    for (const r of firmRows) {
      const day = String(r["Tarih"] || "");
      byDay[day] = (byDay[day] || 0) + 1;
      const s = String(r["Vardiya"] || "—");
      byShift[s] = (byShift[s] || 0) + 1;
    }
    const days = Object.keys(byDay).sort().slice(-14);
    // Expose rows without the "Firma" column (redundant inside its own section)
    const sectionRows = firmRows.map(({ Firma: _, ...rest }) => rest) as ReportRow[];
    return {
      title: firma,
      rows: sectionRows,
      charts: [
        { type: "bar" as const, title: `${firma} — Günlük Giriş`, labels: days, series: days.map(d => ({ label: d, value: byDay[d] })) },
        { type: "donut" as const, title: "Vardiya Dağılımı", series: Object.entries(byShift).filter(([, v]) => v > 0).map(([l, v]) => ({ label: l, value: v })) },
      ],
    };
  });

  // Overall totals by company for summary charts
  const companyTotals = Array.from(byCompany.entries()).map(([l, rs]) => ({ label: l, value: rs.length }));

  return {
    rows,
    sections,
    charts: [
      { type: "bar", title: "Firma Bazlı Toplam Giriş", series: companyTotals },
    ],
    totals: {
      "Toplam Giriş": rows.length,
      "Firma Sayısı": byCompany.size,
    },
  };
}

// ─── Report 2: Sefer Performans ────────────────────────────────────────────────
export async function r02_seferPerformans(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "t.trip_date");
  const cFilter = companyIds.length ? ` AND r.id IN (SELECT route_id FROM company_vehicles WHERE company_id IN (${companyIds.map(()=>"?").join(",")}))` : "";
  const rows = await db().prepare(`
    SELECT
      t.trip_date          AS "Tarih",
      r.name               AS "Güzergah",
      t.direction          AS "Yön",
      t.planned_departure  AS "Planlanan Kalkış",
      COALESCE(t.actual_departure,'—') AS "Gerçekleşen Kalkış",
      COALESCE(t.delay_minutes,0) AS "Gecikme (dk)",
      t.passenger_count    AS "Yolcu",
      t.status_code        AS "Durum"
    FROM trips t
    JOIN routes r ON r.id = t.route_id
    WHERE 1=1 ${d.sql} ${cFilter}
    ORDER BY t.trip_date DESC, t.planned_departure
    LIMIT 2000
  `).all(...d.params, ...(companyIds.length ? companyIds : [])) as ReportRow[];

  const delayBuckets: Record<string,number> = { "0 dk": 0, "1-5 dk": 0, "6-15 dk": 0, "16-30 dk": 0, "30+ dk": 0 };
  let onTime = 0, delayed = 0;
  for (const r of rows) {
    const dm = Number(r["Gecikme (dk)"] || 0);
    if (dm === 0) { delayBuckets["0 dk"]++; onTime++; }
    else if (dm <= 5) { delayBuckets["1-5 dk"]++; delayed++; }
    else if (dm <= 15) { delayBuckets["6-15 dk"]++; delayed++; }
    else if (dm <= 30) { delayBuckets["16-30 dk"]++; delayed++; }
    else { delayBuckets["30+ dk"]++; delayed++; }
  }
  return {
    rows,
    charts: [
      { type: "bar", title: "Gecikme Dağılımı", series: Object.entries(delayBuckets).map(([l,v]) => ({ label: l, value: v })) },
    ],
    totals: { "Toplam Sefer": rows.length, "Zamanında": onTime, "Gecikmeli": delayed },
  };
}

// ─── Report 3: Gecikme Analizi ────────────────────────────────────────────────
export async function r03_gecikme(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "t.trip_date");
  const rows = await db().prepare(`
    SELECT
      r.name                                    AS "Güzergah",
      COUNT(*)                                  AS "Sefer Sayısı",
      ROUND(AVG(COALESCE(t.delay_minutes,0)),1) AS "Ort. Gecikme (dk)",
      MAX(COALESCE(t.delay_minutes,0))          AS "Maks. Gecikme (dk)",
      SUM(CASE WHEN COALESCE(t.delay_minutes,0)>0 THEN 1 ELSE 0 END) AS "Gecikmeli Sefer"
    FROM trips t
    JOIN routes r ON r.id = t.route_id
    WHERE 1=1 ${d.sql}
    GROUP BY r.id, r.name
    ORDER BY \`Ort. Gecikme (dk)\` DESC
    LIMIT 30
  `).all(...d.params) as ReportRow[];
  return {
    rows,
    charts: [
      { type: "bar", title: "Güzergah Bazlı Ort. Gecikme", series: rows.map(r => ({ label: String(r["Güzergah"]), value: Number(r["Ort. Gecikme (dk)"]) })) },
    ],
  };
}

// ─── Report 4: Yolcu Doluluk ──────────────────────────────────────────────────
export async function r04_doluluk(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "t.trip_date");
  const cFilter = companyIds.length ? ` AND r.id IN (SELECT DISTINCT route_id FROM trips WHERE route_id IN (SELECT id FROM routes))` : "";
  const rows = await db().prepare(`
    SELECT
      t.trip_date                    AS "Tarih",
      r.name                         AS "Güzergah",
      COALESCE(v.plate,'—')          AS "Plaka",
      COALESCE(v.capacity,0)         AS "Kapasite",
      COALESCE(t.passenger_count,0)  AS "Yolcu",
      CASE WHEN COALESCE(v.capacity,0)>0
        THEN ROUND(COALESCE(t.passenger_count,0)*100.0/v.capacity,1)
        ELSE 0 END                   AS "Doluluk %"
    FROM trips t
    JOIN routes r ON r.id = t.route_id
    LEFT JOIN vehicles v ON v.id = t.vehicle_id
    WHERE 1=1 ${d.sql} ${cFilter}
    ORDER BY t.trip_date DESC
    LIMIT 2000
  `).all(...d.params) as ReportRow[];

  const byRoute: Record<string,number[]> = {};
  for (const r of rows) {
    const key = String(r["Güzergah"]);
    if (!byRoute[key]) byRoute[key] = [];
    byRoute[key].push(Number(r["Doluluk %"]));
  }
  const avgByRoute = Object.entries(byRoute).map(([l,vs]) => ({ label: l, value: Math.round(vs.reduce((a,b)=>a+b,0)/vs.length) }));
  return {
    rows,
    charts: [{ type: "bar", title: "Güzergah Ortalama Doluluk %", series: avgByRoute }],
    totals: { "Toplam Sefer": rows.length },
  };
}

// ─── Report 5: Firma Operasyon Özeti ─────────────────────────────────────────
export async function r05_firmaOperasyon(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const c = whereCompanies(companyIds, "c.id");
  const d = whereDates(dateFrom, dateTo, "DATE(va.arrived_at)");
  const rows = await db().prepare(`
    SELECT
      c.name                                 AS "Firma",
      COUNT(DISTINCT cv.id)                  AS "Toplam Araç",
      COUNT(DISTINCT va.id)                  AS "Toplam Giriş",
      COUNT(DISTINCT insp.id)                AS "Denetim Sayısı",
      SUM(CASE WHEN insp.result='pass' THEN 1 ELSE 0 END) AS "Geçen Denetim"
    FROM companies c
    LEFT JOIN company_vehicles cv ON cv.company_id = c.id AND cv.is_active = 1
    LEFT JOIN vehicle_arrivals va ON va.company_id = c.id ${d.sql ? "AND " + d.sql.replace(" AND ","") : ""}
    LEFT JOIN inspections insp    ON insp.company_vehicle_id = cv.id
    WHERE 1=1 ${c.sql}
    GROUP BY c.id, c.name
    ORDER BY c.name
  `).all(...c.params, ...d.params.flatMap(p => [p])) as ReportRow[];

  return {
    rows,
    charts: [
      { type: "bar", title: "Firma Bazlı Toplam Giriş", series: rows.map(r => ({ label: String(r["Firma"]), value: Number(r["Toplam Giriş"]) })) },
    ],
  };
}

// ─── Report 6: Firma Araç Envanteri ─────────────────────────────────────────
export async function r06_firmaArac(companyIds: string[], _dateFrom?: string, _dateTo?: string): Promise<ReportResult> {
  const c = whereCompanies(companyIds, "cv.company_id");
  const rows = await db().prepare(`
    SELECT
      co.name                               AS "Firma",
      cv.plate                              AS "Plaka",
      COALESCE(cv.route_name,'—')           AS "Güzergah",
      COALESCE(cv.driver_name,'—')          AS "Şoför",
      COALESCE(cv.phone_number,'—')         AS "Telefon",
      CASE WHEN cv.is_active=1 THEN 'Aktif' ELSE 'Pasif' END AS "Durum",
      CASE WHEN cv.is_temporary=1 THEN 'Evet' ELSE 'Hayır' END AS "Geçici",
      (SELECT MAX(arrival_date) FROM vehicle_arrivals WHERE vehicle_id=cv.id) AS "Son Giriş"
    FROM company_vehicles cv
    JOIN companies co ON co.id = cv.company_id
    WHERE 1=1 ${c.sql}
    ORDER BY co.name, cv.plate
    LIMIT 1000
  `).all(...c.params) as ReportRow[];

  const aktif = rows.filter(r => r["Durum"] === "Aktif").length;
  const pasif = rows.length - aktif;
  return {
    rows,
    charts: [
      { type: "donut", title: "Araç Durum Dağılımı", series: [{ label: "Aktif", value: aktif }, { label: "Pasif", value: pasif }] },
    ],
    totals: { "Toplam Araç": rows.length, "Aktif": aktif, "Pasif": pasif },
  };
}

// ─── Report 7: Giriş Uyum Raporu ─────────────────────────────────────────────
export async function r07_girisUyum(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const c = whereCompanies(companyIds, "va.company_id");
  const d = whereDates(dateFrom, dateTo, "va.arrival_date");
  const rows = await db().prepare(`
    SELECT
      va.arrival_date                   AS "Tarih",
      c.name                            AS "Firma",
      COUNT(DISTINCT va.vehicle_id)     AS "Giriş Yapan Araç",
      COUNT(DISTINCT cv.id)             AS "Toplam Aktif Araç"
    FROM companies c
    JOIN company_vehicles cv ON cv.company_id = c.id AND cv.is_active = 1
    LEFT JOIN vehicle_arrivals va ON va.company_id = c.id AND va.vehicle_id = cv.id ${d.sql ? "AND " + d.sql.replace(" AND ","") : ""}
    WHERE 1=1 ${c.sql}
    GROUP BY va.arrival_date, c.id, c.name
    ORDER BY va.arrival_date DESC, c.name
    LIMIT 1000
  `).all(...c.params, ...d.params.flatMap(p=>[p])) as ReportRow[];

  const withPct: ReportRow[] = rows.map(r => {
    const total = Number(r["Toplam Aktif Araç"]) || 0;
    const done  = Number(r["Giriş Yapan Araç"]) || 0;
    return { ...r, "Uyum %": total > 0 ? Math.round(done * 100 / total) : 0 };
  });

  const days = [...new Set(withPct.map(r => String(r["Tarih"] ?? "")))].sort().slice(-14);
  return {
    rows: withPct,
    charts: [
      { type: "line" as const, title: "Günlük Giriş Uyum %", labels: days, series: days.map(d => ({ label: d, value: Math.round(withPct.filter(r => r["Tarih"] === d).reduce((a, r) => a + Number(r["Uyum %"] || 0), 0) / Math.max(withPct.filter(r => r["Tarih"] === d).length, 1)) })) },
    ],
  };
}

// ─── Report 8: Araç Denetim Raporu ───────────────────────────────────────────
export async function r08_aracDenetim(companyIds: string[], dateFrom?: string, dateTo?: string, vehiclePlates?: string[]): Promise<ReportResult> {
  const c = whereCompanies(companyIds, "cv.company_id");
  const d = whereDates(dateFrom, dateTo, "i.inspection_date");
  const p = wherePlates(vehiclePlates ?? [], "i.company_vehicle_plate");
  const rows = await db().prepare(`
    SELECT
      co.name                   AS "Firma",
      i.company_vehicle_plate   AS "Plaka",
      i.inspection_date         AS "Denetim Tarihi",
      i.type                    AS "Tür",
      CASE i.result
        WHEN 'pass'        THEN 'Geçti'
        WHEN 'fail'        THEN 'Kaldı'
        WHEN 'conditional' THEN 'Şartlı'
        ELSE 'Bekliyor'
      END                       AS "Sonuç",
      COALESCE(i.notes,'')      AS "Notlar"
    FROM inspections i
    JOIN company_vehicles cv ON cv.id = i.company_vehicle_id
    JOIN companies co         ON co.id = cv.company_id
    WHERE 1=1 ${c.sql} ${d.sql} ${p.sql}
    ORDER BY i.inspection_date DESC
    LIMIT 1000
  `).all(...c.params, ...d.params, ...p.params) as ReportRow[];

  const dist: Record<string,number> = { Geçti: 0, Kaldı: 0, Şartlı: 0, Bekliyor: 0 };
  for (const r of rows) dist[String(r["Sonuç"])] = (dist[String(r["Sonuç"])] || 0) + 1;
  return {
    rows,
    charts: [
      { type: "donut", title: "Denetim Sonuçları", series: Object.entries(dist).filter(([,v])=>v>0).map(([l,v]) => ({ label: l, value: v })) },
    ],
    totals: dist,
  };
}

// ─── Report 9: Şoför Değerlendirme ───────────────────────────────────────────
export async function r09_soforDegerlendirme(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const c = whereCompanies(companyIds, "de.company_id");
  const d = whereDates(dateFrom, dateTo, "de.evaluation_date");
  const rows = await db().prepare(`
    SELECT
      de.evaluation_date                AS "Tarih",
      COALESCE(co.name,'—')            AS "Firma",
      de.driver_name                    AS "Şoför",
      de.plate                          AS "Plaka",
      de.score_punctuality              AS "Dakiklik",
      de.score_driving                  AS "Sürüş",
      de.score_communication            AS "İletişim",
      de.score_cleanliness              AS "Temizlik",
      de.score_route_compliance         AS "Güzergah Uyumu",
      de.score_appearance               AS "Görünüm",
      ROUND((de.score_punctuality+de.score_driving+de.score_communication+de.score_cleanliness+de.score_route_compliance+de.score_appearance)/6.0,2) AS "Ortalama"
    FROM driver_evaluations de
    LEFT JOIN companies co ON co.id = de.company_id
    WHERE 1=1 ${c.sql} ${d.sql}
    ORDER BY de.evaluation_date DESC
    LIMIT 1000
  `).all(...c.params, ...d.params) as ReportRow[];

  const dims = ["Dakiklik","Sürüş","İletişim","Temizlik","Güzergah Uyumu","Görünüm"];
  const avgs = dims.map(dim => {
    const vals = rows.map(r => Number(r[dim]||0)).filter(v=>v>0);
    return { label: dim, value: vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*100)/100 : 0 };
  });
  return {
    rows,
    charts: [
      { type: "radar", title: "Boyut Ortalamaları", series: avgs },
      { type: "bar", title: "Boyut Ortalama Skorları", series: avgs },
    ],
    totals: { "Değerlendirme Sayısı": rows.length },
  };
}

// ─── Report 10: Şoför Sicil ───────────────────────────────────────────────────
export async function r10_soforSicil(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "dr.incident_date");
  const rows = await db().prepare(`
    SELECT
      dr.incident_date    AS "Tarih",
      dr.driver_name      AS "Şoför",
      dr.vehicle_plate    AS "Plaka",
      dr.category         AS "Kategori",
      dr.severity         AS "Ciddiyet (1-4)",
      dr.description      AS "Açıklama",
      dr.action_taken     AS "Alınan Önlem"
    FROM driver_records dr
    WHERE 1=1 ${d.sql}
    ORDER BY dr.incident_date DESC
    LIMIT 1000
  `).all(...d.params) as ReportRow[];

  const byCat: Record<string,number> = {};
  const bySev: Record<string,number> = { "1":0, "2":0, "3":0, "4":0 };
  for (const r of rows) {
    const cat = String(r["Kategori"]||"Diğer");
    byCat[cat] = (byCat[cat]||0)+1;
    const sev = String(r["Ciddiyet (1-4)"]||"1");
    bySev[sev] = (bySev[sev]||0)+1;
  }
  return {
    rows,
    charts: [
      { type: "bar", title: "Kategoriye Göre Olay", series: Object.entries(byCat).map(([l,v])=>({label:l,value:v})) },
      { type: "bar", title: "Ciddiyet Dağılımı", series: Object.entries(bySev).filter(([,v])=>v>0).map(([l,v])=>({label:`Seviye ${l}`,value:v})) },
    ],
    totals: { "Toplam Kayıt": rows.length },
  };
}

// ─── Report 11: Personel Görev ────────────────────────────────────────────────
export async function r11_personelGorev(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "t.created_at");
  const rows = await db().prepare(`
    SELECT
      COALESCE(dept.name,'Genel')   AS "Departman",
      t.status_code                 AS "Durum",
      COUNT(*)                      AS "Sayı",
      SUM(CASE WHEN t.due_date < DATE(NOW()) AND t.status_code NOT IN ('done') THEN 1 ELSE 0 END) AS "Geciken"
    FROM todos t
    LEFT JOIN departments dept ON dept.id = t.department_id
    WHERE 1=1 ${d.sql}
    GROUP BY dept.name, t.status_code
    ORDER BY dept.name, t.status_code
  `).all(...d.params) as ReportRow[];

  const statusDist: Record<string,number> = {};
  for (const r of rows) {
    const s = String(r["Durum"]||"todo");
    statusDist[s] = (statusDist[s]||0) + Number(r["Sayı"]||0);
  }
  const deptTotals: Record<string,number> = {};
  for (const r of rows) {
    const d = String(r["Departman"]||"Genel");
    deptTotals[d] = (deptTotals[d]||0) + Number(r["Sayı"]||0);
  }
  return {
    rows,
    charts: [
      { type: "donut", title: "Görev Durum Dağılımı", series: Object.entries(statusDist).map(([l,v])=>({label:l,value:v})) },
      { type: "bar",   title: "Departman Bazlı Görev", series: Object.entries(deptTotals).map(([l,v])=>({label:l,value:v})) },
    ],
    totals: statusDist,
  };
}

// ─── Report 12: İş Günlükleri ─────────────────────────────────────────────────
export async function r12_isGunlukleri(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "w.work_date");
  const rows = await db().prepare(`
    SELECT
      w.work_date              AS "Tarih",
      u.full_name              AS "Personel",
      w.status_code            AS "Durum",
      COALESCE(SUM(wi.duration_minutes),0) AS "Toplam Süre (dk)"
    FROM worklogs w
    JOIN users u ON u.id = w.user_id
    LEFT JOIN worklog_items wi ON wi.worklog_id = w.id
    WHERE 1=1 ${d.sql}
    GROUP BY w.id
    ORDER BY w.work_date DESC
    LIMIT 1000
  `).all(...d.params) as ReportRow[];

  const statusDist: Record<string,number> = {};
  for (const r of rows) { const s = String(r["Durum"]); statusDist[s] = (statusDist[s]||0)+1; }
  return {
    rows,
    charts: [
      { type: "bar", title: "Günlük Durum Dağılımı", series: Object.entries(statusDist).map(([l,v])=>({label:l,value:v})) },
    ],
    totals: { "Toplam Günlük": rows.length, ...statusDist },
  };
}

// ─── Report 13: Ticket Analiz ─────────────────────────────────────────────────
export async function r13_ticketAnaliz(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "t.created_at");
  const rows = await db().prepare(`
    SELECT
      t.ticket_no           AS "No",
      t.title               AS "Başlık",
      t.priority_code       AS "Öncelik",
      t.status_code         AS "Durum",
      u.full_name           AS "Atanan",
      t.sla_due_at          AS "SLA Bitiş",
      CASE WHEN t.sla_due_at < NOW() AND t.status_code NOT IN ('solved','closed') THEN 'Evet' ELSE 'Hayır' END AS "SLA İhlal",
      CASE WHEN t.closed_at IS NOT NULL
        THEN ROUND(TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at)/60.0, 1)
        ELSE NULL END       AS "Çözüm Süresi (saat)",
      t.created_at          AS "Oluşturulma"
    FROM tickets t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE 1=1 ${d.sql}
    ORDER BY t.created_at DESC
    LIMIT 1000
  `).all(...d.params) as ReportRow[];

  const byPri: Record<string,number> = {};
  let slaOk = 0, slaBroken = 0;
  for (const r of rows) {
    const p = String(r["Öncelik"]||"normal");
    byPri[p] = (byPri[p]||0)+1;
    if (r["SLA İhlal"] === "Evet") slaBroken++; else slaOk++;
  }
  return {
    rows,
    charts: [
      { type: "bar",   title: "Öncelik Dağılımı", series: Object.entries(byPri).map(([l,v])=>({label:l,value:v})) },
      { type: "donut", title: "SLA Uyumu", series: [{ label: "Uyumlu", value: slaOk }, { label: "İhlal", value: slaBroken }] },
    ],
    totals: { "Toplam": rows.length, "SLA İhlal": slaBroken },
  };
}

// ─── Report 14: Uyarı & İhlal ─────────────────────────────────────────────────
export async function r14_uyariIhlal(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "w.created_at");
  const rows = await db().prepare(`
    SELECT
      w.plate              AS "Plaka",
      w.driver_name        AS "Şoför",
      w.reason             AS "Sebep",
      w.deadline           AS "Son Tarih",
      CASE WHEN w.is_done=1 THEN 'Tamamlandı' ELSE 'Açık' END AS "Durum",
      w.created_at         AS "Oluşturulma"
    FROM warnings w
    WHERE 1=1 ${d.sql}
    ORDER BY w.created_at DESC
    LIMIT 1000
  `).all(...d.params) as ReportRow[];

  const byPlate: Record<string,number> = {};
  for (const r of rows) { const p = String(r["Plaka"]||"—"); byPlate[p] = (byPlate[p]||0)+1; }
  const topPlates = Object.entries(byPlate).sort((a,b)=>b[1]-a[1]).slice(0,10);
  return {
    rows,
    charts: [
      { type: "bar", title: "Uyarı En Fazla 10 Plaka", series: topPlates.map(([l,v])=>({label:l,value:v})) },
    ],
    totals: { "Toplam Uyarı": rows.length },
  };
}

// ─── Report 15: Güzergah Kullanım ─────────────────────────────────────────────
export async function r15_guzergahKullanim(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "t.trip_date");
  const rows = await db().prepare(`
    SELECT
      r.name                                    AS "Güzergah",
      r.direction                               AS "Yön",
      COUNT(t.id)                               AS "Sefer Sayısı",
      ROUND(AVG(COALESCE(t.passenger_count,0)),1) AS "Ort. Yolcu",
      ROUND(AVG(COALESCE(t.delay_minutes,0)),1) AS "Ort. Gecikme (dk)"
    FROM routes r
    LEFT JOIN trips t ON t.route_id = r.id ${d.sql ? "AND " + d.sql.replace(" AND ","") : ""}
    GROUP BY r.id, r.name, r.direction
    ORDER BY \`Sefer Sayısı\` DESC
    LIMIT 50
  `).all(...d.params.flatMap(p=>[p])) as ReportRow[];

  return {
    rows,
    charts: [
      { type: "bar", title: "Güzergah Sefer Sayısı", series: rows.slice(0,10).map(r=>({label:String(r["Güzergah"]),value:Number(r["Sefer Sayısı"])})) },
    ],
  };
}

// ─── Report 16: Açık Güzergah Maliyet ────────────────────────────────────────
export async function r16_acikGuzergah(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const c = whereCompanies(companyIds, "og.company_id");
  const d = whereDates(dateFrom, dateTo, "og.created_at");
  const rows = await db().prepare(`
    SELECT
      co.name                             AS "Firma",
      og.name                             AS "Güzergah Adı",
      COALESCE(og.distance_km,0)          AS "Mesafe (km)",
      COALESCE(og.duration_min,0)         AS "Süre (dk)",
      COALESCE(og.price,0)                AS "Fiyat (₺)",
      og.status                           AS "Durum",
      og.created_at                       AS "Oluşturulma",
      og.closed_at                        AS "Kapanma"
    FROM open_routes og
    JOIN companies co ON co.id = og.company_id
    WHERE 1=1 ${c.sql} ${d.sql}
    ORDER BY og.created_at DESC
    LIMIT 500
  `).all(...c.params, ...d.params) as ReportRow[];

  return {
    rows,
    charts: [
      { type: "bar", title: "Üst 10 Fiyat (₺)", series: [...rows].sort((a,b)=>Number(b["Fiyat (₺)"])-Number(a["Fiyat (₺)"])).slice(0,10).map(r=>({label:String(r["Güzergah Adı"]),value:Number(r["Fiyat (₺)"])})) },
    ],
    totals: { "Toplam": rows.length, "Toplam Fiyat (₺)": rows.reduce((a,r)=>a+Number(r["Fiyat (₺)"]||0),0) },
  };
}

// ─── Report 17: Aylık Operasyon Özeti ────────────────────────────────────────
export async function r17_aylikOzet(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const c = whereCompanies(companyIds, "va.company_id");
  const d = whereDates(dateFrom, dateTo, "va.arrival_date");
  const rows = await db().prepare(`
    SELECT
      DATE_FORMAT(va.arrival_date,'%Y-%m') AS "Ay",
      c.name                               AS "Firma",
      COUNT(*)                             AS "Toplam Giriş"
    FROM vehicle_arrivals va
    JOIN companies c ON c.id = va.company_id
    WHERE 1=1 ${c.sql} ${d.sql}
    GROUP BY DATE_FORMAT(va.arrival_date,'%Y-%m'), c.id
    ORDER BY \`Ay\`, c.name
  `).all(...c.params, ...d.params) as ReportRow[];

  const months = [...new Set(rows.map(r=>String(r["Ay"])))].sort();
  const totByMonth = months.map(m => ({ label: m, value: rows.filter(r=>r["Ay"]===m).reduce((a,r)=>a+Number(r["Toplam Giriş"]||0),0) }));
  return {
    rows,
    charts: [
      { type: "bar", title: "Aylık Toplam Giriş", series: totByMonth },
    ],
  };
}

// ─── Report 18: Firma Kapsamlı ────────────────────────────────────────────────
export async function r18_firmaKapsamli(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const [giris, denetim, arac] = await Promise.all([
    r01_aracGiris(companyIds, dateFrom, dateTo),
    r08_aracDenetim(companyIds, dateFrom, dateTo),
    r06_firmaArac(companyIds, dateFrom, dateTo),
  ]);
  return {
    rows: giris.rows,
    charts: [...giris.charts, ...denetim.charts.slice(0,1), ...arac.charts],
    sections: [
      { title: "Araç Girişleri", rows: giris.rows, charts: giris.charts },
      { title: "Denetimler", rows: denetim.rows, charts: denetim.charts },
      { title: "Araç Envanteri", rows: arac.rows, charts: arac.charts },
    ],
    totals: { "Giriş": giris.rows.length, "Denetim": denetim.rows.length, "Araç": arac.rows.length },
  };
}

// ─── Report 19: Filo Durum ────────────────────────────────────────────────────
export async function r19_filoDurum(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const c = whereCompanies(companyIds, "cv.company_id");
  const rows = await db().prepare(`
    SELECT
      co.name                          AS "Firma",
      cv.plate                         AS "Plaka",
      COALESCE(cv.driver_name,'—')     AS "Şoför",
      CASE WHEN cv.is_active=1 THEN 'Aktif' ELSE 'Pasif' END AS "Durum",
      (SELECT MAX(arrival_date) FROM vehicle_arrivals WHERE vehicle_id=cv.id) AS "Son Giriş",
      (SELECT COUNT(*) FROM inspections WHERE company_vehicle_id=cv.id)       AS "Denetim Sayısı",
      (SELECT MAX(inspection_date) FROM inspections WHERE company_vehicle_id=cv.id) AS "Son Denetim",
      (SELECT result FROM inspections WHERE company_vehicle_id=cv.id ORDER BY inspection_date DESC LIMIT 1) AS "Son Denetim Sonucu"
    FROM company_vehicles cv
    JOIN companies co ON co.id = cv.company_id
    WHERE 1=1 ${c.sql}
    ORDER BY co.name, cv.plate
    LIMIT 1000
  `).all(...c.params) as ReportRow[];

  const byResult: Record<string,number> = {};
  for (const r of rows) { const k = String(r["Son Denetim Sonucu"]||"Yok"); byResult[k]=(byResult[k]||0)+1; }
  return {
    rows,
    charts: [
      { type: "donut", title: "Son Denetim Sonuçları", series: Object.entries(byResult).map(([l,v])=>({label:l,value:v})) },
    ],
    totals: { "Toplam Araç": rows.length },
  };
}

// ─── Report 20: Yönetici Haftalık Bülten ─────────────────────────────────────
export async function r20_haftalikBulten(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "va.arrival_date");
  const rows = await db().prepare(`
    SELECT
      c.name                        AS "Firma",
      COUNT(DISTINCT va.id)         AS "Araç Girişi",
      COUNT(DISTINCT cv.id)         AS "Toplam Araç",
      COUNT(DISTINCT insp.id)       AS "Denetim",
      (SELECT COUNT(*) FROM todos WHERE status_code='todo' OR status_code='doing') AS "Açık Görev"
    FROM companies c
    LEFT JOIN company_vehicles cv ON cv.company_id = c.id AND cv.is_active=1
    LEFT JOIN vehicle_arrivals va ON va.company_id = c.id ${d.sql ? "AND "+d.sql.replace(" AND ","") : ""}
    LEFT JOIN inspections insp    ON insp.company_vehicle_id = cv.id
    GROUP BY c.id, c.name
    ORDER BY c.name
  `).all(...d.params.flatMap(p=>[p])) as ReportRow[];

  return {
    rows,
    charts: [
      { type: "bar", title: "Firma Bazlı Haftalık Giriş", series: rows.map(r=>({label:String(r["Firma"]),value:Number(r["Araç Girişi"])})) },
      { type: "bar", title: "Denetim Sayıları", series: rows.map(r=>({label:String(r["Firma"]),value:Number(r["Denetim"])})) },
    ],
    totals: {
      "Toplam Giriş": rows.reduce((a,r)=>a+Number(r["Araç Girişi"]||0),0),
      "Toplam Denetim": rows.reduce((a,r)=>a+Number(r["Denetim"]||0),0),
    },
  };
}

// ─── Report 21: Hakediş Tablosu (Muhasebe) ───────────────────────────────────
export async function r21_hakedisTablosu(_companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "h.donem_baslangic");
  const rows = await db().prepare(`
    SELECT
      i.unvan             AS "İşleten",
      COALESCE(v.plate,'—') AS "Plaka",
      h.donem_baslangic   AS "Dönem Başlangıç",
      h.donem_bitis       AS "Dönem Bitiş",
      h.brut_tutar        AS "Brüt Tutar",
      h.kdv_tutari        AS "KDV Tutarı",
      h.tevkifat_tutari   AS "Tevkifat Tutarı",
      h.net_tutar         AS "Net Tutar",
      h.durum             AS "Durum"
    FROM hakedis h
    JOIN isleten i ON i.id = h.isleten_id
    LEFT JOIN vehicles v ON v.id = h.vehicle_id
    WHERE 1=1 ${d.sql}
    ORDER BY h.donem_baslangic DESC
    LIMIT 5000
  `).all(...d.params) as ReportRow[];

  const byDurum: Record<string, number> = {};
  for (const r of rows) { const k = String(r["Durum"] || "—"); byDurum[k] = (byDurum[k] || 0) + 1; }

  return {
    rows,
    charts: [{ type: "donut", title: "Durum Dağılımı", series: Object.entries(byDurum).map(([l, v]) => ({ label: l, value: v })) }],
    totals: {
      "Toplam Brüt": rows.reduce((a, r) => a + Number(r["Brüt Tutar"] || 0), 0),
      "Toplam Net": rows.reduce((a, r) => a + Number(r["Net Tutar"] || 0), 0),
      "Kayıt Sayısı": rows.length,
    },
  };
}

// ─── Report 22: İşleten Cari (Muhasebe) ──────────────────────────────────────
export async function r22_isletenCari(_companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "ic.tarih");
  const rows = await db().prepare(`
    SELECT
      i.unvan          AS "İşleten",
      ic.tarih         AS "Tarih",
      ic.islem_turu    AS "İşlem Türü",
      ic.para_girisi   AS "Para Girişi",
      ic.para_cikisi   AS "Para Çıkışı",
      ic.tutar         AS "Tutar",
      COALESCE(ic.aciklama,'') AS "Açıklama"
    FROM isleten_cari ic
    JOIN isleten i ON i.id = ic.isleten_id
    WHERE 1=1 ${d.sql}
    ORDER BY i.unvan ASC, ic.tarih DESC
    LIMIT 5000
  `).all(...d.params) as ReportRow[];

  const byIsleten = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const k = String(r["İşleten"] || "Diğer");
    if (!byIsleten.has(k)) byIsleten.set(k, []);
    byIsleten.get(k)!.push(r);
  }
  const sections = Array.from(byIsleten.entries()).map(([isleten, rs]) => ({
    title: isleten,
    rows: rs.map(({ "İşleten": _, ...rest }) => rest) as ReportRow[],
    charts: [],
  }));

  return {
    rows,
    sections,
    charts: [{
      type: "bar", title: "İşleten Bazlı Net Bakiye",
      series: Array.from(byIsleten.entries()).map(([l, rs]) => ({
        label: l, value: rs.reduce((a, r) => a + (Number(r["Para Girişi"] || 0) - Number(r["Para Çıkışı"] || 0)), 0),
      })),
    }],
    totals: {
      "Toplam Para Girişi": rows.reduce((a, r) => a + Number(r["Para Girişi"] || 0), 0),
      "Toplam Para Çıkışı": rows.reduce((a, r) => a + Number(r["Para Çıkışı"] || 0), 0),
    },
  };
}

// ─── Report 23: Kâr-Zarar (Muhasebe) ─────────────────────────────────────────
export async function r23_karZararRapor(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const c = whereCompanies(companyIds, "c.id");
  const from = dateFrom || "1970-01-01";
  const to = dateTo || "2999-12-31";
  const rows = await db().prepare(`
    SELECT c.id AS company_id, c.name AS "Firma",
           COALESCE(rev.toplam, 0) AS "Gelir",
           COALESCE(cost.toplam, 0) AS "Gider",
           COALESCE(rev.toplam, 0) - COALESCE(cost.toplam, 0) AS "Kâr"
    FROM companies c
    LEFT JOIN (
      SELECT r.company_id, SUM(csp.price_amount) AS toplam
      FROM cetele ce
      JOIN routes r ON r.id = ce.route_id
      LEFT JOIN vehicles v ON v.id = ce.vehicle_id
      LEFT JOIN route_supplier_prices csp ON csp.id = (
        SELECT rsp.id FROM route_supplier_prices rsp
        WHERE rsp.route_id = ce.route_id AND rsp.company_id = r.company_id
          AND ((ce.vehicle_id IS NOT NULL AND rsp.vehicle_id = ce.vehicle_id)
               OR (v.plate IS NOT NULL AND rsp.plate = v.plate)
               OR (rsp.vehicle_id IS NULL AND rsp.plate IS NULL))
          AND rsp.valid_from <= ce.tarih AND (rsp.valid_to IS NULL OR rsp.valid_to >= ce.tarih)
        ORDER BY rsp.valid_from DESC LIMIT 1
      )
      WHERE ce.durum = 'onaylandi' AND ce.tarih >= ? AND ce.tarih <= ?
      GROUP BY r.company_id
    ) rev ON rev.company_id = c.id
    LEFT JOIN (
      SELECT r.company_id, SUM(hc.tutar) AS toplam
      FROM hakedis_cetele hc
      JOIN cetele ce ON ce.id = hc.cetele_id
      JOIN routes r ON r.id = ce.route_id
      JOIN hakedis h ON h.id = hc.hakedis_id
      WHERE h.durum IN ('onaylandi','odendi') AND ce.tarih >= ? AND ce.tarih <= ?
      GROUP BY r.company_id
    ) cost ON cost.company_id = c.id
    WHERE c.is_active = 1 ${c.sql} AND (rev.toplam IS NOT NULL OR cost.toplam IS NOT NULL)
    ORDER BY c.name ASC
  `).all(from, to, from, to, ...c.params) as ReportRow[];

  return {
    rows: rows.map(({ company_id: _cid, ...rest }) => rest) as ReportRow[],
    charts: [{ type: "bar", title: "Firma Bazlı Kâr", series: rows.map(r => ({ label: String(r["Firma"]), value: Number(r["Kâr"] || 0) })) }],
    totals: {
      "Toplam Gelir": rows.reduce((a, r) => a + Number(r["Gelir"] || 0), 0),
      "Toplam Gider": rows.reduce((a, r) => a + Number(r["Gider"] || 0), 0),
      "Toplam Kâr": rows.reduce((a, r) => a + Number(r["Kâr"] || 0), 0),
    },
  };
}

// ─── Report 24: Mutabakat (Muhasebe) ─────────────────────────────────────────
export async function r24_mutabakatRapor(companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const c = whereCompanies(companyIds, "m.company_id");
  const d = whereDates(dateFrom, dateTo, "m.donem");
  const rows = await db().prepare(`
    SELECT co.name AS "Firma", m.donem AS "Dönem", m.tutar AS "Tutar", m.para_birimi AS "Para Birimi",
           m.durum AS "Durum", m.gonderilis_tarihi AS "Gönderiliş", m.onay_tarihi AS "Onay Tarihi"
    FROM firma_mutabakat m
    JOIN companies co ON co.id = m.company_id
    WHERE 1=1 ${c.sql} ${d.sql}
    ORDER BY m.donem DESC, co.name ASC
    LIMIT 2000
  `).all(...c.params, ...d.params) as ReportRow[];

  const byDurum: Record<string, number> = {};
  for (const r of rows) { const k = String(r["Durum"] || "—"); byDurum[k] = (byDurum[k] || 0) + 1; }

  return {
    rows,
    charts: [{ type: "donut", title: "Mutabakat Durumu", series: Object.entries(byDurum).map(([l, v]) => ({ label: l, value: v })) }],
    totals: { "Toplam Tutar": rows.reduce((a, r) => a + Number(r["Tutar"] || 0), 0), "Kayıt Sayısı": rows.length },
  };
}

// ─── Report 25: Tahakkuk (Muhasebe) ──────────────────────────────────────────
export async function r25_tahakkukRapor(_companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "h.donem_baslangic");
  const rows = await db().prepare(`
    SELECT i.unvan AS "İşleten", h.donem_baslangic AS "Dönem Başlangıç", h.donem_bitis AS "Dönem Bitiş",
           h.brut_tutar AS "Brüt Tutar", h.net_tutar AS "Net Tutar", h.tahakkuk_tarihi AS "Tahakkuk Tarihi"
    FROM hakedis h
    JOIN isleten i ON i.id = h.isleten_id
    WHERE h.durum = 'tahakkuk' ${d.sql}
    ORDER BY h.donem_baslangic DESC
    LIMIT 2000
  `).all(...d.params) as ReportRow[];

  return {
    rows,
    charts: [{ type: "bar", title: "İşleten Bazlı Tahakkuk", series: rows.map(r => ({ label: String(r["İşleten"]), value: Number(r["Net Tutar"] || 0) })) }],
    totals: { "Toplam Tahakkuk": rows.reduce((a, r) => a + Number(r["Net Tutar"] || 0), 0), "Kayıt Sayısı": rows.length },
  };
}

// ─── Report 26: Yakıt Kart Raporu ────────────────────────────────────────────
export async function r26_yakitKartRapor(_companyIds: string[], _dateFrom?: string, _dateTo?: string, vehiclePlates?: string[]): Promise<ReportResult> {
  const p = wherePlates(vehiclePlates ?? [], "v.plate");
  const rows = await db().prepare(`
    SELECT k.kart_no AS "Kart No", k.firma AS "Firma", COALESCE(v.plate,'—') AS "Plaka",
           COALESCE(i.unvan,'—') AS "İşleten", k.limit_turu AS "Limit Türü", k.kart_tipi AS "Kart Tipi",
           IF(k.is_active,'Aktif','Pasif') AS "Durum",
           (SELECT COUNT(*) FROM yakit_dolumlar yd WHERE yd.kart_id = k.id) AS "Dolum Sayısı",
           (SELECT COALESCE(SUM(yd.tutar),0) FROM yakit_dolumlar yd WHERE yd.kart_id = k.id) AS "Toplam Tutar"
    FROM yakit_kartlari k
    LEFT JOIN vehicles v ON v.id = k.vehicle_id
    LEFT JOIN isleten i ON i.id = k.isleten_id
    WHERE 1=1 ${p.sql}
    ORDER BY k.firma ASC, k.kart_no ASC
    LIMIT 2000
  `).all(...p.params) as ReportRow[];

  const byFirma: Record<string, number> = {};
  for (const r of rows) { const k = String(r["Firma"] || "—"); byFirma[k] = (byFirma[k] || 0) + Number(r["Toplam Tutar"] || 0); }

  return {
    rows,
    charts: [{ type: "donut", title: "Akaryakıt Firmasına Göre Harcama", series: Object.entries(byFirma).map(([l, v]) => ({ label: l, value: v })) }],
    totals: { "Kart Sayısı": rows.length, "Toplam Harcama": rows.reduce((a, r) => a + Number(r["Toplam Tutar"] || 0), 0) },
  };
}

// ─── Report 27: Yakıt Dolum Raporu ────────────────────────────────────────────
export async function r27_yakitDolumRapor(_companyIds: string[], dateFrom?: string, dateTo?: string, vehiclePlates?: string[]): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "yd.dolum_tarihi");
  const p = wherePlates(vehiclePlates ?? [], "v.plate");
  const rows = await db().prepare(`
    SELECT yd.dolum_tarihi AS "Tarih", COALESCE(v.plate,'—') AS "Plaka", k.kart_no AS "Kart No",
           COALESCE(yd.dolum_yeri,'') AS "Dolum Yeri", yd.miktar_litre AS "Litre",
           yd.birim_fiyat AS "Birim Fiyat", yd.tutar AS "Tutar", yd.son_km AS "KM"
    FROM yakit_dolumlar yd
    JOIN yakit_kartlari k ON k.id = yd.kart_id
    LEFT JOIN vehicles v ON v.id = k.vehicle_id
    WHERE 1=1 ${d.sql} ${p.sql}
    ORDER BY yd.dolum_tarihi DESC
    LIMIT 5000
  `).all(...d.params, ...p.params) as ReportRow[];

  return {
    rows,
    charts: [{ type: "bar", title: "Plaka Bazlı Toplam Litre", series: Object.entries(
      rows.reduce((acc: Record<string, number>, r) => { const k = String(r["Plaka"]); acc[k] = (acc[k] || 0) + Number(r["Litre"] || 0); return acc; }, {})
    ).map(([l, v]) => ({ label: l, value: v })) }],
    totals: {
      "Toplam Litre": rows.reduce((a, r) => a + Number(r["Litre"] || 0), 0),
      "Toplam Tutar": rows.reduce((a, r) => a + Number(r["Tutar"] || 0), 0),
      "Dolum Sayısı": rows.length,
    },
  };
}

// ─── Report 28: Yakıt Komisyon (firma bazlı harcama özeti) ───────────────────
export async function r28_yakitKomisyonRapor(_companyIds: string[], dateFrom?: string, dateTo?: string): Promise<ReportResult> {
  const d = whereDates(dateFrom, dateTo, "yd.dolum_tarihi");
  const rows = await db().prepare(`
    SELECT k.firma AS "Firma", COUNT(*) AS "Dolum Sayısı",
           SUM(yd.miktar_litre) AS "Toplam Litre", SUM(yd.tutar) AS "Toplam Tutar"
    FROM yakit_dolumlar yd
    JOIN yakit_kartlari k ON k.id = yd.kart_id
    WHERE 1=1 ${d.sql}
    GROUP BY k.firma
    ORDER BY SUM(yd.tutar) DESC
  `).all(...d.params) as ReportRow[];

  return {
    rows,
    charts: [{ type: "donut", title: "Firma Bazlı Harcama Payı", series: rows.map(r => ({ label: String(r["Firma"]), value: Number(r["Toplam Tutar"] || 0) })) }],
    totals: { "Toplam Tutar": rows.reduce((a, r) => a + Number(r["Toplam Tutar"] || 0), 0) },
  };
}

// ─── Report 29: Filo Toplu Rapor ─────────────────────────────────────────────
export async function r29_filoTopluRapor(_companyIds: string[], dateFrom?: string, dateTo?: string, vehiclePlates?: string[]): Promise<ReportResult> {
  const p = wherePlates(vehiclePlates ?? [], "v.plate");
  const from = dateFrom || "1970-01-01";
  const to = dateTo || "2999-12-31";
  const rows = await db().prepare(`
    SELECT 'Kaza' AS "Tür", v.plate AS "Plaka", a.tarih AS "Tarih", NULL AS "Tutar", a.kaza_turu AS "Detay"
    FROM vehicle_accidents a JOIN vehicles v ON v.id = a.vehicle_id
    WHERE a.tarih BETWEEN ? AND ? ${p.sql}
    UNION ALL
    SELECT 'Ceza', v.plate, c.ceza_tarihi, c.ceza_tutari, c.ceza_turu
    FROM vehicle_penalties c JOIN vehicles v ON v.id = c.vehicle_id
    WHERE c.ceza_tarihi BETWEEN ? AND ? ${p.sql}
    UNION ALL
    SELECT 'Arıza', v.plate, b.ariza_tarihi, NULL, b.ariza_detay
    FROM vehicle_breakdowns b JOIN vehicles v ON v.id = b.vehicle_id
    WHERE b.ariza_tarihi BETWEEN ? AND ? ${p.sql}
    UNION ALL
    SELECT 'Lastik', v.plate, t.degisim_tarihi, t.tutar, t.lastik_turu
    FROM vehicle_tires t JOIN vehicles v ON v.id = t.vehicle_id
    WHERE t.degisim_tarihi BETWEEN ? AND ? ${p.sql}
    ORDER BY "Tarih" DESC
    LIMIT 3000
  `).all(from, to, ...p.params, from, to, ...p.params, from, to, ...p.params, from, to, ...p.params) as ReportRow[];

  const byTur: Record<string, number> = {};
  for (const r of rows) { const k = String(r["Tür"]); byTur[k] = (byTur[k] || 0) + 1; }

  return {
    rows,
    charts: [{ type: "donut", title: "Olay Türü Dağılımı", series: Object.entries(byTur).map(([l, v]) => ({ label: l, value: v })) }],
    totals: {
      "Toplam Olay": rows.length,
      "Toplam Tutar": rows.reduce((a, r) => a + Number(r["Tutar"] || 0), 0),
    },
  };
}

// ─── Report 30: Araç Doluluk Oranı (filo kullanılabilirlik) ──────────────────
export async function r30_aracDolulukOrani(companyIds: string[], _dateFrom?: string, _dateTo?: string): Promise<ReportResult> {
  const c = whereCompanies(companyIds, "cv.company_id");
  const rows = await db().prepare(`
    SELECT v.plate AS "Plaka", v.status_code AS "Durum", v.capacity AS "Kapasite",
           COALESCE(co.name, '—') AS "Firma"
    FROM vehicles v
    LEFT JOIN company_vehicles cv ON cv.vehicle_id = v.id AND cv.is_active = 1
    LEFT JOIN companies co ON co.id = cv.company_id
    WHERE 1=1 ${c.sql}
    ORDER BY v.plate ASC
    LIMIT 2000
  `).all(...c.params) as ReportRow[];

  const byStatus: Record<string, number> = {};
  for (const r of rows) { const k = String(r["Durum"] || "—"); byStatus[k] = (byStatus[k] || 0) + 1; }
  const active = byStatus["active"] || 0;

  return {
    rows,
    charts: [{ type: "donut", title: "Filo Durum Dağılımı", series: Object.entries(byStatus).map(([l, v]) => ({ label: l, value: v })) }],
    totals: {
      "Toplam Araç": rows.length,
      "Aktif Oranı %": rows.length ? Math.round((active / rows.length) * 100) : 0,
    },
  };
}

// ─── Report 31: Belge Hatırlatma (araç + sürücü, 30 gün içinde bitenler) ─────
export async function r31_belgeHatirlatma(_companyIds: string[], _dateFrom?: string, _dateTo?: string): Promise<ReportResult> {
  const rows = await db().prepare(`
    SELECT 'Araç' AS "Tür", v.plate AS "Plaka/Ad", vd.doc_type AS "Belge Türü", vd.expiry_date AS "Bitiş Tarihi",
           DATEDIFF(vd.expiry_date, CURDATE()) AS "Kalan Gün"
    FROM vehicle_documents vd
    JOIN vehicles v ON v.id = vd.vehicle_id
    WHERE vd.expiry_date IS NOT NULL AND vd.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
    UNION ALL
    SELECT 'Sürücü — Ehliyet', d.name, 'ehliyet', d.license_expiry, DATEDIFF(d.license_expiry, CURDATE())
    FROM drivers d WHERE d.license_expiry IS NOT NULL AND d.license_expiry <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
    UNION ALL
    SELECT 'Sürücü — SRC', d.name, 'src', d.src_expiry, DATEDIFF(d.src_expiry, CURDATE())
    FROM drivers d WHERE d.src_expiry IS NOT NULL AND d.src_expiry <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
    UNION ALL
    SELECT 'Sürücü — Psikoteknik', d.name, 'psikoteknik', d.psiko_expiry, DATEDIFF(d.psiko_expiry, CURDATE())
    FROM drivers d WHERE d.psiko_expiry IS NOT NULL AND d.psiko_expiry <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
    UNION ALL
    SELECT 'Sürücü — Sağlık', d.name, 'saglik', d.health_expiry, DATEDIFF(d.health_expiry, CURDATE())
    FROM drivers d WHERE d.health_expiry IS NOT NULL AND d.health_expiry <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
    ORDER BY "Kalan Gün" ASC
    LIMIT 2000
  `).all() as ReportRow[];

  const gecmis = rows.filter(r => Number(r["Kalan Gün"]) < 0).length;

  return {
    rows,
    charts: [{ type: "bar", title: "Tür Bazlı Bekleyen Belge", series: Object.entries(
      rows.reduce((acc: Record<string, number>, r) => { const k = String(r["Tür"]); acc[k] = (acc[k] || 0) + 1; return acc; }, {})
    ).map(([l, v]) => ({ label: l, value: v })) }],
    totals: { "Toplam Kayıt": rows.length, "Süresi Geçmiş": gecmis },
  };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
const QUERY_MAP: Record<number, (c: string[], df?: string, dt?: string) => Promise<ReportResult>> = {
  1: r01_aracGiris, 2: r02_seferPerformans, 3: r03_gecikme, 4: r04_doluluk,
  5: r05_firmaOperasyon, 6: r06_firmaArac, 7: r07_girisUyum,
  8: r08_aracDenetim, 9: r09_soforDegerlendirme, 10: r10_soforSicil,
  11: r11_personelGorev, 12: r12_isGunlukleri, 13: r13_ticketAnaliz,
  14: r14_uyariIhlal, 15: r15_guzergahKullanim, 16: r16_acikGuzergah,
  17: r17_aylikOzet, 18: r18_firmaKapsamli, 19: r19_filoDurum, 20: r20_haftalikBulten,
  21: r21_hakedisTablosu, 22: r22_isletenCari, 23: r23_karZararRapor, 24: r24_mutabakatRapor, 25: r25_tahakkukRapor,
  26: r26_yakitKartRapor, 27: r27_yakitDolumRapor, 28: r28_yakitKomisyonRapor,
  29: r29_filoTopluRapor, 30: r30_aracDolulukOrani, 31: r31_belgeHatirlatma,
};

export async function runReport(id: number, companyIds: string[], dateFrom?: string, dateTo?: string, vehiclePlates?: string[]): Promise<ReportResult> {
  if (id === 1) return r01_aracGiris(companyIds, dateFrom, dateTo, vehiclePlates);
  if (id === 8) return r08_aracDenetim(companyIds, dateFrom, dateTo, vehiclePlates);
  if (id === 26) return r26_yakitKartRapor(companyIds, dateFrom, dateTo, vehiclePlates);
  if (id === 27) return r27_yakitDolumRapor(companyIds, dateFrom, dateTo, vehiclePlates);
  if (id === 29) return r29_filoTopluRapor(companyIds, dateFrom, dateTo, vehiclePlates);
  const fn = QUERY_MAP[id];
  if (!fn) throw new Error(`Rapor ${id} bulunamadı`);
  return fn(companyIds, dateFrom, dateTo);
}
