import { getSession } from "@/lib/auth";
import { getPool, inTransaction } from "@/lib/mysql";
import type { ResultSetHeader } from "mysql2/promise";
import { errorCode, getJsonObject, jsonError } from "@/lib/http";

export async function GET() {
  const user = await getSession();
  if (!user) return jsonError("Sign in required", 401);
  const [rows] = await getPool().execute("SELECT s.id,s.name,s.city,s.address,s.capacity_kw,s.status,COUNT(c.id) AS charger_count FROM charging_stations s LEFT JOIN chargers c ON c.station_id=s.id WHERE s.status='ACTIVE' GROUP BY s.id ORDER BY s.city,s.name");
  return Response.json({ stations: rows });
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return jsonError("Admin access required", 403);
  let body: Record<string, unknown> | null;
  try { body = getJsonObject(await request.json()); } catch { return jsonError("Invalid JSON"); }
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const city = typeof body?.city === "string" ? body.city.trim() : "";
  const capacityKw = Number(body?.capacityKw), chargerCount = Number(body?.chargerCount), maxPowerKw = Number(body?.maxPowerKw);
  if (!name || !address || !city || name.length > 120 || address.length > 255 || city.length > 100 || !Number.isFinite(capacityKw) || capacityKw <= 0 || capacityKw > 5000 || !Number.isSafeInteger(chargerCount) || chargerCount < 1 || chargerCount > 40 || !Number.isFinite(maxPowerKw) || maxPowerKw < 1 || maxPowerKw > capacityKw) return jsonError("Enter a valid station, capacity and charger configuration");
  try {
    const id = await inTransaction(async (connection) => {
      const [station] = await connection.execute<ResultSetHeader>("INSERT INTO charging_stations(name,address,city,capacity_kw) VALUES(?,?,?,?)", [name,address,city,capacityKw]);
      for (let index=1; index<=chargerCount; index++) {
        await connection.execute("INSERT INTO chargers(station_id,name,max_power_kw) VALUES(?,?,?)", [station.insertId,`Charger ${String(index).padStart(2,"0")}`,maxPowerKw]);
      }
      return station.insertId;
    });
    return Response.json({ id }, { status: 201 });
  } catch (error:unknown) { return jsonError(errorCode(error) === "ER_DUP_ENTRY" ? "A station with that name and address already exists" : "Could not create station", errorCode(error) === "ER_DUP_ENTRY" ? 409 : 500); }
}
