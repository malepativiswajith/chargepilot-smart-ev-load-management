import { getSession } from "@/lib/auth";
import { getPool } from "@/lib/mysql";
import type { ResultSetHeader } from "mysql2/promise";
import { errorCode, getJsonObject, jsonError } from "@/lib/http";

export async function GET() {
  const user = await getSession();
  if (!user) return jsonError("Sign in required", 401);
  const [rows] = await getPool().execute("SELECT id, make, model, registration_number, battery_capacity_kwh FROM vehicles WHERE owner_id = ? ORDER BY created_at DESC", [user.id]);
  return Response.json({ vehicles: rows });
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user || user.role !== "EV_OWNER") return jsonError("EV Owner access required", 403);
  let body: Record<string, unknown> | null;
  try { body = getJsonObject(await request.json()); } catch { return jsonError("Invalid JSON"); }
  const make = typeof body?.make === "string" ? body.make.trim() : "";
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  const plate = typeof body?.registrationNumber === "string" ? body.registrationNumber.trim().toUpperCase() : "";
  const capacity = Number(body?.batteryCapacityKwh);
  if (!make || !model || !plate || make.length > 80 || model.length > 80 || plate.length > 20 || !Number.isFinite(capacity) || capacity < 5 || capacity > 500) return jsonError("Enter a valid vehicle and battery capacity (5–500 kWh)");
  try {
    const [result] = await getPool().execute<ResultSetHeader>("INSERT INTO vehicles(owner_id, make, model, registration_number, battery_capacity_kwh) VALUES (?, ?, ?, ?, ?)", [user.id, make, model, plate, capacity]);
    return Response.json({ id: result.insertId }, { status: 201 });
  } catch (error: unknown) { return jsonError(errorCode(error) === "ER_DUP_ENTRY" ? "That registration is already registered" : "Could not save vehicle", errorCode(error) === "ER_DUP_ENTRY" ? 409 : 500); }
}
