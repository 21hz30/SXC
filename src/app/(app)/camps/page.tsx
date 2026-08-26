import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff, requireUser , getMyCustomerId } from "@/lib/auth";
import { campScope } from "@/lib/access";
import { formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import { flashUrl } from "@/lib/flash";

export const dynamic = "force-dynamic";

export default async function CampsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireUser();
  const isStaff = user.role === "admin" || user.role === "coach";
  const { new: isNew } = await searchParams;
  // Staff see the camps they own (admin = all); customers still browse EVERY
  // camp so they can discover and apply (their membership badge is added below).
  // Camps, the coach list (admin), and the customer's memberships in parallel.
  const myCustomerId = isStaff ? null : await getMyCustomerId();
  const [camps, coaches, myMemberships] = await Promise.all([
    db.camp.findMany({
      where: isStaff ? campScope(user) : {},
      orderBy: { startDate: "desc" },
      // Only counts + the two names are rendered — don't hydrate every member /
      // class row (and two full coach rows) per camp.
      include: {
        _count: { select: { members: true, classes: true } },
        coach: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    user.role === "admin"
      ? db.user.findMany({ where: { role: { in: ["admin", "coach"] }, deletedAt: null }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    myCustomerId
      ? db.campMember.findMany({ where: { customerId: myCustomerId }, select: { campId: true, status: true } })
      : Promise.resolve([]),
  ]);

  // For a customer, map campId → their membership status (active | pending).
  const myStatus = new Map<string, string>(myMemberships.map((m) => [m.campId, m.status]));

  async function createCamp(formData: FormData) {
    "use server";
    const u = await requireStaff();
    // Admins may pick a coach; coaches always auto-own their own camp.
    const pickedCoachId = String(formData.get("coachId") ?? "") || null;
    const coachId = u.role === "admin" ? pickedCoachId : u.id;
    const camp = await db.camp.create({
      data: {
        name: String(formData.get("name") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim() || null,
        division: (String(formData.get("division") ?? "open") === "pro" ? "pro" : "open"),
        startDate: new Date(String(formData.get("startDate"))),
        endDate: new Date(String(formData.get("endDate"))),
        coachId,
        createdById: u.id,
      },
    });
    revalidatePath("/camps");
    redirect(flashUrl(`/camps/${camp.id}`, `Camp "${camp.name}" created`));
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Camps</h1>
          <div className="text-sm text-muted mt-1">{camps.length} programs</div>
        </div>
        {isStaff && (
          <Link href="/camps?new=1" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium flex items-center gap-2 hover:opacity-90">
            <Plus size={16} /> New camp
          </Link>
        )}
      </header>

      {isStaff && isNew && (
        <form action={createCamp} className="bg-card border border-border rounded-xl p-6 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5">Name</label>
            <input name="name" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <textarea name="description" rows={2} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Type</label>
            <select name="division" defaultValue="open" className="w-full rounded-lg border border-border px-3 py-2 text-sm">
              <option value="open">Open</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Start date</label>
            <input name="startDate" type="date" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">End date</label>
              <input name="endDate" type="date" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div />
          </div>
          {user.role === "admin" && (
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5">Coach</label>
              <select name="coachId" className="w-full rounded-lg border border-border px-3 py-2 text-sm">
                <option value="">— unassigned —</option>
                {coaches.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
              </select>
            </div>
          )}
          <div className="col-span-2 flex gap-2 justify-end">
            <Link href="/camps" className="px-4 py-2 text-sm rounded-lg border border-border">Cancel</Link>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-foreground text-white">Create</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {camps.map((c) => (
          <Link key={c.id} href={`/camps/${c.id}`} className="bg-card border border-border rounded-xl p-5 hover:border-accent transition">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-lg font-semibold">{c.name}</div>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${c.division === "pro" ? "bg-accent/10 text-accent" : "bg-zinc-100 text-zinc-600"}`}>
                    {c.division === "pro" ? "Pro" : "Open"}
                  </span>
                  {!isStaff && myStatus.get(c.id) === "active" && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700">Member</span>
                  )}
                  {!isStaff && myStatus.get(c.id) === "pending" && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-amber-100 text-amber-700">Applied</span>
                  )}
                </div>
                <div className="text-sm text-muted mt-0.5">{c.description}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted">Coach: {c.coach?.name ?? "Unassigned"}</div>
                <div className="text-[11px] text-muted mt-0.5">Created by {c.createdBy?.name ?? "—"}</div>
              </div>
            </div>
            <div className="flex gap-6 mt-4 text-sm text-muted">
              <div>📅 {formatDate(c.startDate)} → {formatDate(c.endDate)}</div>
              <div>👥 {c._count.members} members</div>
              <div>🏋️ {c._count.classes} classes</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
