import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";

const COOKIE = "sxc_session";
export const SESSION_COOKIE = COOKIE;

export type Role = "admin" | "coach" | "customer";
export type SessionUser = { id: string; username: string; name: string; role: Role };

function sign(value: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev-secret";
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function makeToken(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function decodeToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, ts, sig] = parts;
  const expected = sign(`${userId}.${ts}`);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return userId;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const userId = decodeToken(jar.get(COOKIE)?.value);
  if (!userId) return null;
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) return null;
  return { id: u.id, username: u.username, name: u.name, role: u.role as Role };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

// Single-role model for now: any logged-in user has full access.
// These aliases stay so existing call sites compile; they're effectively
// `requireUser` until we re-introduce role distinctions.
export async function requireAdmin(): Promise<SessionUser> {
  return requireUser();
}

export async function requireCoach(): Promise<SessionUser> {
  return requireUser();
}

export async function login(username: string, password: string): Promise<SessionUser | null> {
  const u = await db.user.findUnique({ where: { username } });
  if (!u) return null;
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) return null;
  const jar = await cookies();
  jar.set(COOKIE, makeToken(u.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { id: u.id, username: u.username, name: u.name, role: u.role as Role };
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
