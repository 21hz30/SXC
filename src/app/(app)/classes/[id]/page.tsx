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
                <div className="flex gap-1">
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
                </div>
              </li>
            ))}
            {cls.roster.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">No athletes on the roster.</li>}
          </ul>
        </section>

        <section className="lg:col-span-5 space-y-4">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Workouts ({cls.workouts.length})</h2>
          {cls.workouts.length === 0 ? (
            <div className="bg-card border border-border border-dashed rounded-xl p-6 text-center text-sm text-muted">
              No workout assigned yet. Drag one from the camp page.
            </div>
          ) : (
            cls.workouts.map((cw) => (
              <div key={cw.id} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <Link href={`/workouts/${cw.workoutId}`} className="text-base font-semibold hover:text-accent">{cw.workout.name}</Link>
                    {cw.workout.description && <div className="text-xs text-muted mt-0.5">{cw.workout.description}</div>}
                  </div>
                </div>
                <ul className="divide-y divide-border -mx-2">
                  {cw.workout.items.map((it, idx) => {
                    const { title, details } = formatItem({
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
                    });
                    return (
                      <li key={it.id} className="px-2 py-2 flex items-start gap-3">
                        <span className="text-xs text-muted font-mono w-5 text-right shrink-0 pt-0.5">{idx + 1}.</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{title}</div>
                          {details && <div className="text-xs text-muted">{details}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
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
