import { compare } from "bcryptjs";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/mysql";
import { getJsonObject, jsonError } from "@/lib/http";
import { setSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: Record<string, unknown> | null;
  try { body = getJsonObject(await request.json()); } catch { return jsonError("Invalid JSON"); }
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password || email.length > 254 || password.length > 200) return jsonError("Email and password are required");
  try {
    const [rows] = await getPool().execute<RowDataPacket[]>("SELECT id, name, email, role, password_hash FROM users WHERE email = ? AND is_active = 1 LIMIT 1", [email]);
    const account = rows[0];
    if (!account || !(await compare(password, account.password_hash))) return jsonError("Invalid email or password", 401);
    await setSession({ id: account.id, name: account.name, email: account.email, role: account.role });
    return Response.json({ user: { id: account.id, name: account.name, email: account.email, role: account.role } });
  } catch (error) {
    console.error("login failed", error);
    return jsonError("Database is unavailable. Check the setup instructions.", 503);
  }
}
