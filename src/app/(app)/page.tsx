import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, getMyCustomerId } from "@/lib/auth";
import { formatTime, formatDate, startOfDay, endOfDay, addDays, formatDateLong } from "@/lib/utils";
import { Calendar, Users, Dumbbell, Tent } from "lucide-react";
import TodoList from "@/components/TodoList";
import { listTodos } from "@/domain/todos";
import { formatItem } from "@/domain/exercises";
import { flashUrl } from "@/lib/flash";
import PlanCheckIn from "@/components/PlanCheckIn";
import { classScope, customerScope, campScope, nonStaffCustomerWhere } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const isStaff = user.role === "admin" || user.role === "coach";
  const now = new Date();
  const myCustomerId = await getMyCustomerId();
  const [todayClasses, upcomingClasses, customerCount, campCount, workoutCount, recentActivity, todos, myAssignments, myWorkouts, myPastRoster, myFeedbackDone] = await Promise.all([
    db.class.findMany({
      where: { startsAt: { gte: startOfDay(), lte: endOfDay() }, ...classScope(user) },
      orderBy: { startsAt: "asc" },
      include: { roster: true, workouts: { include: { workout: { select: { name: true } } } }, camp: true },
    }),
    db.class.findMany({
      where: { startsAt: { gt: endOfDay(), lte: endOfDay(addDays(now, 7)) }, ...classScope(user) },
      orderBy: { startsAt: "asc" },
      take: 5,
      include: { camp: true, roster: true },
    }),
    db.customer.count({ where: { ...customerScope(user), ...nonStaffCustomerWhere() } }),
    db.camp.count({ where: campScope(user) }),
    db.workout.count(),
    db.activityData.findMany({ where: { customer: customerScope(user) }, orderBy: { date: "desc" }, take: 5, include: { customer: true } }),
    listTodos({ user }),
    // The signed-in athlete's own training plan: everything not yet done, plus
    // anything dated today or later (so completed-today sessions still show).
    myCustomerId
      ? db.workoutAssignment.findMany({
          where: { customerId: myCustomerId, OR: [{ status: { not: "completed" } }, { scheduledDate: { gte: startOfDay() } }] },
          include: { workout: { select: { name: true, items: { orderBy: { order: "asc" } } } }, camp: { select: { name: true } } },
          orderBy: [{ scheduledDate: "asc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
    // Workouts the athlete can self-add: customers see their own private ones,
    // staff pick from the shared library (for their own routine).
    myCustomerId
      ? db.workout.findMany({ where: isStaff ? { ownerCustomerId: null } : { ownerCustomerId: myCustomerId }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    // Classes the athlete was on the roster for in the past 2 weeks — to prompt
    // for post-class feedback.
    myCustomerId
      ? db.rosterEntry.findMany({
          where: { customerId: myCustomerId, class: { startsAt: { gte: addDays(now, -14), lt: now } } },
          include: { class: { select: { id: true, title: true, startsAt: true } } },
          orderBy: { class: { startsAt: "desc" } },
        })
      : Promise.resolve([]),
    // Which classes the athlete has already given class-overall feedback on.
    myCustomerId
      ? db.performance.findMany({ where: { customerId: myCustomerId, workoutId: null }, select: { classId: true } })
      : Promise.resolve([]),
  ]);

  // Past classes still awaiting the athlete's feedback.
  const feedbackDoneClassIds = new Set(myFeedbackDone.map((p) => p.classId));
  const needFeedback = myPastRoster.filter((r) => !feedbackDoneClassIds.has(r.classId)).slice(0, 5);

  const todoItems = todos;
  const todayKey = startOfDay().toISOString().slice(0, 10);
  // Show the plan card to every athlete (customers always; staff only once they
  // have something assigned — they manage plans elsewhere).
  const showPlan = !!myCustomerId && (myAssignments.length > 0 || !isStaff);

  // Per-exercise check-in + completion is handled client-side by the PlanCheckIn
  // component via PATCH /api/assignment/[id] (scoped to the caller's own row).

  // Athlete adds a workout to their own plan. Customers pick their own private
  // workouts; staff (who train on their own routine) pick from the shared library.
  async function addToMyPlan(formData: FormData) {
    "use server";
    const u = await requireUser();
    const mine = (await db.user.findUnique({ where: { id: u.id }, select: { customerId: true } }))?.customerId;
    if (!mine) redirect("/profile");
    const workoutId = String(formData.get("workoutId") ?? "");
    if (!workoutId) return;
    const w = await db.workout.findUnique({ where: { id: workoutId }, select: { ownerCustomerId: true } });
    const staff = u.role === "admin" || u.role === "coach";
    const ok = w && (w.ownerCustomerId === mine || (staff && w.ownerCustomerId === null));
    if (!ok) return;
    const dateRaw = String(formData.get("scheduledDate") ?? "").trim();
    await db.workoutAssignment.create({
      data: { customerId: mine, workoutId, assignedById: null, scheduledDate: dateRaw ? new Date(dateRaw) : null },
    });
    revalidatePath("/");
    redirect(flashUrl("/", "Added to your plan"));
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <div className="text-sm text-muted">{formatDateLong(now)}</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Welcome back, {user.name.split(" ")[0]}</h1>
      </header>

      <div className={`grid grid-cols-2 ${isStaff ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-4 mb-8`}>
        <Stat icon={Calendar} label="Classes today" value={todayClasses.length} href="/calendar" />
        <Stat icon={Tent} label={isStaff ? "Active camps" : "My camps"} value={campCount} href="/camps" />
        {isStaff && <Stat icon={Users} label="Customers" value={customerCount} href="/customers" />}
        <Stat icon={Dumbbell} label="Workouts" value={workoutCount} href="/workouts" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="lg:col-span-3 space-y-6">
          {showPlan && (
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Your training plan</h2>
                <span className="text-xs text-muted">{myAssignments.filter((a) => a.status !== "completed").length} to do</span>
              </div>

              {myAssignments.length === 0 ? (
                <div className="bg-card border border-border border-dashed rounded-xl p-5 text-center text-sm text-muted">
                  Nothing assigned right now. Add one of your own workouts below, or your coach will post the week&apos;s plan.
                </div>
              ) : (
                <ul className="space-y-3">
                  {myAssignments.map((a) => {
                    const done = a.status === "completed";
                    const dateLabel = !a.scheduledDate
                      ? "Anytime"
                      : a.scheduledDate.toISOString().slice(0, 10) === todayKey
                        ? "Today"
                        : formatDate(a.scheduledDate);
                    return (
                      <li key={a.id} className={`bg-card border rounded-xl p-4 ${done ? "border-emerald-200" : "border-border"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-zinc-100 text-zinc-600">{dateLabel}</span>
                              <span className="font-semibold">{a.workout.name}</span>
                              {a.camp && <span className="text-[10px] text-accent">· {a.camp.name}</span>}
                              {done && <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700">done</span>}
                            </div>
                            {a.workout.items.length > 0 && (
                              <div className="mt-1.5 text-xs text-muted flex flex-wrap gap-x-3 gap-y-0.5">
                                {a.workout.items.map((it) => {
                                  const { title, details } = formatItem(it as never);
                                  return <span key={it.id}>{title}{details ? ` (${details})` : ""}</span>;
                                })}
                              </div>
                            )}
                            {(a.coachSuggestion || a.foodAdvice || a.restAdvice) && (
                              <div className="mt-1.5 space-y-0.5">
                                {a.coachSuggestion && <div className="text-xs"><span className="font-medium text-accent">Training:</span> {a.coachSuggestion}</div>}
                                {a.foodAdvice && <div className="text-xs"><span className="font-medium text-emerald-700">Eat:</span> {a.foodAdvice}</div>}
                                {a.restAdvice && <div className="text-xs"><span className="font-medium text-sky-700">Rest:</span> {a.restAdvice}</div>}
                              </div>
                            )}
                          </div>
                        </div>

                        <PlanCheckIn
                          assignmentId={a.id}
                          exercises={a.workout.items.map((it) => {
                            const { title, details } = formatItem(it as never);
                            return { id: it.id, label: details ? `${title} (${details})` : title };
                          })}
                          initialResults={a.resultsJson ? (JSON.parse(a.resultsJson) as Record<string, string>) : {}}
                          initialStatus={a.status}
                          initialRpe={a.rpe}
                          initialFeeling={a.feeling}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Self-add a workout to your own plan (don't have to follow the assigned one) */}
              {myWorkouts.length > 0 && (
                <form action={addToMyPlan} className="mt-3 bg-card border border-border rounded-xl p-3 flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[10rem]">
                    <label className="block text-[11px] text-muted mb-1">{isStaff ? "Add a workout to your plan" : "Add your own workout"}</label>
                    <select name="workoutId" required defaultValue="" className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm">
                      <option value="" disabled>Pick a workout…</option>
                      {myWorkouts.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted mb-1">Date (optional)</label>
                    <input name="scheduledDate" type="date" className="rounded-lg border border-border px-2 py-1.5 text-sm" />
                  </div>
                  <button type="submit" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium">Add</button>
                </form>
              )}
            </div>
          )}

          {/* Post-class feedback prompt — recent classes the athlete hasn't rated */}
          {needFeedback.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">How were your recent classes?</h2>
              <ul className="bg-card border border-border rounded-xl divide-y divide-border">
                {needFeedback.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{r.class.title}</div>
                      <div className="text-xs text-muted">{formatDate(r.class.startsAt)}</div>
                    </div>
                    <Link href={`/classes/${r.class.id}`} className="shrink-0 rounded-lg bg-foreground text-white px-3 py-1.5 text-xs font-medium hover:opacity-90">
                      Give feedback
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <TodoList todos={todoItems} />

          <div>
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Today&apos;s classes</h2>
            {todayClasses.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-6 text-center text-muted text-sm">No classes scheduled today.</div>
            ) : (
              <ul className="space-y-3">
                {todayClasses.map((c) => {
                  const attended = c.roster.filter((r) => r.attendance === "attended").length;
                  return (
                    <li key={c.id}>
                      <Link href={`/classes/${c.id}`} className="block bg-card border border-border rounded-xl p-5 hover:border-accent transition">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-lg font-semibold">{c.title}</div>
                            <div className="text-sm text-muted mt-0.5">{formatTime(c.startsAt)} · {c.camp?.name ?? "—"} · {c.workouts.length === 0 ? "No workout" : c.workouts.map((cw) => cw.workout.name).join(" + ")}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-semibold tabular-nums">{c.roster.length}<span className="text-base text-muted font-normal"> / {c.capacity}</span></div>
                            <div className="text-xs text-muted mt-0.5">{attended} attended</div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Upcoming this week</h2>
            {upcomingClasses.length === 0 ? (
              <div className="text-sm text-muted">Nothing else this week.</div>
            ) : (
              <ul className="bg-card border border-border rounded-xl divide-y divide-border">
                {upcomingClasses.map((c) => (
                  <li key={c.id}>
                    <Link href={`/classes/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-background">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{c.title}</div>
                        <div className="text-xs text-muted">{formatDate(c.startsAt)} · {formatTime(c.startsAt)}</div>
                      </div>
                      <div className="text-xs text-muted tabular-nums shrink-0 ml-2">{c.roster.length}/{c.capacity}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Recent activity</h2>
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {recentActivity.map((a) => (
                <Link key={a.id} href={`/customers/${a.customerId}`} className="flex items-center justify-between px-4 py-3 hover:bg-background">
                  <div>
                    <div className="font-medium text-sm">{a.customer.name}</div>
                    <div className="text-xs text-muted capitalize">{a.activityType} · {formatDate(a.date)}</div>
                  </div>
                  <div className="text-xs text-muted tabular-nums">{a.avgHr ?? "—"} bpm</div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, href }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: number; href: string }) {
  return (
    <Link href={href} className="bg-card border border-border rounded-xl p-5 hover:border-accent transition block">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
        <Icon size={16} className="text-muted" />
      </div>
      <div className="text-3xl font-semibold mt-2 tabular-nums">{value}</div>
    </Link>
  );
}
