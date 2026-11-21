import { getSession } from "@/lib/auth";
import { getPool } from "@/lib/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { getMongoDb } from "@/lib/mongo";
import { getJsonObject, jsonError } from "@/lib/http";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return jsonError("Sign in required", 401);
  const chargerId = Number(new URL(request.url).searchParams.get("chargerId"));
  if (!Number.isSafeInteger(chargerId) || chargerId < 1) return jsonError("Invalid charger id");
  const [access] = await getPool().execute<RowDataPacket[]>(user.role === "ADMIN"
    ? "SELECT id FROM chargers WHERE id=?"
    : "SELECT c.id FROM chargers c JOIN charging_allocations a ON a.charger_id=c.id JOIN charging_requests r ON r.id=a.request_id WHERE c.id=? AND r.owner_id=?",
    user.role === "ADMIN" ? [chargerId] : [chargerId, user.id]);
  if (!access.length) return jsonError("Charger not found", 404);
  const db = await getMongoDb();
  const readings = await db.collection("telemetry").find({ chargerId }).sort({ recordedAt: -1 }).limit(100).toArray();
  return Response.json({ readings });
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return jsonError("Admin access required", 403);
  let body: Record<string, unknown> | null;
  try { body = getJsonObject(await request.json()); } catch { return jsonError("Invalid JSON"); }
  const chargerId = Number(body?.chargerId), powerKw = Number(body?.powerKw), voltage = Number(body?.voltage), currentA = Number(body?.currentA), soc = Number(body?.stateOfCharge);
  if (![chargerId, powerKw, voltage, currentA, soc].every(Number.isFinite) || !Number.isSafeInteger(chargerId) || chargerId < 1 || powerKw < 0 || powerKw > 500 || voltage < 0 || voltage > 1000 || currentA < 0 || currentA > 1000 || soc < 0 || soc > 100) return jsonError("Telemetry values are outside allowed ranges");
  const [chargers] = await getPool().execute<RowDataPacket[]>("SELECT id, station_id FROM chargers WHERE id=?", [chargerId]);
  if (!chargers.length) return jsonError("Charger not found", 404);
  const db = await getMongoDb();
  const record = { chargerId, stationId: chargers[0].station_id, powerKw, voltage, currentA, stateOfCharge: soc, recordedAt: new Date() };
  const result = await db.collection("telemetry").insertOne(record);
  return Response.json({ id: result.insertedId.toString() }, { status: 201 });
}
