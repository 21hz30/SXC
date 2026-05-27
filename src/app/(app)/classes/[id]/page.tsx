import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatTime, formatDate } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import { formatItem } from "@/domain/exercises";
import { requireUser } from "@/lib/auth";
import { listPerformance } from "@/domain/performance";
import PerformanceTable, { type Exercise } from "@/components/PerformanceTable";
import ClassWorkoutEditor from "@/components/ClassWorkoutEditor";

export const dynamic = "force-dynamic";

export default async function ClassDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const cls = await db.class.findUnique({
    where: { id },
    include: {
      workouts: {
        orderBy: { order: "asc" },
        include: { workout: { include: { items: { orderBy: { order: "asc" } } } } },
      },
      roster: { include: { customer: true }, orderBy: { customer: { name: "asc" } } },
      camp: true,
    },
  });
  if (!cls) notFound();

  // Candidates to add to the roster: camp members (if this class belongs to a
  // camp) otherwise all customers, excluding anyone already rostered.
  const rosteredIds = new Set(cls.roster.map((r) => r.customerId));
  const candidates = cls.campId
    ? (
        await db.campMember.findMany({
          where: { campId: cls.campId },
          include: { customer: { select: { id: true, name: true } } },
          orderBy: { customer: { name: "asc" } },
        })
      ).map((m) => m.customer)
    : await db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const rosterCandidates = candidates.filter((c) => !rosteredIds.has(c.id));

  const performances = await listPerformance({ user }, id);
  // Flatten all exercises across the class's workouts for the per-exercise log
  const exercises: Exercise[] = cls.workouts.flatMap((cw) =>
    cw.workout.items.map((it) => {
      const { title, details } = formatItem(it as never);
      return { id: it.id, label: details ? `${title} (${details})` : title };
    })
  );
  const members = cls.roster.map((r) => ({ customerId: r.customerId, name: r.customer.name }));

  async function setAttendance(formData: FormData) {
    "use server";
    const entryId = String(formData.get("entryId"));
    const status = String(formData.get("status"));
    await db.rosterEntry.update({ where: { id: entryId }, data: { attendance: status } });
    revalidatePath(`/classes/${id}`);
  }

  async function addToRoster(formData: FormData) {
    "use server";
    const customerId = String(formData.get("customerId") ?? "");
    if (!customerId) return;
    await db.rosterEntry.create({ data: { classId: id, customerId } });
    revalidatePath(`/classes/${id}`);
  }

  async function removeFromRoster(formData: FormData) {
    "use server";
    const entryId = String(formData.get("entryId") ?? "");
    await db.rosterEntry.delete({ where: { id: entryId } });
    revalidatePath(`/classes/${id}`);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <BackButton fallback={cls.campId ? `/camps/${cls.campId}` : "/calendar"} label="Back" />
      <header className="mt-3 mb-6">
        <div className="text-sm text-muted">
          {formatDate(cls.startsAt)} · {formatTime(cls.startsAt)} · {cls.location ?? "—"}
          {cls.camp && (<> · <Link href={`/camps/${cls.campId}`} className="text-accent hover:underline">{cls.camp.name}</Link></>)}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">{cls.title}</h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Roster</h2>
            <div className="text-sm text-muted tabular-nums">{cls.roster.length} / {cls.capacity}</div>
          </div>
          <ul className="divide-y divide-border -mx-2">
            {cls.roster.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-2 py-3">
                <div>
                  <Link href={`/customers/${r.customerId}`} className="font-medium hover:text-accent">{r.customer.name}</Link>
                  <div className="text-xs text-muted">{r.customer.tags}</div>
                </div>
                <div className="flex items-center gap-1">
                  {[
                    { v: "attended",    label: "✓", color: "bg-emerald-600 text-white" },
                    { v: "no_show",     label: "✗", color: "bg-red-600 text-white" },
                    { v: "late_cancel", label: "L", color: "bg-amber-500 text-white" },
                    { v: "pending",     label: "—", color: "bg-zinc-200 text-zinc-700" },
                  ].map((opt) => (
                    <form key={opt.v} action={setAttendance}>
                      <input type="hidden" name="entryId" value={r.id} />
                      <input type="hidden" name="status" value={opt.v} />
                      <button
                        type="submit"
                        className={`w-10 h-10 rounded-lg font-semibold text-sm ${
                          r.attendance === opt.v ? opt.color : "bg-background hover:bg-zinc-100 text-muted"
                        }`}
                        title={opt.v}
                      >
                        {opt.label}
                      </button>
                    </form>
                  ))}
                  <form action={removeFromRoster} className="ml-1">
                    <input type="hidden" name="entryId" value={r.id} />
                    <button type="submit" className="text-xs text-muted hover:text-red-600 px-1" title="Remove from roster">Remove</button>
                  </form>
                </div>
              </li>
            ))}
            {cls.roster.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">No athletes on the roster.</li>}
          </ul>
          <form action={addToRoster} className="flex gap-2 mt-3 pt-3 border-t border-border">
            <select name="customerId" className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm">
              <option value="">+ Add athlete{cls.campId ? " (camp member)" : ""}…</option>
              {rosterCandidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="submit" className="rounded-lg bg-foreground text-white px-3 text-sm">Add</button>
          </form>
          {cls.campId && rosterCandidates.length === 0 && cls.roster.length > 0 && (
            <div className="text-xs text-muted mt-2">All camp members are on the roster.</div>
          )}
        </section>

        <section className="lg:col-span-5 space-y-4">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Workouts ({cls.workouts.length})</h2>
          {cls.workouts.length === 0 ? (
            <div className="bg-card border border-border border-dashed rounded-xl p-6 text-center text-sm text-muted">
              No workout assigned yet. Drag one from the camp page.
            </div>
          ) : (
            cls.workouts.map((cw) => (
              <ClassWorkoutEditor
                key={cw.id}
                classId={cls.id}
                workoutId={cw.workoutId}
                workoutName={cw.workout.name}
                description={cw.workout.description}
                initialItems={cw.workout.items.map((it) => ({
                  id: it.id,
                  category: it.category as never,
                  label: it.label,
                  distanceM: it.distanceM,
                  timeSec: it.timeSec,
                  weightKg: it.weightKg,
                  reps: it.reps,
                  sets: it.sets,
                  paceSecPerKm: it.paceSecPerKm,
                  heightM: it.heightM,
                  notes: it.notes,
                }))}
              />
            ))
          )}
        </section>
      </div>

      <section className="mt-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Performance &amp; Recovery</h2>
          <div className="text-xs text-muted">Log how each athlete performed and felt — used for next-session planning &amp; injury management.</div>
        </div>
        <PerformanceTable classId={cls.id} members={members} exercises={exercises} initial={performances} />
      </section>
    </div>
  );
}
