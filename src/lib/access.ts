/**
 * Role-based access helpers (multi-tenant).
 *
 * Three roles:
 *   - admin    → cross-tenant superuser; sees everything
 *   - coach    → scoped to their OWN tenant/ownership: their tenant's workout
 *                library, the camps they run, the customers connected to them,
 *                and the classes in their camps. A coach in tenant A never sees
 *                tenant B's data (and vice-versa).
 *   - customer → sees only their own world (their profile, their camps, the
 *                classes in those camps + drop-ins they can apply to).
 *
 * The pattern is to return a Prisma `where` clause from each scope helper.
 * Pages spread that clause into their query: `where: { ...campScope(user), ... }`.
 * Admin gets `{}` (no constraint), so admin queries are unchanged.
 *
 * This keeps the access rules in ONE place; pages just import & spread.
 */
import type { SessionUser } from "./auth";

export type Role = "admin" | "coach" | "customer";

export function isAdmin(u: SessionUser): boolean { return u.role === "admin"; }
export function isCoach(u: SessionUser): boolean { return u.role === "coach"; }
export function isCustomer(u: SessionUser): boolean { return u.role === "customer"; }

/**
 * Workout-library `where` filter (the shared, non-private side — callers still
 * pair this with `ownerCustomerId: null`). Admin = every tenant's library;
 * coach = only their own tenant's. A tenant-less coach (shouldn't happen post
 * backfill) matches nothing rather than leaking another team's workouts.
 */
export function workoutScope(u: SessionUser): Record<string, unknown> {
  if (isAdmin(u)) return { ownerCustomerId: null };
  if (u.role === "coach") return { ownerCustomerId: null, tenantId: u.tenantId ?? "__none__" };
  return { id: "__none__" };
}

/**
 * Camp `where` filter.
 *   admin    → all camps
 *   coach    → camps they coach or created
 *   customer → camps they're a member of (used where a customer manages, NOT
 *              where they browse-to-apply — that view stays unscoped on purpose)
 */
export function campScope(u: SessionUser): Record<string, unknown> {
  if (isAdmin(u)) return {};
  if (u.role === "coach") return { OR: [{ coachId: u.id }, { createdById: u.id }] };
  if (u.role === "customer") return { members: { some: { customer: { userAccount: { id: u.id } } } } };
  return { id: "__none__" }; // unknown role → nothing
}

/**
 * Customer `where` filter.
 *   admin    → all customers
 *   coach    → customers connected to them (active) OR in a camp they run
 *   customer → self
 */
export function customerScope(u: SessionUser): Record<string, unknown> {
  if (isAdmin(u)) return {};
  if (u.role === "coach")
    return {
      OR: [
        { coachConnections: { some: { coachUserId: u.id, status: "active" } } },
        { campMembers: { some: { camp: { coachId: u.id } } } },
      ],
    };
  if (u.role === "customer") return { userAccount: { id: u.id } };
  return { id: "__none__" };
}

/**
 * `where` fragment that keeps only "real" athletes out of the staff. Admins and
 * coaches have their own profile (so their Profile page works) but belong on
 * the Team page, not in the Customers list. A profile counts as non-staff when
 * it has no login or its login is a customer-role account.
 */
export function nonStaffCustomerWhere(): Record<string, unknown> {
  return { OR: [{ userAccount: null }, { userAccount: { role: "customer" } }] };
}

/**
 * Class `where` filter.
 *   admin    → all classes
 *   coach    → classes in a camp they coach/created, or that they created
 *              directly (standalone classes)
 *   customer → their camps' classes PLUS any drop-in (to discover & apply)
 */
export function classScope(u: SessionUser): Record<string, unknown> {
  if (isAdmin(u)) return {};
  if (u.role === "coach")
    return {
      OR: [
        { camp: { coachId: u.id } },
        { camp: { createdById: u.id } },
        { createdById: u.id },
      ],
    };
  if (u.role === "customer")
    return {
      OR: [
        { camp: { members: { some: { customer: { userAccount: { id: u.id } } } } } },
        { dropInAllowed: true },
      ],
    };
  return { id: "__none__" };
}

/**
 * Can this user open a specific camp record (direct-URL guard)?
 *   admin → any; coach → only a camp they coach/created; customer → handled at
 *   the query level (this returns false for them as an extra guard).
 * `createdById` is optional because some callers don't load it — the coachId
 * check still holds.
 */
export function canAccessCamp(u: SessionUser, camp: { coachId: string | null; createdById?: string | null; id: string }): boolean {
  if (isAdmin(u)) return true;
  if (u.role === "coach") return camp.coachId === u.id || camp.createdById === u.id;
  return false;
}

/**
 * Can this user open a specific customer profile (direct-URL guard)?
 *   admin → any
 *   anyone → their OWN linked profile (so a coach/athlete can see themselves)
 *   coach → an athlete actively connected to them, or in a camp they run
 *   customer → only self (covered by the own-profile check above)
 */
export function canAccessCustomer(
  u: SessionUser,
  customer: {
    campMembers: { camp: { coachId: string | null } }[];
    coachConnections?: { coachUserId: string; status: string }[];
    userAccount?: { id: string } | null;
  }
): boolean {
  if (isAdmin(u)) return true;
  if (customer.userAccount?.id === u.id) return true; // your own profile, any role
  if (u.role === "coach")
    return (
      // Active connection, OR a pending request the athlete sent to THIS coach
      // (they entered this coach's code — consent-based, lets the coach vet
      // them before approving), OR a member of a camp this coach runs.
      (customer.coachConnections ?? []).some((cc) => cc.coachUserId === u.id && (cc.status === "active" || cc.status === "pending")) ||
      customer.campMembers.some((cm) => cm.camp.coachId === u.id)
    );
  return false;
}
