import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CampsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requireUser();
  const { new: isNew } = await searchParams;
  const camps = await db.camp.findMany({
    orderBy: { startDate: "desc" },
    include: { members: true, classes: true, coach: true },
  });
  const coaches = await db.user.findMany({ where: { role: { in: ["admin", "coach"] } }, orderBy: { name: "asc" } });

  async function createCamp(formData: FormData) {
    "use server";
    await requireUser();
    const camp = await db.camp.create({
      data: {
        name: String(formData.get("name") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim() || null,
        startDate: new Date(String(formData.get("startDate"))),
        endDate: new Date(String(formData.get("endDate"))),
        coachId: String(formData.get("coachId") ?? "") || null,
      },
    });
    revalidatePath("/camps");
    redirect(`/camps/${camp.id}`);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Camps</h1>
          <div className="text-sm text-muted mt-1">{camps.length} programs</div>
        </div>
        <Link href="/camps?new=1" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium flex items-center gap-2 hover:opacity-90">
          <Plus size={16} /> New camp
        </Link>
      </header>

      {isNew && (
        <form action={createCamp} className="bg-card border border-border rounded-xl p-6 mb-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5">Name</label>
            <input name="name" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <textarea name="description" rows={2} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Start date</label>
            <input name="startDate" type="date" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">End date</label>
            <input name="endDate" type="date" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5">Coach</label>
            <select name="coachId" className="w-full rounded-lg border border-border px-3 py-2 text-sm">
              <option value="">— unassigned —</option>
              {coaches.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
            </select>
          </div>
          <div className="col-span-2 flex gap-2 justify-end">
            <Link href="/camps" className="px-4 py-2 text-sm rounded-lg border border-border">Cancel</Link>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-foreground text-white">Create</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-2 gap-4">
        {camps.map((c) => (
          <Link key={c.id} href={`/camps/${c.id}`} className="bg-card border border-border rounded-xl p-5 hover:border-accent transition">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold">{c.name}</div>
                <div className="text-sm text-muted mt-0.5">{c.description}</div>
              </div>
              <div className="text-xs text-muted">{c.coach?.name ?? "Unassigned"}</div>
            </div>
            <div className="flex gap-6 mt-4 text-sm text-muted">
              <div>📅 {formatDate(c.startDate)} → {formatDate(c.endDate)}</div>
              <div>👥 {c.members.length} members</div>
              <div>🏋️ {c.classes.length} classes</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
