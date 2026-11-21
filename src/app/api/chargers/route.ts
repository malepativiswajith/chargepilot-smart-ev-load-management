import { getSession } from "@/lib/auth";
import { getPool } from "@/lib/mysql";
import { jsonError } from "@/lib/http";

export async function GET() {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return jsonError("Admin access required", 403);
  const [rows] = await getPool().execute("SELECT c.id,c.name,c.status,c.max_power_kw,s.name AS station_name FROM chargers c JOIN charging_stations s ON s.id=c.station_id ORDER BY s.name,c.name");
  return Response.json({ chargers: rows });
}
