import { getSession } from "@/lib/auth";
import { getPool } from "@/lib/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { getMongoDb } from "@/lib/mongo";
import { jsonError } from "@/lib/http";

export async function GET() {
  const user = await getSession();
  if (!user) return jsonError("Sign in required", 401);
  const pool = getPool();
  const [summary] = await pool.execute<RowDataPacket[]>("SELECT (SELECT COUNT(*) FROM charging_stations WHERE status='ACTIVE') AS stations, (SELECT COUNT(*) FROM chargers) AS chargers, (SELECT COUNT(*) FROM charging_sessions WHERE status='ACTIVE') AS active_sessions, (SELECT COALESCE(SUM(allocated_kw),0) FROM charging_allocations WHERE status='ALLOCATED') AS active_load_kw, (SELECT COALESCE(SUM(energy_kwh),0) FROM charging_sessions WHERE DATE(started_at)=CURRENT_DATE) AS today_kwh");
  const [stations] = await pool.execute<RowDataPacket[]>("SELECT s.id,s.name,s.city,s.capacity_kw,COALESCE(SUM(CASE WHEN cs.status='ACTIVE' THEN a.allocated_kw ELSE 0 END),0) AS active_kw FROM charging_stations s LEFT JOIN charging_allocations a ON a.station_id=s.id LEFT JOIN charging_sessions cs ON cs.allocation_id=a.id GROUP BY s.id ORDER BY s.name");
  let recentTelemetry: Record<string, unknown>[] = [];
  try {
    const db = await getMongoDb();
    recentTelemetry = await db.collection("telemetry").aggregate([
      { $sort: { recordedAt: -1 } }, { $group: { _id: "$chargerId", latest: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$latest" } }, { $sort: { recordedAt: -1 } }, { $limit: 8 },
      { $project: { _id: 0, chargerId: 1, powerKw: 1, stateOfCharge: 1, recordedAt: 1 } },
    ]).toArray();
  } catch { /* SQL dashboard remains usable when telemetry has not been initialized. */ }
  return Response.json({ summary: summary[0], stations, recentTelemetry });
}
