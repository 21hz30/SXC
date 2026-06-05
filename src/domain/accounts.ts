/**
 * Account creation — the single place that creates a login (`User`) together
 * with its athlete profile (`Customer`) and links them.
 *
 * Everyone in SXC is an athlete: admins and coaches train too. So every
 * account, whatever its role, gets exactly one linked profile.
 *
 * Email-match rule: if a customer signs up with an email a coach already put
 * on an unlinked profile, we attach to that existing profile so they inherit
 * their roster / benchmarks / reports instead of becoming a duplicate. No
 * match → a fresh profile is created.
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export type Role = "admin" | "coach" | "customer";

export class AccountError extends Error {}

export async function createAccount(input: {
  username: string;
  password: string;
  name?: string;
  role: Role;
  email?: string | null;
  /** Link the login to an already-created profile instead of making a new one. */
  customerId?: string;
}): Promise<{ userId: string; customerId: string }> {
  const username = input.username.trim().toLowerCase();
  const name = (input.name ?? username).trim() || username;
  const email = input.email?.trim() || null;

  // Login name: English letters and numbers only, no spaces or symbols.
  if (!/^[a-z0-9]{3,}$/.test(username)) {
    throw new AccountError("Username must be English letters and numbers only (no spaces or symbols).");
  }
  const taken = await db.user.findUnique({ where: { username } });
  if (taken) throw new AccountError("That username is already taken.");

  // Link to a provided profile; else try to adopt an unlinked one by email.
  let customerId: string | null = input.customerId ?? null;
  if (!customerId && email) {
    const existing = await db.customer.findFirst({
      where: { email, userAccount: null },
      select: { id: true },
    });
    if (existing) customerId = existing.id;
  }

  if (!customerId) {
    const created = await db.customer.create({
      data: { name, email },
      select: { id: true },
    });
    customerId = created.id;
  }

  const user = await db.user.create({
    data: {
      username,
      name,
      role: input.role,
      passwordHash: await hashPassword(input.password),
      customerId,
    },
    select: { id: true },
  });

  return { userId: user.id, customerId };
}
