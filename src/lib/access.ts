/**
 * Role-based access helpers.
 *
 * Three roles today:
 *   - admin    → sees everything
 *   - coach    → sees only their own camps + customers in those camps
 *   - customer → sees only themselves (UI not built yet)
 *
 * The pattern is to return a Prisma `where` clause from each scope helper.
 * Pages spread that clause into their query: `where: { ...campScope(user), ... }`.
 * Admin gets `{}` (no constraint), so queries are unchanged.
 *
 * This keeps the access rules in ONE place; pages just import & spread.
 */
import type { SessionUser } from "./auth";

export type Role = "admin" | "coach" | "customer";

export function isAdmin(u: SessionUser): boolean { return u.role === "admin"; }
export function isCoach(u: SessionUser): boolean { return u.role === "coach"; }
export function isCustomer(u: SessionUser): boolean { return u.role === "customer"; }

/** Camp `where` filter: admin = all, coach = own only, customer = camps they're a member of. */
export function campScope(u: SessionUser): Record<string, unknown> {
  if (u.role === "admin") return {};
  if (u.role === "coach") return { coachId: u.id };
  if (u.role === "customer") return { members: { some: { customer: { userAccount: { id: u.id } } } } };
  return { id: "__none__" }; // unknown role → nothing
}

/** Customer `where` filter: admin = all, coach = members of own camps, customer = self. */
export function customerScope(u: SessionUser): Record<string, unknown> {
  if (u.role === "admin") return {};
  if (u.role === "coach") return { campMembers: { some: { camp: { coachId: u.id } } } };
  if (u.role === "customer") return { userAccount: { id: u.id } };
  return { id: "__none__" };
}

/** Class `where` filter: derived from campScope — classes in camps the user can see. */
export function classScope(u: SessionUser): Record<string, unknown> {
  if (u.role === "admin") return {};
  if (u.role === "coach") return { camp: { coachId: u.id } };
  if (u.role === "customer") return { roster: { some: { customer: { userAccount: { id: u.id } } } } };
  return { id: "__none__" };
}

/** Check if a coach/customer can access a specific camp record. */
export function canAccessCamp(u: SessionUser, camp: { coachId: string | null; id: string }): boolean {
  if (u.role === "admin") return true;
  if (u.role === "coach") return camp.coachId === u.id;
  // customer access checked at query level via campScope; this is an extra guard
  return false;
}

/** Check if a coach can access a specific customer record (via shared camp membership). */
export function canAccessCustomer(
  u: SessionUser,
  customer: { campMembers: { camp: { coachId: string | null } }[]; userAccount?: { id: string } | null }
): boolean {
  if (u.role === "admin") return true;
  if (u.role === "coach") return customer.campMembers.some((m) => m.camp.coachId === u.id);
  if (u.role === "customer") return customer.userAccount?.id === u.id;
  return false;
}
