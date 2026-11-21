import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

export type Role = "ADMIN" | "EV_OWNER";
export type SessionUser = { id: number; name: string; email: string; role: Role };
const COOKIE = "chargepilot_session";
const secret = () => {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return new TextEncoder().encode(value);
};

export async function setSession(user: SessionUser) {
  const token = await new SignJWT({ ...user }).setProtectedHeader({ alg: "HS256" })
    .setIssuedAt().setExpirationTime("12h").sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 12,
  });
}

export async function clearSession() { (await cookies()).delete(COOKIE); }

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.id !== "number" || typeof payload.name !== "string" || typeof payload.email !== "string" ||
      (payload.role !== "ADMIN" && payload.role !== "EV_OWNER")) return null;
    return { id: payload.id, name: payload.name, email: payload.email, role: payload.role };
  } catch { return null; }
}

export async function requireSession(role?: Role) {
  const user = await getSession();
  if (!user || (role && user.role !== role)) return null;
  return user;
}
