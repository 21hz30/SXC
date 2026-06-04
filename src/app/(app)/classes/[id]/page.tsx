import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatTime, formatDate } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { flashUrl } from "@/lib/flash";
import { formatItem } from "@/domain/exercises";
import { requireUser, requireCoach, getMyCustomerId } from "@/lib/auth";
import { listPerformance } from "@/domain/performance";
import { listWatchData } from "@/domain/watch";
import ClassWorkoutEditor from "@/components/ClassWorkoutEditor";
import WorkoutCreateDrawer from "@/components/WorkoutCreateDrawer";
import WorkoutFeedbackPanel, { type WorkoutPerfRow } from "@/components/WorkoutFeedbackPanel";
import WatchDataPanel, { type WatchRow } from "@/components/WatchDataPanel";
import { canAccessCamp } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function ClassDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireUser();
  const isStaff = user.role === "admin" || user.role === "coach";
  const { id } = await params;
  const { edit } = await searchParams;
  const cls = await db.class.findUnique({
    where: { id },
    include: {
      workouts: {
        orderBy: { order: "asc" },
        include: { workout: { include: { items: { orderBy: { order: "asc" } } } } },
      },
      roster: { include: { customer: true }, orderBy: { customer: { name: "asc" } } },
      camp: true,
      createdBy: { select: { name: true } },
    },
  });
  if (!cls) notFound();

  // ---- Customer (athlete) view: read-only plan + self sign-up ----
  if (!isStaff) {
    const myCustomerId = await getMyCustomerId();
    // Access: a drop-in / free-standing class is open; a camp class needs an
    // active membership in that camp.
    let allowed = !cls.campId || cls.dropInAllowed;
    if (!allowed && cls.campId && myCustomerId) {
      const mem = await db.campMember.findFirst({
        where: { campId: cls.campId, customerId: myCustomerId, status: "active" },
      });
      allowed = !!mem;
    }
    if (!allowed) redirect(cls.campId ? `/camps/${cls.campId}` : "/calendar");

    const myEntry = myCustomerId ? cls.roster.find((r) => r.customerId === myCustomerId) ?? null : null;
    const isFull = cls.roster.length >= cls.capacity;
    // Once the class has started, the athlete can tell their coach how it felt.
    const classStarted = cls.startsAt.getTime() <= Date.now();
    const myPerf = myCustomerId
      ? await db.performance.findFirst({ where: { classId: id, customerId: myCustomerId, workoutId: null } })
      : null;

    async function signUp() {
      "use server";
      const u = await requireUser();
      const a = await db.user.findUnique({ where: { id: u.id }, select: { customerId: true } });
      if (!a?.customerId) redirect("/profile");
      const fresh = await db.class.findUnique({ where: { id }, select: { capacity: true, _count: { select: { roster: true } } } });
      const existing = await db.rosterEntry.findUnique({ where: { classId_customerId: { classId: id, customerId: a.customerId } } });
      if (!existing && fresh && fresh._count.roster < fresh.capacity) {
        await db.rosterEntry.create({ data: { classId: id, customerId: a.customerId } });
      }
      revalidatePath(`/classes/${id}`);
      redirect(flashUrl(`/classes/${id}`, existing ? "You're already signed up" : "You're signed up!"));
    }
    async function cancelSignUp() {
      "use server";
      const u = await requireUser();
      const a = await db.user.findUnique({ where: { id: u.id }, select: { customerId: true } });
      if (a?.customerId) await db.rosterEntry.deleteMany({ where: { classId: id, customerId: a.customerId } });
      revalidatePath(`/classes/${id}`);
      redirect(flashUrl(`/classes/${id}`, "Sign-up cancelled"));
    }
    // Athlete's own post-class feedback. Scoped to their own customer id — never
    // trusts a client-supplied id — and only ever writes the class-overall row.
    async function submitFeedback(formData: FormData) {
      "use server";
      const u = await requireUser();
      const mine = (await db.user.findUnique({ where: { id: u.id }, select: { customerId: true } }))?.customerId;
      if (!mine) redirect("/profile");
      const num = (k: string) => { const v = String(formData.get(k) ?? "").trim(); return v ? Number(v) : null; };
      const data = {
        status: "completed",
        rpe: num("rpe"),
        fatiguePct: num("fatiguePct"),
        feeling: String(formData.get("feeling") ?? "").trim() || null,
        injuryNote: String(formData.get("injuryNote") ?? "").trim() || null,
        notes: String(formData.get("notes") ?? "").trim() || null,
      };
      // The class-overall row has workoutId = null, which Prisma can't target
      // through its compound-unique upsert — so find-then-update/create.
      const existing = await db.performance.findFirst({ where: { classId: id, customerId: mine, workoutId: null }, select: { id: true } });
      if (existing) await db.performance.update({ where: { id: existing.id }, data });
      else await db.performance.create({ data: { classId: id, customerId: mine, workoutId: null, ...data } });
      revalidatePath(`/classes/${id}`);
      redirect(flashUrl(`/classes/${id}`, "Thanks — your feedback is saved"));
    }

    return (
      <div className="p-8 max-w-3xl mx-auto">
        <BackButton fallback={cls.campId ? `/camps/${cls.campId}` : "/calendar"} label="Back" />
        <header className="mt-3 mb-6">
          <div className="text-sm text-muted">
            {formatDate(cls.startsAt)} · {formatTime(cls.startsAt)} · {cls.location ?? "—"} · {cls.durationMin} min
            {cls.camp && (<> · <Link href={`/camps/${cls.campId}`} className="text-accent hover:underline">{cls.camp.name}</Link></>)}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">{cls.title}</h1>
          {cls.notes && <p className="text-sm text-muted mt-2 whitespace-pre-wrap">{cls.notes}</p>}
        </header>

        {/* Sign-up card */}
        <div className="bg-card border border-border rounded-xl p-5 mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">
              {myEntry ? (
                <span className="text-emerald-700">✓ You&apos;re signed up</span>
              ) : isFull ? (
                <span className="text-muted">Class is full</span>
              ) : (
                "Open for sign-up"
              )}
            </div>
            <div className="text-xs text-muted mt-0.5 tabular-nums">{cls.roster.length} / {cls.capacity} spots filled</div>
          </div>
          {myEntry ? (
            <form action={cancelSignUp}>
              <ConfirmSubmit
                message={`Cancel your sign-up for "${cls.title}" on ${formatDate(cls.startsAt)}?`}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:border-red-300 hover:text-red-600"
              >
                Cancel sign-up
              </ConfirmSubmit>
            </form>
          ) : isFull ? (
            <span className="rounded-lg border border-border px-4 py-2 text-sm text-muted">Full</span>
          ) : (
            <form action={signUp}>
              <ConfirmSubmit
                message={`Sign up for "${cls.title}" on ${formatDate(cls.startsAt)} at ${formatTime(cls.startsAt)}?`}
                className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium hover:opacity-90"
              >
                Sign up
              </ConfirmSubmit>
            </form>
          )}
        </div>

        {/* Post-class feedback — appears once the session has started */}
        {classStarted && (
          <div className="bg-card border border-border rounded-xl p-5 mb-6">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">How did it go?</h2>
              {myPerf && <span className="text-[11px] font-medium text-emerald-700">✓ Submitted</span>}
            </div>
            <p className="text-xs text-muted mb-3">Tell your coach how this session felt — it shapes your next plan and your post-class report.</p>
            <form action={submitFeedback} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[11px] text-muted mb-1">Effort (RPE 1–10)</label>
                <input name="rpe" type="number" min={1} max={10} defaultValue={myPerf?.rpe ?? ""} className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-[11px] text-muted mb-1">Tiredness</label>
                <select name="fatiguePct" defaultValue={myPerf?.fatiguePct != null ? String(myPerf.fatiguePct) : ""} className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm">
                  <option value="">—</option>
                  <option value="15">Fresh</option>
                  <option value="40">A bit tired</option>
                  <option value="65">Tired</option>
                  <option value="85">Very tired</option>
                  <option value="95">Wrecked</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-muted mb-1">Feeling</label>
                <input name="feeling" defaultValue={myPerf?.feeling ?? ""} placeholder="e.g. legs heavy, strong on the row" className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className="block text-[11px] text-muted mb-1">Notes (optional)</label>
                <input name="notes" defaultValue={myPerf?.notes ?? ""} placeholder="anything worth noting" className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[11px] text-muted mb-1">Injury? (optional)</label>
                <input name="injuryNote" defaultValue={myPerf?.injuryNote ?? ""} placeholder="any niggle" className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
              </div>
              <div className="col-span-2 sm:col-span-4 flex justify-end">
                <button type="submit" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium">{myPerf ? "Update feedback" : "Submit feedback"}</button>
              </div>
            </form>
          </div>
        )}

        {/* Exercise plan — read-only */}
        <section>
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Workout plan</h2>
          {cls.workouts.length === 0 ? (
            <div className="bg-card border border-border border-dashed rounded-xl p-6 text-center text-sm text-muted">
              No workout posted yet — check back before class.
            </div>
          ) : (
            <div className="space-y-4">
              {cls.workouts.map((cw) => (
                <div key={cw.id} className="bg-card border border-border rounded-xl p-5">
                  <div className="font-semibold">{cw.workout.name}</div>
                  {cw.workout.description && <div className="text-sm text-muted mt-0.5">{cw.workout.description}</div>}
                  <ul className="mt-3 divide-y divide-border">
                    {cw.workout.items.map((it) => {
                      const { title, details } = formatItem(it as never);
                      return (
                        <li key={it.id} className="py-2 flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-medium">{title}</span>
                          {details && <span className="text-muted text-right">{details}</span>}
                        </li>
                      );
                    })}
                    {cw.workout.items.length === 0 && <li className="py-2 text-sm text-muted">No exercises listed.</li>}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  // ---- Staff view (full management) ----
  if (cls.camp && !canAccessCamp(user, cls.camp)) redirect("/calendar");

  // Candidates to add to the roster:
  //  - drop-in classes accept ANY customer (open to walk-ins outside the camp)
  //  - regular classes belonging to a camp are restricted to camp members
  //  - free-standing classes (no camp) also accept any customer
  const rosteredIds = new Set(cls.roster.map((r) => r.customerId));
  const restrictToCamp = !!cls.campId && !cls.dropInAllowed;
  const assignedWorkoutIds = new Set(cls.workouts.map((cw) => cw.workoutId));

  // All the staff-view reads run in parallel — one round-trip instead of five.
  const [candidates, performances, reports, watchData, allLibraryWorkouts] = await Promise.all([
    restrictToCamp
      ? db.campMember
          .findMany({
            where: { campId: cls.campId! },
            include: { customer: { select: { id: true, name: true } } },
            orderBy: { customer: { name: "asc" } },
          })
          .then((rows) => rows.map((m) => m.customer))
      : db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    listPerformance({ user }, id),
    db.classReport.findMany({
      where: { classId: id },
      select: { customerId: true, publishedAt: true, updatedAt: true },
    }),
    listWatchData({ user }, id) as Promise<WatchRow[]>,
    db.workout.findMany({ where: { ownerCustomerId: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const rosterCandidates = candidates.filter((c) => !rosteredIds.has(c.id));
  const reportByCustomer = new Map(reports.map((r) => [r.customerId, r]));
  const perfCustomerIds = new Set(performances.map((p) => p.customerId));
  // Map each workout to its exercises (for per-workout feedback inputs) and to
  // the subset of performance rows scoped to it.
  const workoutFeedbackData = cls.workouts.map((cw) => ({
    workoutId: cw.workoutId,
    name: cw.workout.name,
    exercises: cw.workout.items.map((it) => {
      const { title, details } = formatItem(it as never);
      return { id: it.id, label: details ? `${title} (${details})` : title };
    }),
    initial: performances
      .filter((p) => p.workoutId === cw.workoutId)
      .map((p) => ({ ...p, workoutId: cw.workoutId } as WorkoutPerfRow)),
  }));
  const members = cls.roster.map((r) => ({ customerId: r.customerId, name: r.customer.name }));

  // Shared-library workouts the coach can attach to this class (excluding ones
  // already assigned).
  const availableWorkouts = allLibraryWorkouts.filter((w) => !assignedWorkoutIds.has(w.id));

  async function updateClass(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "").trim();
    const date = String(formData.get("date") ?? "");
    const time = String(formData.get("time") ?? "") || "07:00";
    if (!title || !date) return;
    await db.class.update({
      where: { id },
      data: {
        title,
        startsAt: new Date(`${date}T${time}`),
        durationMin: Number(formData.get("durationMin")) || 60,
        capacity: Number(formData.get("capacity")) || 12,
        location: String(formData.get("location") ?? "").trim() || null,
        dropInAllowed: formData.get("dropInAllowed") === "on",
      },
    });
    revalidatePath(`/classes/${id}`);
    redirect(flashUrl(`/classes/${id}`, "Class updated"));
  }

  async function deleteClass() {
    "use server";
    const target = await db.class.findUnique({ where: { id }, select: { campId: true } });
    await db.class.delete({ where: { id } });
    if (target?.campId) {
      revalidatePath(`/camps/${target.campId}`);
      redirect(flashUrl(`/camps/${target.campId}`, "Class deleted"));
    }
    redirect(flashUrl("/calendar", "Class deleted"));
  }

  async function setAttendance(formData: FormData) {
    "use server";
    const entryId = String(formData.get("entryId"));
    const status = String(formData.get("status"));
    await db.rosterEntry.update({ where: { id: entryId }, data: { attendance: status } });
    revalidatePath(`/classes/${id}`);
    redirect(flashUrl(`/classes/${id}`, "Attendance updated"));
  }

  async function addToRoster(formData: FormData) {
    "use server";
    const customerId = String(formData.get("customerId") ?? "");
    if (!customerId) return;
    await db.rosterEntry.create({ data: { classId: id, customerId } });
    revalidatePath(`/classes/${id}`);
    redirect(flashUrl(`/classes/${id}`, "Athlete added to roster"));
  }

  async function removeFromRoster(formData: FormData) {
    "use server";
    const entryId = String(formData.get("entryId") ?? "");
    await db.rosterEntry.delete({ where: { id: entryId } });
    revalidatePath(`/classes/${id}`);
    redirect(flashUrl(`/classes/${id}`, "Removed from roster"));
  }

  // Attach an existing workout to this class (appended to the end).
  async function addWorkoutToClass(formData: FormData) {
    "use server";
    await requireCoach();
    const workoutId = String(formData.get("workoutId") ?? "");
    if (!workoutId) return;
    const already = await db.classWorkout.findFirst({ where: { classId: id, workoutId } });
    if (!already) {
      const last = await db.classWorkout.findFirst({ where: { classId: id }, orderBy: { order: "desc" } });
      await db.classWorkout.create({ data: { classId: id, workoutId, order: (last?.order ?? -1) + 1 } });
    }
    revalidatePath(`/classes/${id}`);
    redirect(flashUrl(`/classes/${id}`, already ? "Workout already on this class" : "Workout added"));
  }

  // Generate AI post-class reports for every rostered athlete who has a
  // Performance row logged. Coach reviews each one before publishing.
  async function generateAllReports() {
    "use server";
    await requireCoach();
    const { generateClassReport, upsertReport } = await import("@/domain/reports");
    const perfCids = await db.performance.findMany({
      where: { classId: id },
      select: { customerId: true },
      distinct: ["customerId"],
    });
    let made = 0;
    let failed = 0;
    for (const { customerId } of perfCids) {
      try {
        const { contentMarkdown, model } = await generateClassReport(id, customerId);
        await upsertReport(id, customerId, contentMarkdown, model);
        made++;
      } catch {
        failed++;
      }
    }
    revalidatePath(`/classes/${id}`);
    const msg = failed
      ? `Generated ${made}, ${failed} failed`
      : `Generated ${made} report${made === 1 ? "" : "s"}`;
    redirect(flashUrl(`/classes/${id}`, msg));
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <BackButton fallback={cls.campId ? `/camps/${cls.campId}` : "/calendar"} label="Back" />
      <header className="mt-3 mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted">
            {formatDate(cls.startsAt)} · {formatTime(cls.startsAt)} · {cls.location ?? "—"} · {cls.durationMin} min
            {cls.camp && (<> · <Link href={`/camps/${cls.campId}`} className="text-accent hover:underline">{cls.camp.name}</Link></>)}
            {cls.createdBy && (<> · Created by {cls.createdBy.name}</>)}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-3xl font-semibold tracking-tight">{cls.title}</h1>
            {cls.dropInAllowed && (
              <span className="text-[11px] font-semibold uppercase tracking-wide rounded px-2 py-1 bg-emerald-100 text-emerald-700">Drop-in</span>
            )}
          </div>
        </div>
        <Link
          href={edit ? `/classes/${id}` : `/classes/${id}?edit=1`}
          className="text-xs text-accent hover:underline shrink-0 mt-1"
        >
          {edit ? "Cancel" : "Edit class"}
        </Link>
      </header>

      {edit && (
        <form action={updateClass} className="bg-card border border-border rounded-xl p-5 mb-6 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-muted mb-1">Class title</label>
            <input name="title" required defaultValue={cls.title} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Date</label>
            <input name="date" type="date" required defaultValue={cls.startsAt.toISOString().slice(0, 10)} className="rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Time</label>
            <input name="time" type="time" defaultValue={cls.startsAt.toISOString().slice(11, 16)} className="rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div className="w-24">
            <label className="block text-xs text-muted mb-1">Duration (min)</label>
            <input name="durationMin" type="number" defaultValue={cls.durationMin} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div className="w-20">
            <label className="block text-xs text-muted mb-1">Capacity</label>
            <input name="capacity" type="number" defaultValue={cls.capacity} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div className="w-40">
            <label className="block text-xs text-muted mb-1">Location</label>
            <input name="location" defaultValue={cls.location ?? ""} placeholder="optional" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted pb-2 cursor-pointer">
            <input type="checkbox" name="dropInAllowed" defaultChecked={cls.dropInAllowed} className="rounded border-border" />
            Allow drop-ins
          </label>
          <div className="flex gap-2 ml-auto">
            <Link href={`/classes/${id}`} className="px-3 py-2 text-sm rounded-lg border border-border">Cancel</Link>
            <button type="submit" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium">Save</button>
          </div>
        </form>
      )}
      {edit && (
        <form action={deleteClass} className="mb-6 text-right">
          <ConfirmSubmit
            message={`Delete class "${cls.title}"? Its roster and assigned workouts will be removed. This cannot be undone.`}
            className="text-xs text-muted hover:text-red-600"
          >
            Delete this class
          </ConfirmSubmit>
        </form>
      )}

      {/* 1. WORKOUTS — session plan + per-workout athlete feedback under each one */}
      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Workouts ({cls.workouts.length})</h2>
          <div className="text-xs text-muted">Each card has the plan + a feedback table for athletes&apos; RPE / fatigue / feeling for THIS workout.</div>
        </div>

        {/* Add an existing workout, or create a new one — both attach to this class */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4 grid md:grid-cols-2 gap-4">
          <form action={addWorkoutToClass} className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted uppercase tracking-wide">Add an existing workout</label>
            <div className="flex gap-2">
              <select name="workoutId" required defaultValue="" className="flex-1 rounded-lg border border-border bg-white px-2 py-1.5 text-sm">
                <option value="" disabled>Pick a workout…</option>
                {availableWorkouts.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <button type="submit" disabled={availableWorkouts.length === 0} className="rounded-lg bg-foreground text-white px-3 text-sm disabled:opacity-40">Add</button>
            </div>
            {availableWorkouts.length === 0 && <span className="text-[11px] text-muted">All workouts are already on this class.</span>}
          </form>

          <div className="flex flex-col gap-1.5 md:border-l md:border-border md:pl-4">
            <label className="text-xs font-medium text-muted uppercase tracking-wide">Or create a new workout</label>
            <WorkoutCreateDrawer classId={cls.id} />
            <span className="text-[11px] text-muted">Build its exercises in the panel, then save — it&apos;s added here and saved to your workout library.</span>
          </div>
        </div>

        {cls.workouts.length === 0 ? (
          <div className="bg-card border border-border border-dashed rounded-xl p-6 text-center text-sm text-muted">
            No workout assigned yet — add an existing one or create a new one above.
          </div>
        ) : (
          <div className="space-y-6">
            {cls.workouts.map((cw, idx) => {
              const fb = workoutFeedbackData[idx];
              return (
                <div key={cw.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <ClassWorkoutEditor
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
                  <div className="px-5 pt-4 pb-1 text-[11px] font-medium text-muted uppercase tracking-wide">
                    Athlete feedback for this workout
                  </div>
                  <WorkoutFeedbackPanel
                    classId={cls.id}
                    workoutId={cw.workoutId}
                    members={members}
                    exercises={fb.exercises}
                    initial={fb.initial}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. ROSTER — compact attendance bar + add athlete */}
      <section className="bg-card border border-border rounded-xl p-6 mb-6">
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
                  <ConfirmSubmit message={`Remove ${r.customer.name} from this class roster?`} className="text-xs text-muted hover:text-red-600 px-1">Remove</ConfirmSubmit>
                </form>
              </div>
            </li>
          ))}
          {cls.roster.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">No athletes on the roster.</li>}
        </ul>
        <form action={addToRoster} className="flex gap-2 mt-3 pt-3 border-t border-border">
          <select name="customerId" className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm">
            <option value="">+ Add athlete{restrictToCamp ? " (camp member)" : cls.dropInAllowed ? " (drop-in open)" : ""}…</option>
            {rosterCandidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="submit" className="rounded-lg bg-foreground text-white px-3 text-sm">Add</button>
        </form>
        {cls.campId && rosterCandidates.length === 0 && cls.roster.length > 0 && (
          <div className="text-xs text-muted mt-2">All camp members are on the roster.</div>
        )}
      </section>

      {/* 3. WATCH DATA — wearable metrics per athlete; feeds the report's analysis */}
      <section className="bg-card border border-border rounded-xl mb-6 overflow-hidden">
        <div className="p-6 pb-3">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Sport-watch data</h2>
          <div className="text-xs text-muted mt-1">
            Heart rate, calories, time, and HR-zone split per athlete (Garmin / Apple Watch / Whoop).
            Expand a row for distance, cadence, and zone breakdown. This feeds the post-class report
            so the AI reasons about real cardiac load, not just RPE.
          </div>
        </div>
        <WatchDataPanel classId={cls.id} members={members} initial={watchData} />
      </section>

      {/* 4. POST-CLASS REPORTS — AI-drafted, coach-edited, optionally published to athletes */}
      <section className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Post-class reports</h2>
          {perfCustomerIds.size > 0 && (
            <form action={generateAllReports}>
              <ConfirmSubmit
                message={`Generate / regenerate reports for all ${perfCustomerIds.size} athletes with logged performance? Existing reports will be replaced and unpublished.`}
                className="text-xs rounded-lg bg-foreground text-white px-3 py-2"
              >
                Generate for all ({perfCustomerIds.size})
              </ConfirmSubmit>
            </form>
          )}
        </div>
        <div className="text-xs text-muted mb-3">
          One per athlete: what they did, recovery plan to the next class, what to eat,
          and what to avoid. Coach reviews and publishes; athletes see published ones on their portal.
        </div>
        <ul className="divide-y divide-border -mx-2">
          {cls.roster.map((r) => {
            const hasPerf = perfCustomerIds.has(r.customerId);
            const rep = reportByCustomer.get(r.customerId);
            return (
              <li key={r.id} className="flex items-center justify-between px-2 py-2.5">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.customer.name}</div>
                  <div className="text-xs text-muted">
                    {!hasPerf && !rep && "No performance logged yet"}
                    {hasPerf && !rep && "Ready to generate"}
                    {rep && (
                      <>
                        Updated {formatDate(rep.updatedAt)}
                        {rep.publishedAt ? (
                          <span className="ml-2 inline-block rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-medium">
                            Published
                          </span>
                        ) : (
                          <span className="ml-2 inline-block rounded px-1.5 py-0.5 bg-zinc-200 text-zinc-700 text-[10px] font-medium">
                            Draft
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <Link
                  href={`/classes/${id}/reports/${r.customerId}`}
                  className={`text-xs rounded-lg px-3 py-1.5 ${
                    rep ? "border border-border" : hasPerf ? "bg-foreground text-white" : "border border-border text-muted"
                  }`}
                >
                  {rep ? "View" : hasPerf ? "Generate" : "Open"}
                </Link>
              </li>
            );
          })}
          {cls.roster.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-muted">Add athletes to the roster to generate reports.</li>
          )}
        </ul>
      </section>

    </div>
  );
}
