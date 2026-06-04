import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { categoryLabel } from "@/domain/exercises";
import { cloneWorkout } from "@/domain/workouts";
import { getMyCustomerId, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkoutsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireUser();
  const isStaff = user.role === "admin" || user.role === "coach";
  const { new: isNew } = await searchParams;

  // Staff see the whole shared library. A customer sees ONLY workouts they
  // built for themselves — the coach library is not shared with athletes.
  const myCustomerId = isStaff ? null : await getMyCustomerId();
  const where = isStaff ? { ownerCustomerId: null } : { ownerCustomerId: myCustomerId };

  const workouts = await db.workout.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      items: { orderBy: { order: "asc" }, take: 6 },
      classes: { include: { class: { select: { startsAt: true } } } },
    },
  });

  async function createWorkout(formData: FormData) {
    "use server";
    const u = await requireUser();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) redirect("/workouts");
    // Staff create shared (library) workouts; a customer creates a private one
    // owned by themselves.
    let ownerCustomerId: string | null = null;
    if (u.role === "customer") {
      ownerCustomerId = await getMyCustomerId();
      if (!ownerCustomerId) redirect("/profile");
    }
    const w = await db.workout.create({
      data: { name, description: String(formData.get("description") ?? "").trim() || null, ownerCustomerId },
    });
    revalidatePath("/workouts");
    redirect(`/workouts/${w.id}`);
  }

  // Clone a workout (with its exercises) and open the copy to tweak — handy for
  // making a "pro" variant of an "open" workout (more rounds, less rest).
  async function duplicateWorkout(formData: FormData) {
    "use server";
    const u = await requireUser();
    const workoutId = String(formData.get("workoutId") ?? "");
    if (!workoutId) redirect("/workouts");
    const w = await db.workout.findUnique({ where: { id: workoutId }, select: { ownerCustomerId: true } });
    const staff = u.role === "admin" || u.role === "coach";
    const mine = staff ? null : await getMyCustomerId();
    const ok = w && (staff ? w.ownerCustomerId === null : w.ownerCustomerId === mine);
    if (!ok) redirect("/workouts");
    const copy = await cloneWorkout({ user: u }, workoutId);
    revalidatePath("/workouts");
    redirect(`/workouts/${copy.id}`);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{isStaff ? "Workouts" : "My workouts"}</h1>
          <div className="text-sm text-muted mt-1">
            {isStaff ? `${workouts.length} templates` : `${workouts.length} of your own workouts`}
          </div>
        </div>
        <Link href="/workouts?new=1" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium flex items-center gap-2 hover:opacity-90">
          <Plus size={16} /> New workout
        </Link>
      </header>

      {isNew && (
        <form action={createWorkout} className="bg-card border border-border rounded-xl p-6 mb-6 space-y-4">
          <div><label className="block text-sm font-medium mb-1.5">Name</label><input name="name" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Description</label><input name="description" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div className="text-xs text-muted">You&apos;ll add exercises on the next screen.{isStaff ? " Assign it to classes from the camp page." : " It's private to you — use it to track your own training."}</div>
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
            <div key={w.id} className="block bg-card border border-border rounded-xl p-5 hover:border-accent transition">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link href={`/workouts/${w.id}`} className="text-lg font-semibold hover:text-accent">{w.name}</Link>
                  {w.description && <div className="text-sm text-muted mt-0.5">{w.description}</div>}
                </div>
                <div className="flex items-start gap-3 shrink-0">
                  <div className="text-right text-xs text-muted">
                    <div>{w.items.length} exercises</div>
                    <div>{w.classes.length} classes</div>
                    <div>{lastUsed ? `last: ${formatDate(lastUsed)}` : "never used"}</div>
                  </div>
                  <form action={duplicateWorkout}>
                    <input type="hidden" name="workoutId" value={w.id} />
                    <button type="submit" className="text-xs rounded-lg border border-border px-2.5 py-1 text-muted hover:text-accent hover:border-accent">Duplicate</button>
                  </form>
                </div>
              </div>
              {itemSummary && (
                <Link href={`/workouts/${w.id}`} className="block text-xs text-muted mt-3 truncate hover:text-accent">
                  {itemSummary}{w.items.length > 6 ? " …" : ""}
                </Link>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(w.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                  <span key={t} className="text-xs bg-accent/10 text-accent rounded-full px-2 py-0.5">{t}</span>
                ))}
              </div>
            </div>
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
