import { getSession } from "@/lib/auth";
import { inTransaction } from "@/lib/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { errorCode, jsonError } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return jsonError("Sign in required", 401);
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return jsonError("Invalid session id");
  let energyKwh = 0;
  try {
    const body = await request.json();
    if (typeof body.energyKwh === "number") energyKwh = body.energyKwh;
  } catch { /* Empty body is permitted and records zero energy. */ }
  if (!Number.isFinite(energyKwh) || energyKwh < 0 || energyKwh > 10000) return jsonError("Invalid energy value");
  try {
    const session = await inTransaction(async (connection) => {
      const [rows] = await connection.execute<RowDataPacket[]>("SELECT s.id,s.status,s.allocation_id,r.owner_id,a.charger_id,a.station_id FROM charging_sessions s JOIN charging_requests r ON r.id=s.request_id JOIN charging_allocations a ON a.id=s.allocation_id WHERE s.id=? FOR UPDATE", [id]);
      const row = rows[0];
      if (!row || (user.role !== "ADMIN" && row.owner_id !== user.id)) throw new Error("NOT_FOUND");
      if (row.status === "COMPLETED") return { id, status: "COMPLETED" };
      await connection.query("CALL sp_complete_session(?,?)", [id, energyKwh]);
      return { id, status: "COMPLETED" };
    });
    return Response.json(session);
  } catch (error: unknown) { return error instanceof Error && error.message === "NOT_FOUND" ? jsonError("Session not found", 404) : jsonError(`Could not stop session${errorCode(error) ? ` (${errorCode(error)})` : ""}`, 500); }
}
