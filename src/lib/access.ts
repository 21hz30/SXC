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

// Staff (admin + coach) share one workspace: every coach and admin sees all
// camps, customers, classes and workouts. Only customers are scoped to their
// own world. `isStaff` centralises that rule.
function isStaff(u: SessionUser): boolean {
  return u.role === "admin" || u.role === "coach";
}

/** Camp `where` filter: staff = all, customer = camps they're a member of. */
export function campScope(u: SessionUser): Record<string, unknown> {
  if (isStaff(u)) return {};
  if (u.role === "customer") return { members: { some: { customer: { userAccount: { id: u.id } } } } };
  return { id: "__none__" }; // unknown role → nothing
}

/** Customer `where` filter: staff = all, customer = self. */
export function customerScope(u: SessionUser): Record<string, unknown> {
  if (isStaff(u)) return {};
  if (u.role === "customer") return { userAccount: { id: u.id } };
  return { id: "__none__" };
}

/** Class `where` filter: staff = all, customer = classes in their camps. */
export function classScope(u: SessionUser): Record<string, unknown> {
  if (isStaff(u)) return {};
  if (u.role === "customer") return { camp: { members: { some: { customer: { userAccount: { id: u.id } } } } } };
  return { id: "__none__" };
}

/** Check if a user can access a specific camp record. */
export function canAccessCamp(u: SessionUser, camp: { coachId: string | null; id: string }): boolean {
  if (isStaff(u)) return true;
  // customer access checked at query level via campScope; this is an extra guard
  return false;
}

/** Check if a user can access a specific customer record. */
export function canAccessCustomer(
  u: SessionUser,
  customer: { campMembers: { camp: { coachId: string | null } }[]; userAccount?: { id: string } | null }
): boolean {
  if (isStaff(u)) return true;
  if (u.role === "customer") return customer.userAccount?.id === u.id;
  return false;
}
