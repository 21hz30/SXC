import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAccount, AccountError } from "@/domain/accounts";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import PasswordInput from "@/components/PasswordInput";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { flashUrl } from "@/lib/flash";

export const dynamic = "force-dynamic";

export default async function CoachesPage({ searchParams }: { searchParams: Promise<{ new?: string; error?: string }> }) {
  await requireAdmin();
  const { new: isNew, error } = await searchParams;
  const users = await db.user.findMany({ orderBy: { createdAt: "desc" }, include: { camps: true } });

  async function createCoach(formData: FormData) {
    "use server";
    await requireAdmin();
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim() || null;
    const role = String(formData.get("role") ?? "coach") === "admin" ? "admin" : "coach";
    if (!username || !name) redirect("/coaches?new=1&error=missing");
    // Username = login name: English letters and numbers only.
    if (!/^[a-z0-9]{3,}$/.test(username)) redirect("/coaches?new=1&error=username");
    // Same password policy as registration: 8+ chars, a letter and a number.
    const passwordOk = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
    if (!passwordOk) redirect("/coaches?new=1&error=weak");
    // Staff are athletes too: createAccount makes the login + a linked profile.
    try {
      await createAccount({ username, password, name, email, role });
    } catch (e) {
      if (e instanceof AccountError) redirect("/coaches?new=1&error=duplicate");
      throw e;
    }
    revalidatePath("/coaches");
    redirect(flashUrl("/coaches", `${name} added as ${role}`));
  }

  async function deleteUser(formData: FormData) {
    "use server";
    await requireAdmin();
    const userId = String(formData.get("userId"));
    const removed = await db.user.delete({ where: { id: userId } });
    revalidatePath("/coaches");
    redirect(flashUrl("/coaches", `${removed.name} removed`));
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Team</h1>
          <div className="text-sm text-muted mt-1">Admin only · {users.length} {users.length === 1 ? "user" : "users"}</div>
        </div>
        <Link href="/coaches?new=1" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium flex items-center gap-2 hover:opacity-90">
          <Plus size={16} /> Add user
        </Link>
      </header>

      {isNew && (
        <form action={createCoach} className="bg-card border border-border rounded-xl p-6 mb-6 grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1.5">Full name</label><input name="name" required placeholder="e.g. Maya Rodríguez" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Username <span className="text-accent font-semibold">· login name</span></label>
            <input name="username" required pattern="[A-Za-z0-9]{3,}" minLength={3} title="English letters and numbers only — no spaces or special characters." placeholder="e.g. mayarod" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div><label className="block text-sm font-medium mb-1.5">Email <span className="text-muted font-normal">(optional)</span></label><input name="email" type="email" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Role</label>
            <select name="role" defaultValue="coach" className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm">
              <option value="coach">Coach</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5">Password</label>
            <PasswordInput
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              pattern="(?=.*[A-Za-z])(?=.*\d).{8,}"
              title="At least 8 characters, with one letter and one number."
            />
            <p className="mt-1.5 text-xs text-muted">At least 8 characters, mixing letters and numbers.</p>
          </div>
          {error && <div className="col-span-2 text-sm text-red-600">{error === "duplicate" ? "Username already in use." : error === "username" ? "Username must be English letters and numbers only (at least 3, no spaces or symbols)." : error === "weak" ? "Password must be at least 8 characters and include a letter and a number." : "Missing fields."}</div>}
          <div className="col-span-2 flex justify-end gap-2">
            <Link href="/coaches" className="px-4 py-2 text-sm rounded-lg border border-border">Cancel</Link>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-foreground text-white">Create</button>
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
                <td className="px-5 py-3 capitalize"><span className={`text-xs px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{u.role}</span></td>
                <td className="px-5 py-3 text-muted tabular-nums">{u.camps.length}</td>
                <td className="px-5 py-3 text-muted text-xs">{formatDate(u.createdAt)}</td>
                <td className="px-5 py-3 text-right">
                  <form action={deleteUser}>
                    <input type="hidden" name="userId" value={u.id} />
                    <ConfirmSubmit message={`Delete the account for ${u.name} (${u.username})? This cannot be undone.`} className="text-xs text-muted hover:text-red-600">Remove</ConfirmSubmit>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
