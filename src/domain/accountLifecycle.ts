import { db } from "@/lib/db";
import { customerScope } from "@/lib/access";
import type { SessionUser } from "@/lib/auth";

export type LifecycleResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

export async function archiveCustomerAccount(
  actor: SessionUser,
  customerId: string,
  reason: string,
): Promise<LifecycleResult> {
  if (!customerId) return { ok: false, message: "Missing customer" };
  if (actor.role !== "admin" && actor.role !== "coach") {
    return { ok: false, message: "Only staff can archive accounts" };
  }

  const target = await db.customer.findFirst({
    where: {
      AND: [
        { id: customerId, deletedAt: null },
        customerScope(actor),
        ...(actor.role === "coach"
          ? [{ OR: [{ userAccount: null }, { userAccount: { role: "customer" } }] }]
          : []),
      ],
    },
    select: { id: true, name: true, userAccount: { select: { id: true, role: true } } },
  });
  if (!target) return { ok: false, message: "Customer not found or outside your scope" };
  if (target.userAccount?.id === actor.id) return { ok: false, message: "You cannot archive your own account" };

  if (target.userAccount?.role === "admin") {
    const activeAdmins = await db.user.count({ where: { role: "admin", deletedAt: null } });
    if (activeAdmins <= 1) return { ok: false, message: "The last admin cannot be archived" };
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: target.id },
      data: { deletedAt: now, deletedByUserId: actor.id, deleteReason: reason },
    });
    if (target.userAccount) {
      await tx.user.update({
        where: { id: target.userAccount.id },
        data: {
          deletedAt: now,
          deletedByUserId: actor.id,
          deleteReason: reason,
          sessionVersion: { increment: 1 },
        },
      });
    }
    await tx.accountAuditLog.create({
      data: {
        action: "ACCOUNT_ARCHIVED",
        actorUserId: actor.id,
        targetUserId: target.userAccount?.id,
        targetCustomerId: target.id,
        reason,
      },
    });
  });
  return { ok: true, name: target.name };
}

export async function archiveUserAccount(
  actor: SessionUser,
  userId: string,
  reason: string,
): Promise<LifecycleResult> {
  if (actor.role !== "admin") return { ok: false, message: "Admin access required" };
  if (!userId) return { ok: false, message: "Missing user" };
  if (userId === actor.id) return { ok: false, message: "You cannot archive your own account" };

  const target = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, name: true, role: true, customerId: true },
  });
  if (!target) return { ok: false, message: "User not found" };
  if (target.role === "admin") {
    const activeAdmins = await db.user.count({ where: { role: "admin", deletedAt: null } });
    if (activeAdmins <= 1) return { ok: false, message: "The last admin cannot be archived" };
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: {
        deletedAt: now,
        deletedByUserId: actor.id,
        deleteReason: reason,
        sessionVersion: { increment: 1 },
      },
    });
    if (target.customerId) {
      await tx.customer.update({
        where: { id: target.customerId },
        data: { deletedAt: now, deletedByUserId: actor.id, deleteReason: reason },
      });
    }
    await tx.accountAuditLog.create({
      data: {
        action: "ACCOUNT_ARCHIVED",
        actorUserId: actor.id,
        targetUserId: target.id,
        targetCustomerId: target.customerId,
        reason,
      },
    });
  });
  return { ok: true, name: target.name };
}

export async function restoreUserAccount(actor: SessionUser, userId: string): Promise<LifecycleResult> {
  if (actor.role !== "admin") return { ok: false, message: "Admin access required" };
  const target = await db.user.findFirst({
    where: { id: userId, deletedAt: { not: null } },
    select: { id: true, name: true, customerId: true },
  });
  if (!target) return { ok: false, message: "Archived account not found" };

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: { deletedAt: null, deletedByUserId: null, deleteReason: null, sessionVersion: { increment: 1 } },
    });
    if (target.customerId) {
      await tx.customer.update({
        where: { id: target.customerId },
        data: { deletedAt: null, deletedByUserId: null, deleteReason: null },
      });
    }
    await tx.accountAuditLog.create({
      data: {
        action: "ACCOUNT_RESTORED",
        actorUserId: actor.id,
        targetUserId: target.id,
        targetCustomerId: target.customerId,
      },
    });
  });
  return { ok: true, name: target.name };
}

export async function restoreCustomerProfile(actor: SessionUser, customerId: string): Promise<LifecycleResult> {
  if (actor.role !== "admin") return { ok: false, message: "Admin access required" };
  const target = await db.customer.findFirst({
    where: { id: customerId, deletedAt: { not: null } },
    select: { id: true, name: true, userAccount: { select: { id: true } } },
  });
  if (!target) return { ok: false, message: "Archived customer not found" };
  if (target.userAccount) return restoreUserAccount(actor, target.userAccount.id);

  await db.$transaction([
    db.customer.update({
      where: { id: target.id },
      data: { deletedAt: null, deletedByUserId: null, deleteReason: null },
    }),
    db.accountAuditLog.create({
      data: {
        action: "ACCOUNT_RESTORED",
        actorUserId: actor.id,
        targetCustomerId: target.id,
      },
    }),
  ]);
  return { ok: true, name: target.name };
}
