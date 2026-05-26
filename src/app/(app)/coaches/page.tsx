import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CoachesPage({ searchParams }: { searchParams: Promise<{ new?: string; error?: string }> }) {
  await requireAdmin();
  const { new: isNew, error } = await searchParams;
  const users = await db.user.findMany({ orderBy: { createdAt: "desc" }, include: { camps: true } });

  async function createCoach(formData: FormData) {
    "use server";
    await requireAdmin();
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const role = String(formData.get("role") ?? "coach") as "admin" | "coach";
    if (!username || !password || !name) redirect("/coaches?new=1&error=missing");
    const existing = await db.user.findUnique({ where: { username } });
    if (existing) redirect("/coaches?new=1&error=duplicate");
    await db.user.create({ data: { username, name, role, passwordHash: await hashPassword(password) } });
    revalidatePath("/coaches");
    redirect("/coaches");
  }

  async function deleteUser(formData: FormData) {
    "use server";
    await requireAdmin();
    const userId = String(formData.get("userId"));
    await db.user.delete({ where: { id: userId } });
    revalidatePath("/coaches");
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Coaches</h1>
          <div className="text-sm text-muted mt-1">Admin only · {users.length} users</div>
        </div>
        <Link href="/coaches?new=1" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium flex items-center gap-2 hover:opacity-90">
          <Plus size={16} /> Add user
        </Link>
      </header>

      {isNew && (
        <form action={createCoach} className="bg-card border border-border rounded-xl p-6 mb-6 grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1.5">Full name</label><input name="name" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Username</label><input name="username" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Password</label><input name="password" type="password" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Role</label>
            <select name="role" className="w-full rounded-lg border border-border px-3 py-2 text-sm">
              <option value="coach">Coach</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <div className="col-span-2 text-sm text-red-600">{error === "duplicate" ? "Username already in use." : "Missing fields."}</div>}
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
                    <button type="submit" className="text-xs text-muted hover:text-red-600">Remove</button>
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
