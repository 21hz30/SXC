import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { createAccount, AccountError } from "@/domain/accounts";
import { promoteUserToCoach } from "@/domain/roles";
import { Plus, ShieldPlus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import PasswordInput from "@/components/PasswordInput";
import AccountForm from "@/components/AccountForm";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { flashUrl } from "@/lib/flash";
import { archiveUserAccount, restoreUserAccount } from "@/domain/accountLifecycle";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export default async function CoachesPage({ searchParams }: { searchParams: Promise<{ new?: string; edit?: string; error?: string }> }) {
  await requireAdmin();
  const { new: isNew, edit, error } = await searchParams;
  const [users, archivedUsers, tenants] = await Promise.all([
    db.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        camps: true,
        customer: { select: { email: true } },
      },
    }),
    db.user.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: { id: true, name: true, username: true, role: true, deletedAt: true, deleteReason: true },
    }),
    // Tenants power the per-row "Promote to coach" action (which team a new
    // coach joins). With a single tenant the choice is implicit (one click).
    db.tenant.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);
  const editingUser = edit ? users.find((u) => u.id === edit) ?? null : null;

  // Same flow as adding a customer — staff are athletes too, with a full profile
  // — only the role differs (admin/coach).
  async function createCoach(formData: FormData) {
    "use server";
    const actor = await requireAdmin();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) redirect("/coaches?new=1&error=name");
    const email = String(formData.get("email") ?? "").trim() || null;
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const phoneNormalized = phone ? normalizePhone(phone) : null;
    const tags = String(formData.get("tags") ?? "").trim() || null;
    const role = String(formData.get("role") ?? "coach") === "admin" ? "admin" : "coach";
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    if (!/^[a-z0-9]{3,}$/.test(username)) redirect("/coaches?new=1&error=username");
    if (!(password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password))) redirect("/coaches?new=1&error=weak");
    if (phone && !phoneNormalized) redirect("/coaches?new=1&error=phone");
    if (await db.user.findUnique({ where: { username } })) redirect("/coaches?new=1&error=dupuser");
    if (phone) {
      const dupePhone = await db.customer.findFirst({ where: { phoneNormalized } });
      if (dupePhone) redirect("/coaches?new=1&error=phone");
    }
    const c = await db.customer.create({
      data: {
        name, email, phone, phoneNormalized, tags,
        age: Number(formData.get("age")) || null,
        weightKg: Number(formData.get("weightKg")) || null,
        heightCm: Number(formData.get("heightCm")) || null,
      },
    });
    let newUserId: string;
    try {
      const res = await createAccount({ username, password, name, role, email, customerId: c.id, actorUserId: actor.id });
      newUserId = res.userId;
    } catch (e) {
      await db.customer.delete({ where: { id: c.id } }).catch(() => {});
      if (e instanceof AccountError) redirect("/coaches?new=1&error=dupuser");
      throw e;
    }
    // A new coach needs a tenant + invitation code to be usable (createAccount
    // only sets the role). Assign the default tenant + mint a code — same as the
    // per-row "Promote to coach" button. (Admins span tenants, so no link.)
    if (role === "coach") {
      const tenantId = (await db.tenant.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
      if (tenantId) await promoteUserToCoach(newUserId, tenantId, actor.id);
    }
    revalidatePath("/coaches");
    redirect(flashUrl("/coaches", `${name} added as ${role}`));
  }

  async function updateUser(formData: FormData) {
    "use server";
    const actor = await requireAdmin();
    const userId = String(formData.get("userId") ?? "");
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim() || null;
    const roleRaw = String(formData.get("role") ?? "coach");
    const role = roleRaw === "admin" || roleRaw === "customer" ? roleRaw : "coach";
    if (!userId || !username || !name) redirect(`/coaches?edit=${encodeURIComponent(userId)}&error=missing`);
    if (!/^[a-z0-9]{3,}$/.test(username)) redirect(`/coaches?edit=${encodeURIComponent(userId)}&error=username`);
    if (password) {
      const passwordOk = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
      if (!passwordOk) redirect(`/coaches?edit=${encodeURIComponent(userId)}&error=weak`);
    }
    const taken = await db.user.findFirst({
      where: { username, NOT: { id: userId } },
      select: { id: true },
    });
    if (taken) redirect(`/coaches?edit=${encodeURIComponent(userId)}&error=duplicate`);

    const existing = await db.user.findUnique({
      where: { id: userId },
      select: { customerId: true, name: true, role: true, tenantId: true, invitationCode: true, deletedAt: true },
    });
    if (!existing || existing.deletedAt) redirect("/coaches");

    // Picking "Coach" in this dialog needs a tenant + invitation code, which a
    // bare role write can't supply (the dialog has no tenant picker — that's the
    // per-row "Promote to coach" button). So when promoting to coach we DON'T
    // write the role here; promoteUserToCoach sets role + tenant + code together
    // below, and we surface its result. Existing coaches (already have a code)
    // take the normal path so editing their name never re-mints.
    const promotingToCoach = role === "coach" && !existing.invitationCode;

    const userData: {
      username: string;
      name: string;
      role?: string;
      passwordHash?: string;
      sessionVersion?: { increment: number };
    } = { username, name, ...(promotingToCoach ? {} : { role }) };
    if (password) {
      userData.passwordHash = await hashPassword(password);
      userData.sessionVersion = { increment: 1 };
    }

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: userData,
      });
      if (existing.customerId) {
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { name, email },
        });
      }
      if (!promotingToCoach && existing.role !== role) {
        await tx.accountAuditLog.create({
          data: {
            action: "ROLE_CHANGED",
            actorUserId: actor.id,
            targetUserId: userId,
            targetCustomerId: existing.customerId,
            metadataJson: JSON.stringify({ from: existing.role, to: role }),
          },
        });
      }
      if (password) {
        await tx.accountAuditLog.create({
          data: {
            action: "PASSWORD_CHANGED_BY_ADMIN",
            actorUserId: actor.id,
            targetUserId: userId,
            targetCustomerId: existing.customerId,
          },
        });
      }
    });

    if (promotingToCoach) {
      const tenantId = existing.tenantId ?? (await db.tenant.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
      if (!tenantId) redirect(flashUrl("/coaches", "Create a tenant before adding a coach"));
      const res = await promoteUserToCoach(userId, tenantId, actor.id);
      if (!res.ok) redirect(flashUrl("/coaches", res.message));
    }

    revalidatePath("/coaches");
    redirect(flashUrl("/coaches", `${existing.name} updated`));
  }

  async function archiveUser(formData: FormData) {
    "use server";
    const actor = await requireAdmin();
    const userId = String(formData.get("userId"));
    const result = await archiveUserAccount(actor, userId, "Archived from Team management");
    if (!result.ok) redirect(flashUrl("/coaches", result.message));
    revalidatePath("/coaches");
    revalidatePath("/customers");
    redirect(flashUrl("/coaches", `${result.name} archived`));
  }

  async function restoreUser(formData: FormData) {
    "use server";
    const actor = await requireAdmin();
    const result = await restoreUserAccount(actor, String(formData.get("userId") ?? ""));
    if (!result.ok) redirect(flashUrl("/coaches", result.message));
    revalidatePath("/coaches");
    revalidatePath("/customers");
    redirect(flashUrl("/coaches", `${result.name} restored`));
  }

  // Promote a customer-role user to coach: assigns the tenant + mints their
  // invitation code (shared logic with the customer-profile panel).
  async function promoteToCoach(formData: FormData) {
    "use server";
    const actor = await requireAdmin();
    const userId = String(formData.get("userId") ?? "");
    const tenantId = String(formData.get("tenantId") ?? "");
    // This button is offered for customer rows only — re-check server-side so a
    // forged/stale form can't target a coach or admin (which would demote them).
    const target = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (target?.role !== "customer") {
      redirect(flashUrl("/coaches", "Only customers can be promoted here"));
    }
    const res = await promoteUserToCoach(userId, tenantId, actor.id);
    revalidatePath("/coaches");
    revalidatePath("/customers");
    redirect(flashUrl("/coaches", res.ok ? `Promoted to coach in ${res.tenantName} — code ${res.code}` : res.message));
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Team</h1>
          <div className="text-sm text-muted mt-1">Admin only · {users.length} {users.length === 1 ? "user" : "users"}</div>
        </div>
        <Link href="/coaches?new=1" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium flex items-center gap-2 hover:opacity-90">
          <Plus size={16} /> Add user
        </Link>
      </header>

      {isNew && <AccountForm action={createCoach} error={error} showRole cancelHref="/coaches" submitLabel="Create user" />}

      {editingUser && (
        <form action={updateUser} className="bg-card border border-border rounded-xl p-6 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input type="hidden" name="userId" value={editingUser.id} />
          <div><label className="block text-sm font-medium mb-1.5">Full name</label><input name="name" required defaultValue={editingUser.name} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Username <span className="text-accent font-semibold">· login name</span></label>
            <input name="username" required defaultValue={editingUser.username} pattern="[A-Za-z0-9]{3,}" minLength={3} title="English letters and numbers only — no spaces or special characters." className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div><label className="block text-sm font-medium mb-1.5">Email <span className="text-muted font-normal">(optional)</span></label><input name="email" type="email" defaultValue={editingUser.customer?.email ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Role</label>
            <select name="role" defaultValue={editingUser.role} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm">
              <option value="customer">Customer</option>
              <option value="coach">Coach</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5">New password <span className="text-muted font-normal">(optional)</span></label>
            <PasswordInput
              name="password"
              autoComplete="new-password"
              minLength={8}
              pattern="(?=.*[A-Za-z])(?=.*\d).{8,}"
              title="At least 8 characters, with one letter and one number."
            />
            <p className="mt-1.5 text-xs text-muted">Leave blank to keep the current password.</p>
          </div>
          {error && <div className="col-span-2 text-sm text-red-600">{error === "duplicate" ? "Username already in use." : error === "username" ? "Username must be English letters and numbers only (at least 3, no spaces or symbols)." : error === "weak" ? "Password must be at least 8 characters and include a letter and a number." : "Missing fields."}</div>}
          <div className="col-span-2 flex justify-end gap-2">
            <Link href="/coaches" className="px-4 py-2 text-sm rounded-lg border border-border">Cancel</Link>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-foreground text-white">Save changes</button>
          </div>
        </form>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-background text-muted">
            <tr className="text-left">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Username</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Camps</th>
              <th className="px-5 py-3 font-medium">Created</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium">{u.name}</td>
                <td className="px-5 py-3 text-muted">{u.username}</td>
                <td className="px-5 py-3 capitalize"><span className={`text-xs px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-purple-100 text-purple-700" : u.role === "coach" ? "bg-blue-100 text-blue-700" : "bg-zinc-200 text-zinc-700"}`}>{u.role}</span></td>
                <td className="px-5 py-3 text-muted tabular-nums">{u.camps.length}</td>
                <td className="px-5 py-3 text-muted text-xs">{formatDate(u.createdAt)}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/coaches?edit=${u.id}`} className="text-xs text-muted hover:text-foreground">Edit</Link>
                    {/* Promote-to-coach: customer rows only. One click when there's
                        a single tenant; a compact picker when there are several. */}
                    {u.role === "customer" && tenants.length > 0 && (
                      <form action={promoteToCoach} className="flex items-center gap-1">
                        <input type="hidden" name="userId" value={u.id} />
                        {tenants.length === 1 ? (
                          <input type="hidden" name="tenantId" value={tenants[0].id} />
                        ) : (
                          <select name="tenantId" defaultValue={tenants[0].id} aria-label="Tenant for new coach" className="text-xs rounded border border-border bg-white px-1 py-0.5 max-w-[7rem]">
                            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        )}
                        <ConfirmSubmit
                          message={`Promote ${u.name} to coach${tenants.length === 1 ? ` in ${tenants[0].name}` : ""}? They'll get their own invitation code to onboard athletes.`}
                          className="text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap inline-flex items-center gap-1"
                        >
                          <ShieldPlus size={13} /> Promote to coach
                        </ConfirmSubmit>
                      </form>
                    )}
                    <form action={archiveUser}>
                      <input type="hidden" name="userId" value={u.id} />
                      <ConfirmSubmit message={`Archive ${u.name} (${u.username})? Their login will be disabled and an admin can restore it.`} className="text-xs text-muted hover:text-red-600">Archive</ConfirmSubmit>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {archivedUsers.length > 0 && (
        <section className="mt-8 border-t border-border pt-6">
          <h2 className="text-base font-semibold">Archived accounts</h2>
          <div className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {archivedUsers.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{u.name} <span className="font-normal text-muted">({u.username})</span></div>
                  <div className="text-xs text-muted">
                    {u.role} · {u.deletedAt ? formatDate(u.deletedAt) : "Archived"}{u.deleteReason ? ` · ${u.deleteReason}` : ""}
                  </div>
                </div>
                <form action={restoreUser}>
                  <input type="hidden" name="userId" value={u.id} />
                  <button type="submit" className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-background">Restore</button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
