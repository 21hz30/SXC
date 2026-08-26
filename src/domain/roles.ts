/**
 * Role changes that carry multi-tenant invariants. Promoting to coach isn't a
 * bare `role = "coach"` write — a working coach also needs a **tenant** (drives
 * their workout-library scope) and a unique **invitation code** (to onboard
 * athletes). Centralising it here keeps every promote path (Team page, customer
 * profile panel) correct and identical.
 */
import { db } from "@/lib/db";
import { mintInvitationCode } from "@/lib/invitationCode";

export type PromoteResult =
  | { ok: true; code: string; tenantName: string }
  | { ok: false; message: string };

/**
 * Promote a user account to coach in the given tenant: sets role + tenant and
 * mints a fresh invitation code. Retries on the (astronomically unlikely) code
 * collision (Prisma P2002); any other error surfaces immediately.
 */
export async function promoteUserToCoach(userId: string, tenantId: string, actorUserId?: string): Promise<PromoteResult> {
  if (!userId) return { ok: false, message: "Missing user" };
  if (!tenantId) return { ok: false, message: "Pick a tenant first" };
  const [user, tenant] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { username: true, role: true, tenantId: true, customerId: true, deletedAt: true } }),
    db.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, name: true } }),
  ]);
  if (!user || user.deletedAt) return { ok: false, message: "User not found" };
  if (!tenant) return { ok: false, message: "Tenant not found" };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = mintInvitationCode(tenant.slug, user.username);
    try {
      await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { role: "coach", tenantId, invitationCode: code } });
        await tx.accountAuditLog.create({
          data: {
            action: "ROLE_CHANGED",
            actorUserId,
            targetUserId: userId,
            targetCustomerId: user.customerId,
            metadataJson: JSON.stringify({ from: user.role, to: "coach", fromTenantId: user.tenantId, toTenantId: tenantId }),
          },
        });
      });
      return { ok: true, code, tenantName: tenant.name };
    } catch (e) {
      // Only a duplicate invitation code is worth retrying with a fresh code.
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  return { ok: false, message: "Could not mint a unique code — try again" };
}
