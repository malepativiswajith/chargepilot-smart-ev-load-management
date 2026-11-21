import { getSession } from "@/lib/auth";
import { getPool } from "@/lib/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { jsonError } from "@/lib/http";

export async function GET() {
  const user = await getSession();
  if (!user) return jsonError("Sign in required", 401);
  const dailySql = user.role === "ADMIN"
    ? "SELECT DATE(s.started_at) AS day,COUNT(*) AS sessions,COALESCE(SUM(s.energy_kwh),0) AS energy_kwh,COALESCE(SUM(s.cost_amount),0) AS cost_amount FROM charging_sessions s WHERE s.status='COMPLETED' AND s.started_at>=DATE_SUB(CURRENT_DATE,INTERVAL 13 DAY) GROUP BY DATE(s.started_at) ORDER BY day"
    : "SELECT DATE(s.started_at) AS day,COUNT(*) AS sessions,COALESCE(SUM(s.energy_kwh),0) AS energy_kwh,COALESCE(SUM(s.cost_amount),0) AS cost_amount FROM charging_sessions s JOIN charging_requests r ON r.id=s.request_id WHERE r.owner_id=? AND s.status='COMPLETED' AND s.started_at>=DATE_SUB(CURRENT_DATE,INTERVAL 13 DAY) GROUP BY DATE(s.started_at) ORDER BY day";
  const [daily] = user.role === "ADMIN" ? await getPool().execute<RowDataPacket[]>(dailySql) : await getPool().execute<RowDataPacket[]>(dailySql,[user.id]);
  const [stations] = await getPool().execute<RowDataPacket[]>("SELECT station_id,name,city,capacity_kw,active_load_kw,available_kw,utilization_pct FROM vw_station_load ORDER BY name");
  return Response.json({ daily, stations });
}
