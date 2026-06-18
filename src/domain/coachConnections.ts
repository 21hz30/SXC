/**
 * Customer ↔ Coach connections — the single place that creates, approves, and
 * declines `CustomerCoach` rows, so the status/source/approved-field invariants
 * live in ONE spot instead of being hand-set across four route files.
 *
 * Three ways a connection is born:
 *   - athlete enters a coach's invitation code  → pending  / source "code"
 *     (at signup, or from their profile's "My coaches")
 *   - a coach adds the athlete directly         → active   / source "coach_added"
 *   - (future) an in-app coach picker request   → pending  / source "request"
 *
 * Domain functions own the RULES and the DB write; callers (server actions) map
 * the returned result to their own redirect / flash UX.
 */
import { db } from "@/lib/db";

export type CoachByCode = { id: string; name: string; customerId: string | null };

/**
 * Validate an invitation code and return the coach it belongs to, or null.
 * Codes are uppercased to match how they're minted. Admins have no code, so a
 * non-coach match is rejected.
 */
export async function findCoachByCode(rawCode: string): Promise<CoachByCode | null> {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) return null;
  const coach = await db.user.findUnique({
    where: { invitationCode: code },
    select: { id: true, name: true, role: true, customerId: true },
  });
  if (!coach || coach.role !== "coach") return null;
  return { id: coach.id, name: coach.name, customerId: coach.customerId };
}

export type ConnectByCodeResult =
  | { ok: true; coachName: string }
  | { ok: false; reason: "empty" | "notFound" | "self" | "exists"; message: string };

/**
 * An athlete requests a connection to a coach via the coach's invitation code.
 * Creates a PENDING row the coach later approves. Blocks self-coaching and any
 * existing (re-)connection. Pure rules + write — the caller handles redirects.
 */
export async function connectByCode(customerId: string, rawCode: string): Promise<ConnectByCodeResult> {
  if (!(rawCode ?? "").trim()) return { ok: false, reason: "empty", message: "Enter a code" };
  const coach = await findCoachByCode(rawCode);
  if (!coach) return { ok: false, reason: "notFound", message: "That code didn't match any coach" };
  // Block self-coaching — but only when the coach actually has a linked athlete
  // profile, so two null ids never collide into a false "that's your own code".
  if (coach.customerId && coach.customerId === customerId) return { ok: false, reason: "self", message: "That's your own code" };

  const existing = await db.customerCoach.findUnique({
    where: { customerId_coachUserId: { customerId, coachUserId: coach.id } },
    select: { status: true },
  });
  if (existing) {
    const what = existing.status === "active" ? "already connected" : existing.status === "pending" ? "already pending" : "previously rejected";
    return { ok: false, reason: "exists", message: `Coach ${coach.name}: ${what}` };
  }

  await db.customerCoach.create({ data: { customerId, coachUserId: coach.id, status: "pending", source: "code" } });
  return { ok: true, coachName: coach.name };
}

/**
 * A coach adds an athlete directly — an immediately-active connection (the coach
 * is the one adding, so there's nothing to approve). Tolerates a duplicate
 * (unique-violation P2002); surfaces any other error so a real failure doesn't
 * silently hide the athlete the coach just created.
 */
export async function addCoachAddedConnection(customerId: string, coachUserId: string): Promise<void> {
  await db.customerCoach
    .create({ data: { customerId, coachUserId, status: "active", source: "coach_added", approvedAt: new Date(), approvedById: coachUserId } })
    .catch((e) => {
      if ((e as { code?: string }).code !== "P2002") throw e;
    });
}

export type DecideResult = { ok: boolean; message: string };

/**
 * A staff member approves or declines a pending connection request. A coach may
 * only act on their OWN requests; an admin may act on any. Approve flips the row
 * to active (recording the approver); decline DELETES it so the athlete can
 * re-request later rather than being stuck in a hidden "rejected" state.
 */
export async function decideConnection(
  actor: { id: string; role: string },
  connId: string,
  decision: "approve" | "decline",
): Promise<DecideResult> {
  if (!connId) return { ok: false, message: "Missing request" };
  const conn = await db.customerCoach.findUnique({ where: { id: connId }, select: { coachUserId: true, status: true } });
  if (!conn || conn.status !== "pending") return { ok: false, message: "That request was already handled" };
  if (actor.role === "coach" && conn.coachUserId !== actor.id) {
    return { ok: false, message: `That request isn't yours to ${decision}` };
  }
  try {
    if (decision === "approve") {
      await db.customerCoach.update({ where: { id: connId }, data: { status: "active", approvedAt: new Date(), approvedById: actor.id } });
      return { ok: true, message: "Athlete connected" };
    }
    await db.customerCoach.delete({ where: { id: connId } });
    return { ok: true, message: "Request declined" };
  } catch (e) {
    // Lost a race — another staffer handled this request between our read and
    // write. Prisma raises P2025 (record to update/delete not found). Report it
    // gracefully instead of 500-ing.
    if ((e as { code?: string }).code === "P2025") return { ok: false, message: "That request was already handled" };
    throw e;
  }
}
