/**
 * Account creation — the single place that creates a login (`User`) together
 * with its athlete profile (`Customer`) and links them.
 *
 * Everyone in SXC is an athlete: admins and coaches train too. So every
 * account, whatever its role, gets exactly one linked profile.
 *
 * Phone-match rule: if a customer signs up with a phone number a coach already
 * put on an unlinked profile, we attach to that existing profile so they inherit
 * their roster / benchmarks / reports instead of becoming a duplicate. No
 * match → a fresh profile is created.
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { isUniqueConstraintError, normalizePhone } from "@/lib/phone";

export type Role = "admin" | "coach" | "customer";

export class AccountError extends Error {}

export async function createAccount(input: {
  username: string;
  password: string;
  name?: string;
  role: Role;
  email?: string | null;
  phone?: string | null;
  /** Link the login to an already-created profile instead of making a new one. */
  customerId?: string;
  actorUserId?: string;
  tenantId?: string | null;
  invitationCode?: string | null;
}): Promise<{ userId: string; customerId: string }> {
  const username = input.username.trim().toLowerCase();
  const name = (input.name ?? username).trim() || username;
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;
  const phoneNormalized = phone ? normalizePhone(phone) : null;

  // Login name: English letters and numbers only, no spaces or symbols.
  if (!/^[a-z0-9]{3,}$/.test(username)) {
    throw new AccountError("Username must be English letters and numbers only (no spaces or symbols).");
  }
  if (phone && !phoneNormalized) throw new AccountError("Enter a valid phone number.");
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.$transaction(async (tx) => {
      // Link to a caller-provided profile; else adopt an unlinked one a coach
      // pre-made for this phone. Keep profile selection/creation in the same
      // transaction as the login so a concurrent uniqueness conflict cannot
      // leave an orphaned Customer behind.
      let customerId = input.customerId ?? null;
      if (customerId) {
        const available = await tx.customer.findFirst({
          where: { id: customerId, deletedAt: null, userAccount: null },
          select: { id: true },
        });
        if (!available) throw new AccountError("That customer profile is not available.");
      } else if (phoneNormalized) {
        const existing = await tx.customer.findFirst({
          where: { phoneNormalized, deletedAt: null, userAccount: null },
          select: { id: true },
        });
        customerId = existing?.id ?? null;
      }

      if (!customerId) {
        const createdCustomer = await tx.customer.create({
          data: { name, email, phone, phoneNormalized },
          select: { id: true },
        });
        customerId = createdCustomer.id;
      }

      const created = await tx.user.create({
        data: {
          username,
          name,
          role: input.role,
          passwordHash,
          customerId,
          tenantId: input.tenantId ?? null,
          invitationCode: input.invitationCode ?? null,
        },
        select: { id: true },
      });
      await tx.accountAuditLog.create({
        data: {
          action: "ACCOUNT_CREATED",
          actorUserId: input.actorUserId,
          targetUserId: created.id,
          targetCustomerId: customerId,
        },
      });
      return { userId: created.id, customerId };
    });
  } catch (error) {
    if (error instanceof AccountError) throw error;
    if (isUniqueConstraintError(error)) throw new AccountError("That username or phone is already used.");
    throw error;
  }
}
