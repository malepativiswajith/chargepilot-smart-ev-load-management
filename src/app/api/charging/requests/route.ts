import { getSession } from "@/lib/auth";
import { getPool, inTransaction } from "@/lib/mysql";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { allocatePower } from "@/lib/allocation.mjs";
import { errorCode, getJsonObject, jsonError } from "@/lib/http";

export async function GET() {
  const user = await getSession();
  if (!user) return jsonError("Sign in required", 401);
  const sql = user.role === "ADMIN"
    ? "SELECT r.id, r.status, r.requested_kw, r.created_at, u.name AS owner_name, v.registration_number, s.name AS station_name FROM charging_requests r JOIN users u ON u.id=r.owner_id JOIN vehicles v ON v.id=r.vehicle_id JOIN charging_stations s ON s.id=r.station_id ORDER BY r.created_at DESC LIMIT 100"
    : "SELECT r.id, r.status, r.requested_kw, r.created_at, v.registration_number, s.name AS station_name FROM charging_requests r JOIN vehicles v ON v.id=r.vehicle_id JOIN charging_stations s ON s.id=r.station_id WHERE r.owner_id=? ORDER BY r.created_at DESC LIMIT 100";
  const [rows] = user.role === "ADMIN" ? await getPool().execute(sql) : await getPool().execute(sql, [user.id]);
  return Response.json({ requests: rows });
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user || user.role !== "EV_OWNER") return jsonError("EV Owner access required", 403);
  let body: Record<string, unknown> | null;
  try { body = getJsonObject(await request.json()); } catch { return jsonError("Invalid JSON"); }
  const vehicleId = Number(body?.vehicleId), stationId = Number(body?.stationId), requestedKw = Number(body?.requestedKw);
  if (!Number.isSafeInteger(vehicleId) || vehicleId < 1 || !Number.isSafeInteger(stationId) || stationId < 1 || !Number.isFinite(requestedKw) || requestedKw <= 0 || requestedKw > 500) return jsonError("Choose a vehicle, station and valid power request");
  try {
    const result = await inTransaction(async (connection) => {
      const [owned] = await connection.execute<RowDataPacket[]>("SELECT id FROM vehicles WHERE id=? AND owner_id=? FOR UPDATE", [vehicleId, user.id]);
      if (!owned.length) throw new Error("VEHICLE_NOT_FOUND");
      // Serializes all station allocations. The active-load sum is read only after taking this lock.
      const [stations] = await connection.execute<RowDataPacket[]>("SELECT id, capacity_kw FROM charging_stations WHERE id=? AND status='ACTIVE' FOR UPDATE", [stationId]);
      if (!stations.length) throw new Error("STATION_NOT_FOUND");
      const [loads] = await connection.execute<RowDataPacket[]>("SELECT COALESCE(SUM(a.allocated_kw),0) AS active_kw FROM charging_allocations a JOIN charging_sessions s ON s.allocation_id=a.id WHERE a.station_id=? AND s.status='ACTIVE'", [stationId]);
      const policy = allocatePower({ capacityKw: Number(stations[0].capacity_kw), activeLoadsKw: Number(loads[0].active_kw), requestedKw });
      const [requestRow] = await connection.execute<ResultSetHeader>("INSERT INTO charging_requests(owner_id,vehicle_id,station_id,requested_kw,status) VALUES(?,?,?,?,'PENDING')", [user.id, vehicleId, stationId, requestedKw]);
      if (!policy.accepted) {
        await connection.execute("UPDATE charging_requests SET status='WAITLISTED' WHERE id=?", [requestRow.insertId]);
        return { id: requestRow.insertId, status: "WAITLISTED", allocatedKw: 0, availableKw: policy.availableKw };
      }
      const [chargers] = await connection.execute<RowDataPacket[]>("SELECT c.id,c.max_power_kw FROM chargers c WHERE c.station_id=? AND c.status='AVAILABLE' AND c.max_power_kw>0 ORDER BY (c.max_power_kw < ?) ASC,c.max_power_kw,c.id LIMIT 1 FOR UPDATE", [stationId, policy.allocatedKw]);
      if (!chargers.length) {
        await connection.execute("UPDATE charging_requests SET status='WAITLISTED' WHERE id=?", [requestRow.insertId]);
        return { id: requestRow.insertId, status: "WAITLISTED", allocatedKw: 0, availableKw: policy.availableKw };
      }
      const chargerCappedKw = Math.min(policy.allocatedKw, Number(chargers[0].max_power_kw));
      const [allocation] = await connection.execute<ResultSetHeader>("INSERT INTO charging_allocations(request_id,station_id,charger_id,allocated_kw,status) VALUES(?,?,?,?, 'ALLOCATED')", [requestRow.insertId, stationId, chargers[0].id, chargerCappedKw]);
      await connection.execute("UPDATE charging_requests SET status='ALLOCATED' WHERE id=?", [requestRow.insertId]);
      const [session] = await connection.execute<ResultSetHeader>("INSERT INTO charging_sessions(request_id,allocation_id,status,started_at) VALUES(?,?,'ACTIVE',CURRENT_TIMESTAMP)", [requestRow.insertId, allocation.insertId]);
      await connection.execute("UPDATE chargers SET status='IN_USE' WHERE id=?", [chargers[0].id]);
      return { id: requestRow.insertId, sessionId: session.insertId, status: "ALLOCATED", allocatedKw: chargerCappedKw, availableKw: policy.availableKw };
    });
    return Response.json(result, { status: result.status === "ALLOCATED" ? 201 : 202 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "VEHICLE_NOT_FOUND") return jsonError("Vehicle not found", 404);
    if (message === "STATION_NOT_FOUND") return jsonError("Station not found or inactive", 404);
    console.error("allocation failed", error);
    return jsonError(`Could not allocate charging request${errorCode(error) ? ` (${errorCode(error)})` : ""}`, 500);
  }
}
