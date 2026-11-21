import { getSession } from "@/lib/auth";
import { getPool } from "@/lib/mysql";
import { jsonError } from "@/lib/http";

export async function GET() {
  const user = await getSession();
  if (!user) return jsonError("Sign in required", 401);
  const sql = user.role === "ADMIN"
    ? "SELECT s.id,s.status,s.started_at,s.ended_at,s.energy_kwh,s.cost_amount,v.registration_number,st.name AS station_name,u.name AS owner_name FROM charging_sessions s JOIN charging_requests r ON r.id=s.request_id JOIN users u ON u.id=r.owner_id JOIN vehicles v ON v.id=r.vehicle_id JOIN charging_allocations a ON a.id=s.allocation_id JOIN charging_stations st ON st.id=a.station_id ORDER BY s.started_at DESC LIMIT 100"
    : "SELECT s.id,s.status,s.started_at,s.ended_at,s.energy_kwh,s.cost_amount,v.registration_number,st.name AS station_name FROM charging_sessions s JOIN charging_requests r ON r.id=s.request_id JOIN vehicles v ON v.id=r.vehicle_id JOIN charging_allocations a ON a.id=s.allocation_id JOIN charging_stations st ON st.id=a.station_id WHERE r.owner_id=? ORDER BY s.started_at DESC LIMIT 100";
  const [rows] = user.role === "ADMIN" ? await getPool().execute(sql) : await getPool().execute(sql,[user.id]);
  return Response.json({ sessions: rows });
}
