import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { createAccount, AccountError } from "@/domain/accounts";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import PasswordInput from "@/components/PasswordInput";
import AccountForm from "@/components/AccountForm";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { flashUrl } from "@/lib/flash";

export const dynamic = "force-dynamic";

export default async function CoachesPage({ searchParams }: { searchParams: Promise<{ new?: string; edit?: string; error?: string }> }) {
  await requireAdmin();
  const { new: isNew, edit, error } = await searchParams;
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      camps: true,
      customer: { select: { email: true } },
    },
  });
  const editingUser = edit ? users.find((u) => u.id === edit) ?? null : null;

  // Same flow as adding a customer — staff are athletes too, with a full profile
  // — only the role differs (admin/coach).
  async function createCoach(formData: FormData) {
    "use server";
    await requireAdmin();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) redirect("/coaches?new=1&error=name");
    const email = String(formData.get("email") ?? "").trim() || null;
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const tags = String(formData.get("tags") ?? "").trim() || null;
    const role = String(formData.get("role") ?? "coach") === "admin" ? "admin" : "coach";
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    if (!/^[a-z0-9]{3,}$/.test(username)) redirect("/coaches?new=1&error=username");
    if (!(password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password))) redirect("/coaches?new=1&error=weak");
    if (await db.user.findUnique({ where: { username } })) redirect("/coaches?new=1&error=dupuser");
    if (phone) {
      const dupePhone = await db.customer.findFirst({ where: { phone } });
      if (dupePhone) redirect("/coaches?new=1&error=phone");
    }
    const c = await db.customer.create({
      data: {
        name, email, phone, tags,
        age: Number(formData.get("age")) || null,
        weightKg: Number(formData.get("weightKg")) || null,
        heightCm: Number(formData.get("heightCm")) || null,
      },
    });
    try {
      await createAccount({ username, password, name, role, email, customerId: c.id });
    } catch (e) {
      await db.customer.delete({ where: { id: c.id } }).catch(() => {});
      if (e instanceof AccountError) redirect("/coaches?new=1&error=dupuser");
      throw e;
    }
    revalidatePath("/coaches");
    redirect(flashUrl("/coaches", `${name} added as ${role}`));
  }

  async function updateUser(formData: FormData) {
    "use server";
    await requireAdmin();
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
      select: { customerId: true, name: true },
    });
    if (!existing) redirect("/coaches");

    const userData: {
      username: string;
      name: string;
      role: string;
      passwordHash?: string;
    } = { username, name, role };
    if (password) userData.passwordHash = await hashPassword(password);

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
    });

    revalidatePath("/coaches");
    redirect(flashUrl("/coaches", `${existing.name} updated`));
  }

  async function deleteUser(formData: FormData) {
    "use server";
    await requireAdmin();
    const userId = String(formData.get("userId"));
    // Remove the whole person: the login AND their linked athlete profile, so
    // they no longer appear anywhere (e.g. a camp's "add member" picker). The
    // profile's related rows (camp memberships, assignments, …) cascade.
    const u = await db.user.findUnique({ where: { id: userId }, select: { name: true, customerId: true } });
    await db.user.delete({ where: { id: userId } });
    if (u?.customerId) await db.customer.delete({ where: { id: u.customerId } }).catch(() => {});
    revalidatePath("/coaches");
    revalidatePath("/customers");
    redirect(flashUrl("/coaches", `${u?.name ?? "User"} removed`));
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
        <table className="w-full text-sm">
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
                    <form action={deleteUser}>
                      <input type="hidden" name="userId" value={u.id} />
                      <ConfirmSubmit message={`Delete the account for ${u.name} (${u.username})? This cannot be undone.`} className="text-xs text-muted hover:text-red-600">Remove</ConfirmSubmit>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
