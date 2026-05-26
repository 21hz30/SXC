import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { categoryLabel } from "@/domain/exercises";

export const dynamic = "force-dynamic";

export default async function WorkoutsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  const workouts = await db.workout.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      items: { orderBy: { order: "asc" }, take: 6 },
      classes: { include: { class: { select: { startsAt: true } } } },
      camps: { include: { camp: true } },
    },
  });
  const camps = await db.camp.findMany({ orderBy: { name: "asc" } });

  async function createWorkout(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    if (!name) redirect("/workouts");
    const w = await db.workout.create({
      data: { name, description: String(formData.get("description") ?? "").trim() || null },
    });
    const campId = String(formData.get("campId") ?? "");
    if (campId) await db.workoutCamp.create({ data: { workoutId: w.id, campId } });
    revalidatePath("/workouts");
    redirect(`/workouts/${w.id}`);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Workouts</h1>
          <div className="text-sm text-muted mt-1">{workouts.length} templates</div>
        </div>
        <Link href="/workouts?new=1" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium flex items-center gap-2 hover:opacity-90">
          <Plus size={16} /> New workout
        </Link>
      </header>

      {isNew && (
        <form action={createWorkout} className="bg-card border border-border rounded-xl p-6 mb-6 space-y-4">
          <div><label className="block text-sm font-medium mb-1.5">Name</label><input name="name" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Description</label><input name="description" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Assign to camp (optional)</label>
            <select name="campId" className="w-full rounded-lg border border-border px-3 py-2 text-sm">
              <option value="">— none —</option>
              {camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="text-xs text-muted">You&apos;ll add exercises on the next screen.</div>
          <div className="flex justify-end gap-2">
            <Link href="/workouts" className="px-4 py-2 text-sm rounded-lg border border-border">Cancel</Link>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-foreground text-white">Create &amp; edit</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {workouts.map((w) => {
          const lastUsed = w.classes
            .map((cw) => cw.class.startsAt)
            .sort((a, b) => b.getTime() - a.getTime())[0];
          const itemSummary = w.items.map((i) => categoryLabel(i.category)).slice(0, 6).join(" · ");
          return (
            <Link key={w.id} href={`/workouts/${w.id}`} className="block bg-card border border-border rounded-xl p-5 hover:border-accent transition">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-lg font-semibold">{w.name}</div>
                  {w.description && <div className="text-sm text-muted mt-0.5">{w.description}</div>}
                </div>
                <div className="text-right text-xs text-muted shrink-0">
                  <div>{w.items.length} exercises</div>
                  <div>{w.classes.length} classes</div>
                  <div>{lastUsed ? `last: ${formatDate(lastUsed)}` : "never used"}</div>
                </div>
              </div>
              {itemSummary && (
                <div className="text-xs text-muted mt-3 truncate">
                  {itemSummary}{w.items.length > 6 ? " …" : ""}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(w.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                  <span key={t} className="text-xs bg-accent/10 text-accent rounded-full px-2 py-0.5">{t}</span>
                ))}
                {w.camps.map((wc) => (
                  <span key={wc.id} className="text-xs bg-background border border-border rounded-full px-2 py-0.5">
                    {wc.camp.name}
                  </span>
                ))}
              </div>
            </Link>
          );
        })}
        {workouts.length === 0 && (
          <div className="text-center text-sm text-muted py-10 bg-card border border-border border-dashed rounded-xl">
            No workouts yet — tap &quot;New workout&quot; to start.
          </div>
        )}
      </div>
    </div>
  );
}
