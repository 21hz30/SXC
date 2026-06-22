import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";

const COOKIE = "sxc_session";
export const SESSION_COOKIE = COOKIE;

export type Role = "admin" | "coach" | "customer";
// `tenantId` is the coach's team (null for admins — they're cross-tenant — and
// for customers, who are app-wide). It drives multi-tenant query scoping in
// `lib/access.ts`, so it travels on every session user.
export type SessionUser = { id: string; username: string; name: string; role: Role; tenantId: string | null };

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

export type Account = SessionUser & { customerId: string | null; onboardedAt: Date | null; phone: string | null };

// One cached account lookup per request. The layout, each page's requireUser,
// nested guard helpers, and the many "what's my customerId?" lookups all funnel
// through this, so a single render hits the users table exactly once.
export const getAccount = cache(async function getAccount(): Promise<Account | null> {
  const jar = await cookies();
  const userId = decodeToken(jar.get(COOKIE)?.value);
  if (!userId) return null;
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, name: true, role: true, tenantId: true, customerId: true, customer: { select: { onboardedAt: true, phone: true } } },
  });
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role as Role,
    tenantId: u.tenantId,
    customerId: u.customerId,
    onboardedAt: u.customer?.onboardedAt ?? null,
    phone: u.customer?.phone ?? null,
  };
});

export async function getSessionUser(): Promise<SessionUser | null> {
  const a = await getAccount();
  return a ? { id: a.id, username: a.username, name: a.name, role: a.role, tenantId: a.tenantId } : null;
}

/** The signed-in user's linked customer id (cached). */
export async function getMyCustomerId(): Promise<string | null> {
  return (await getAccount())?.customerId ?? null;
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

/**
 * Role gates. The customer role is read-mostly: it can view shared pages but
 * not run staff mutations, so staff-only actions/pages funnel through these.
 *
 *   requireUser  → any logged-in account (viewing pages everyone can see)
 *   requireStaff → admin or coach (manage camps, classes, workouts, athletes)
 *   requireAdmin → admin only (team, standards, prompts)
 *
 * A blocked customer is bounced to "/profile" (always accessible to them),
 * never to a page they also can't see — so there's no redirect loop.
 */
export async function requireStaff(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin" && u.role !== "coach") redirect("/profile");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/profile");
  return u;
}

/**
 * @deprecated Historical name for "staff" — kept so the many existing call
 * sites that guard mutations keep blocking customers. Prefer `requireStaff`.
 */
export async function requireCoach(): Promise<SessionUser> {
  return requireStaff();
}

export async function login(username: string, password: string): Promise<SessionUser | null> {
  // Usernames are stored lowercase (the create-account form enforces it), so
  // accept any case + whitespace from the user (e.g. "Peter" matches "peter").
  // Passwords stay case-sensitive — security best practice.
  const u = await db.user.findUnique({ where: { username: username.trim().toLowerCase() } });
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
  return { id: u.id, username: u.username, name: u.name, role: u.role as Role, tenantId: u.tenantId };
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
