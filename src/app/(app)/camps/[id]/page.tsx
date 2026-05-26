import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatDate, formatTime } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import CampSchedule from "@/components/CampSchedule";
import { formatItem } from "@/domain/exercises";
import { Pencil } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CampDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const camp = await db.camp.findUnique({
    where: { id },
    include: {
      coach: true,
      members: { include: { customer: true } },
      classes: {
        orderBy: { startsAt: "asc" },
        include: {
          workouts: { orderBy: { order: "asc" }, include: { workout: { select: { id: true, name: true } } } },
          roster: true,
        },
      },
      workouts: { include: { workout: { include: { items: true } } } },
    },
  });
  if (!camp) notFound();

  const allCustomers = await db.customer.findMany({ orderBy: { name: "asc" } });
  const allWorkouts = await db.workout.findMany({ orderBy: { name: "asc" } });
  const memberIds = new Set(camp.members.map((m) => m.customerId));
  const workoutIds = new Set(camp.workouts.map((w) => w.workoutId));

  async function addMember(formData: FormData) {
    "use server";
    const customerId = String(formData.get("customerId"));
    if (customerId) await db.campMember.create({ data: { campId: id, customerId } });
    revalidatePath(`/camps/${id}`);
  }
  async function removeMember(formData: FormData) {
    "use server";
    const memberId = String(formData.get("memberId"));
    await db.campMember.delete({ where: { id: memberId } });
    revalidatePath(`/camps/${id}`);
  }
  async function linkWorkout(formData: FormData) {
    "use server";
    const workoutId = String(formData.get("workoutId"));
    if (workoutId) await db.workoutCamp.create({ data: { campId: id, workoutId } });
    revalidatePath(`/camps/${id}`);
  }
  async function unlinkWorkout(formData: FormData) {
    "use server";
    const linkId = String(formData.get("linkId"));
    await db.workoutCamp.delete({ where: { id: linkId } });
    revalidatePath(`/camps/${id}`);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <BackButton fallback="/camps" label="Back" />
      <header className="mt-3 mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{camp.name}</h1>
        <div className="text-sm text-muted mt-1">{camp.description}</div>
        <div className="text-sm text-muted mt-2">
          {formatDate(camp.startDate)} → {formatDate(camp.endDate)} · Coach: {camp.coach?.name ?? "Unassigned"}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <section className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Members ({camp.members.length})</h2>
          <ul className="divide-y divide-border -mx-2 mb-3">
            {camp.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-2 py-2">
                <Link href={`/customers/${m.customerId}`} className="text-sm font-medium hover:text-accent">{m.customer.name}</Link>
                <form action={removeMember}>
                  <input type="hidden" name="memberId" value={m.id} />
                  <button type="submit" className="text-xs text-muted hover:text-red-600">Remove</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addMember} className="flex gap-2">
            <select name="customerId" className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm">
              <option value="">+ Add member…</option>
              {allCustomers.filter((c) => !memberIds.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="submit" className="rounded-lg bg-foreground text-white px-3 text-sm">Add</button>
          </form>
        </section>

        <section className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Workouts ({camp.workouts.length})</h2>
          <div className="space-y-3 mb-3">
            {camp.workouts.map((w) => (
              <details key={w.id} className="border border-border rounded-lg group">
                <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer list-none">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{w.workout.name}</div>
                    <div className="text-xs text-muted">{w.workout.items.length} exercises{w.workout.tags ? ` · ${w.workout.tags}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link href={`/workouts/${w.workoutId}`} className="text-xs text-accent hover:underline flex items-center gap-1">
                      <Pencil size={11} /> Edit
                    </Link>
                    <form action={unlinkWorkout}>
                      <input type="hidden" name="linkId" value={w.id} />
                      <button type="submit" className="text-xs text-muted hover:text-red-600">Remove</button>
                    </form>
                  </div>
                </summary>
                <ul className="border-t border-border divide-y divide-border">
                  {w.workout.items
                    .sort((a, b) => a.order - b.order)
                    .map((it, idx) => {
                      const { title, details } = formatItem(it as never);
                      return (
                        <li key={it.id} className="px-3 py-2 flex items-start gap-2 text-xs">
                          <span className="text-muted font-mono w-4 text-right shrink-0">{idx + 1}.</span>
                          <div className="min-w-0">
                            <span className="font-medium">{title}</span>
                            {details && <span className="text-muted"> — {details}</span>}
                          </div>
                        </li>
                      );
                    })}
                  {w.workout.items.length === 0 && <li className="px-3 py-2 text-xs text-muted">No exercises yet — click Edit to build it.</li>}
                </ul>
              </details>
            ))}
            {camp.workouts.length === 0 && <div className="text-sm text-muted text-center py-3">No workouts linked yet.</div>}
          </div>
          <form action={linkWorkout} className="flex gap-2">
            <select name="workoutId" className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm">
              <option value="">+ Add workout…</option>
              {allWorkouts.filter((w) => !workoutIds.has(w.id)).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button type="submit" className="rounded-lg bg-foreground text-white px-3 text-sm">Add</button>
          </form>
        </section>
      </div>

      <section>
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Schedule</h2>
        <CampSchedule
          workouts={camp.workouts.map((wc) => ({
            id: wc.workout.id,
            name: wc.workout.name,
            description: wc.workout.description,
            itemCount: wc.workout.items.length,
          }))}
          classes={camp.classes.map((c) => ({
            id: c.id,
            title: c.title,
            startsAtLabel: `${formatDate(c.startsAt)} · ${formatTime(c.startsAt)}`,
            workouts: c.workouts.map((cw) => ({ id: cw.workout.id, name: cw.workout.name })),
            rosterCount: c.roster.length,
            capacity: c.capacity,
          }))}
        />
      </section>
    </div>
  );
}
