import { getSession } from "@/lib/auth";
import { getPool } from "@/lib/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { jsonError } from "@/lib/http";

function csv(value: unknown) {
  const text = String(value ?? "").replace(/^[=+\-@]/, "'$&").replace(/"/g, '""');
  return `"${text}"`;
}

export async function GET() {
  const user = await getSession();
  if (!user) return jsonError("Sign in required", 401);
  const sql = user.role === "ADMIN"
    ? "SELECT session_id,owner_name,registration_number,station_name,charger_name,status,started_at,ended_at,energy_kwh,cost_amount FROM vw_session_billing ORDER BY started_at DESC"
    : "SELECT s.id AS session_id,u.name AS owner_name,v.registration_number,st.name AS station_name,c.name AS charger_name,s.status,s.started_at,s.ended_at,s.energy_kwh,s.cost_amount FROM charging_sessions s JOIN charging_requests r ON r.id=s.request_id JOIN users u ON u.id=r.owner_id JOIN vehicles v ON v.id=r.vehicle_id JOIN charging_allocations a ON a.id=s.allocation_id JOIN charging_stations st ON st.id=a.station_id JOIN chargers c ON c.id=a.charger_id WHERE r.owner_id=? ORDER BY s.started_at DESC";
  const [rows] = user.role === "ADMIN" ? await getPool().execute<RowDataPacket[]>(sql) : await getPool().execute<RowDataPacket[]>(sql,[user.id]);
  const fields = ["session_id","owner_name","registration_number","station_name","charger_name","status","started_at","ended_at","energy_kwh","cost_amount"] as const;
  const output = [fields.join(","),...rows.map(row=>fields.map(field=>csv(row[field])).join(","))].join("\r\n");
  return new Response(output,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=chargepilot-sessions.csv","Cache-Control":"private, no-store"}});
}
