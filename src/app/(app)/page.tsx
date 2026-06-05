import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, requireStaff, getMyCustomerId } from "@/lib/auth";
import { formatTime, formatDate, startOfDay, endOfDay, addDays, formatDateLong } from "@/lib/utils";
import { Calendar, Users, Dumbbell, Tent } from "lucide-react";
import TodoList from "@/components/TodoList";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { listTodos } from "@/domain/todos";
import { formatItem } from "@/domain/exercises";
import { flashUrl } from "@/lib/flash";
import { classScope, customerScope, campScope, nonStaffCustomerWhere } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const isStaff = user.role === "admin" || user.role === "coach";
  const now = new Date();
  const myCustomerId = await getMyCustomerId();
  const [todayClasses, upcomingClasses, customerCount, campCount, workoutCount, recentActivity, todos, myAssignments, myWorkouts, myPastRoster, myFeedbackDone, pendingApplications] = await Promise.all([
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
    // The athlete's own private workouts, for self-adding to their plan.
    myCustomerId
      ? db.workout.findMany({ where: { ownerCustomerId: myCustomerId }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    // Recent classes the athlete attended that may want post-class feedback.
    myCustomerId
      ? db.rosterEntry.findMany({
          where: { customerId: myCustomerId, class: { startsAt: { gte: addDays(now, -14), lt: now } } },
          include: { class: { select: { id: true, title: true, startsAt: true, feedbackRequestedAt: true } } },
          orderBy: { class: { startsAt: "desc" } },
        })
      : Promise.resolve([]),
    // Which classes they've already given class-overall feedback on.
    myCustomerId
      ? db.performance.findMany({ where: { customerId: myCustomerId, workoutId: null }, select: { classId: true } })
      : Promise.resolve([]),
    // Pending camp applications — staff approve/reject these from the dashboard.
    isStaff
      ? db.campMember.findMany({
          where: { status: "pending" },
          include: { customer: { select: { id: true, name: true } }, camp: { select: { id: true, name: true } } },
          orderBy: { joinedAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const feedbackDoneClassIds = new Set(myFeedbackDone.map((p) => p.classId));
  const needFeedback = myPastRoster.filter((r) => !feedbackDoneClassIds.has(r.classId)).slice(0, 6);

  const todoItems = todos;
  const todayKey = startOfDay().toISOString().slice(0, 10);
  // Show the plan card to every athlete (customers always; staff only once they
  // have something assigned — they manage plans elsewhere).
  const showPlan = !!myCustomerId && (myAssignments.length > 0 || !isStaff);

  // Athlete logs a plan workout done — scoped to their own assignment only.
  async function logMyAssignment(formData: FormData) {
    "use server";
    const mine = await getMyCustomerId();
    if (!mine) redirect("/profile");
    const assignmentId = String(formData.get("assignmentId") ?? "");
    if (!assignmentId) return;
    const status = String(formData.get("status") ?? "completed");
    const rpeRaw = String(formData.get("rpe") ?? "").trim();
    await db.workoutAssignment.updateMany({
      where: { id: assignmentId, customerId: mine },
      data: {
        status,
        completedAt: status === "completed" ? new Date() : null,
        rpe: rpeRaw ? Number(rpeRaw) : null,
        feeling: String(formData.get("feeling") ?? "").trim() || null,
        notes: String(formData.get("notes") ?? "").trim() || null,
      },
    });
    revalidatePath("/");
    redirect(flashUrl("/", "Workout logged"));
  }
  // Athlete adds one of their own workouts to their plan.
  async function addToMyPlan(formData: FormData) {
    "use server";
    const mine = await getMyCustomerId();
    if (!mine) redirect("/profile");
    const workoutId = String(formData.get("workoutId") ?? "");
    if (!workoutId) return;
    const w = await db.workout.findUnique({ where: { id: workoutId }, select: { ownerCustomerId: true } });
    if (!w || w.ownerCustomerId !== mine) return; // only your own private workouts
    const dateRaw = String(formData.get("scheduledDate") ?? "").trim();
    await db.workoutAssignment.create({
      data: { customerId: mine, workoutId, assignedById: null, scheduledDate: dateRaw ? new Date(dateRaw) : null },
    });
    revalidatePath("/");
    redirect(flashUrl("/", "Added to your plan"));
  }

  // Staff approve a pending camp application straight from the dashboard.
  async function approveApplication(formData: FormData) {
    "use server";
    await requireStaff();
    const memberId = String(formData.get("memberId") ?? "");
    if (!memberId) return;
    const m = await db.campMember.update({ where: { id: memberId }, data: { status: "active" }, select: { campId: true } });
    revalidatePath("/");
    revalidatePath(`/camps/${m.campId}`);
    revalidatePath("/camps");
    redirect(flashUrl("/", "Application approved"));
  }
  // Staff reject (delete) a pending application.
  async function rejectApplication(formData: FormData) {
    "use server";
    await requireStaff();
    const memberId = String(formData.get("memberId") ?? "");
    if (!memberId) return;
    const m = await db.campMember.delete({ where: { id: memberId }, select: { campId: true } });
    revalidatePath("/");
    revalidatePath(`/camps/${m.campId}`);
    revalidatePath("/camps");
    redirect(flashUrl("/", "Application rejected"));
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

      {/* Camp applications awaiting a coach's decision — staff only. */}
      {isStaff && pendingApplications.length > 0 && (
        <div className="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Tent size={16} className="text-amber-600 shrink-0" />
            <h2 className="text-sm font-semibold text-amber-900">
              {pendingApplications.length} camp application{pendingApplications.length === 1 ? "" : "s"} awaiting review
            </h2>
          </div>
          <ul className="divide-y divide-amber-200">
            {pendingApplications.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link href={`/customers/${m.customerId}`} className="text-sm font-medium hover:text-accent">{m.customer.name}</Link>
                  <div className="text-xs text-muted">
                    applied to <Link href={`/camps/${m.campId}`} className="font-medium hover:text-accent">{m.camp.name}</Link>
                    <span className="mx-1">·</span>{formatDate(m.joinedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <form action={approveApplication}>
                    <input type="hidden" name="memberId" value={m.id} />
                    <button type="submit" className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:opacity-90">Approve</button>
                  </form>
                  <form action={rejectApplication}>
                    <input type="hidden" name="memberId" value={m.id} />
                    <ConfirmSubmit message={`Reject ${m.customer.name}'s application to ${m.camp.name}?`} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-red-600 hover:bg-amber-100">Reject</ConfirmSubmit>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                            {(a.coachSuggestion || a.foodAdvice) && (
                              <div className="mt-1.5 space-y-0.5">
                                {a.coachSuggestion && <div className="text-xs"><span className="font-medium text-accent">Coach:</span> {a.coachSuggestion}</div>}
                                {a.foodAdvice && <div className="text-xs"><span className="font-medium text-emerald-700">Food:</span> {a.foodAdvice}</div>}
                              </div>
                            )}
                            {done && (a.rpe != null || a.feeling) && (
                              <div className="mt-1 text-xs text-muted">{a.rpe != null ? `RPE ${a.rpe}` : ""}{a.feeling ? ` · ${a.feeling}` : ""}</div>
                            )}
                          </div>
                        </div>

                        {!done && (
                          <form action={logMyAssignment} className="mt-3 pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                            <input type="hidden" name="assignmentId" value={a.id} />
                            <input type="hidden" name="status" value="completed" />
                            <div>
                              <label className="block text-[10px] text-muted mb-0.5">RPE (1–10)</label>
                              <input name="rpe" type="number" min={1} max={10} className="w-full rounded-md border border-border px-2 py-1 text-xs" />
                            </div>
                            <div>
                              <label className="block text-[10px] text-muted mb-0.5">Feeling</label>
                              <input name="feeling" placeholder="legs heavy…" className="w-full rounded-md border border-border px-2 py-1 text-xs" />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-[10px] text-muted mb-0.5">Notes</label>
                              <input name="notes" placeholder="anything worth noting…" className="w-full rounded-md border border-border px-2 py-1 text-xs" />
                            </div>
                            <div className="col-span-2 sm:col-span-4 flex justify-end">
                              <button type="submit" className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium">Mark done</button>
                            </div>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Self-add one of your own workouts */}
              {!isStaff && myWorkouts.length > 0 && (
                <form action={addToMyPlan} className="mt-3 bg-card border border-border rounded-xl p-3 flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[10rem]">
                    <label className="block text-[11px] text-muted mb-1">Add your own workout</label>
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
              <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Share feedback on your recent classes</h2>
              <ul className="bg-card border border-border rounded-xl divide-y divide-border">
                {needFeedback.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{r.class.title}</div>
                      <div className="text-xs text-muted">
                        {formatDate(r.class.startsAt)}
                        {r.class.feedbackRequestedAt && <span className="ml-2 text-accent">· requested by your coach</span>}
                      </div>
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
