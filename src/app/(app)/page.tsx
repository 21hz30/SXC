import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, requireStaff, getMyCustomerId } from "@/lib/auth";
import { formatTime, formatDate, startOfDay, endOfDay, addDays, formatDateLong } from "@/lib/utils";
import { Calendar, ChevronDown, Dumbbell, Tent } from "lucide-react";
import TodoList from "@/components/TodoList";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { listTodos } from "@/domain/todos";
import { backfillCampPlan } from "@/domain/camps";
import ExerciseList from "@/components/ExerciseList";
import PlanExerciseChecklist from "@/components/PlanExerciseChecklist";
import TodayNutrition from "@/components/TodayNutrition";
import { flashUrl } from "@/lib/flash";
import { classScope, customerScope } from "@/lib/access";
import { rollDay, bmrKcal, type Stats, type DayIntake } from "@/domain/nutrition";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const isStaff = user.role === "admin" || user.role === "coach";
  const now = new Date();
  const myCustomerId = await getMyCustomerId();
  const [todayClasses, upcomingClasses, recentActivity, todos, myAssignments, myWorkouts, myPastRoster, myFeedbackDone, pendingApplications, nextClassRow, myMockResults, myStats, todayFood, todayWater, todayBurn, myActiveCampIds] = await Promise.all([
    // Coach-only views: today's roster, next 7 days, recent customer activity.
    // Athletes don't render any of these, so we skip the queries entirely
    // (saves ~3 round-trips per athlete dashboard load).
    isStaff
      ? db.class.findMany({
          where: { startsAt: { gte: startOfDay(), lte: endOfDay() }, ...classScope(user) },
          orderBy: { startsAt: "asc" },
          include: { roster: true, workouts: { include: { workout: { select: { name: true } } } }, camp: true },
        })
      : Promise.resolve([]),
    isStaff
      ? db.class.findMany({
          where: { startsAt: { gt: endOfDay(), lte: endOfDay(addDays(now, 7)) }, ...classScope(user) },
          orderBy: { startsAt: "asc" },
          take: 5,
          include: { camp: true, roster: true },
        })
      : Promise.resolve([]),
    isStaff
      ? db.activityData.findMany({ where: { customer: customerScope(user) }, orderBy: { date: "desc" }, take: 5, include: { customer: true } })
      : Promise.resolve([]),
    listTodos({ user }),
    // The signed-in athlete's own training plan: everything not yet done, plus
    // anything dated today or later (so completed-today sessions still show).
    myCustomerId
      ? db.workoutAssignment.findMany({
          // Keep the dashboard clean: only today + upcoming (and undated), never
          // past-dated workouts — those stay on the calendar but drop off here.
          where: { customerId: myCustomerId, OR: [{ scheduledDate: { gte: startOfDay() } }, { scheduledDate: null }] },
          include: { workout: { select: { id: true, name: true, type: true, items: { orderBy: { order: "asc" } } } }, camp: { select: { name: true } } },
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
    // The single next class on the schedule (in the viewer's scope) for the
    // header summary + quick sign-up button. Also pulls capacity + roster size
    // (for full check) and the caller's own roster row (to detect signed-up).
    db.class.findFirst({
      where: { startsAt: { gte: now }, ...classScope(user) },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        title: true,
        startsAt: true,
        location: true,
        capacity: true,
        dropInAllowed: true,
        campId: true,
        camp: { select: { division: true } },
        _count: { select: { roster: true } },
        ...(myCustomerId
          ? { roster: { where: { customerId: myCustomerId }, select: { id: true } } }
          : {}),
      },
    }),
    // The athlete's recent mock-test results, to review on the dashboard.
    myCustomerId
      ? db.mockResult.findMany({
          where: { customerId: myCustomerId },
          orderBy: { recordedAt: "desc" },
          take: 5,
          include: { class: { select: { id: true, title: true, startsAt: true } } },
        })
      : Promise.resolve([]),
    // Nutrition MVP — body stats power the targets, food/water/burn power the
    // intake side. All scoped to TODAY (UTC-anchored start/end of day).
    myCustomerId
      ? db.customer.findUnique({ where: { id: myCustomerId }, select: { gender: true, weightKg: true, heightCm: true, age: true } })
      : Promise.resolve(null),
    myCustomerId
      ? db.foodLog.findMany({
          where: { customerId: myCustomerId, loggedAt: { gte: startOfDay(), lte: endOfDay() } },
          select: { calories: true, proteinG: true, carbsG: true, fatG: true, fiberG: true },
        })
      : Promise.resolve([]),
    myCustomerId
      ? db.waterLog.findMany({
          where: { customerId: myCustomerId, loggedAt: { gte: startOfDay(), lte: endOfDay() } },
          select: { amountMl: true },
        })
      : Promise.resolve([]),
    myCustomerId
      ? db.workoutAssignment.findMany({
          where: { customerId: myCustomerId, scheduledDate: { gte: startOfDay(), lte: endOfDay() }, status: "completed" },
          select: { caloriesBurned: true, workout: { select: { items: { select: { timeSec: true, groupTimeSec: true } } } } },
        })
      : Promise.resolve([]),
    // Camps the athlete is an active member of — used to gate the dashboard
    // "Sign up" button on a camp class (drop-in classes are open to anyone).
    myCustomerId
      ? db.campMember.findMany({
          where: { customerId: myCustomerId, status: "active" },
          select: { campId: true },
        })
      : Promise.resolve([]),
  ]);

  const feedbackDoneClassIds = new Set(myFeedbackDone.map((p) => p.classId));
  const needFeedback = myPastRoster.filter((r) => !feedbackDoneClassIds.has(r.classId)).slice(0, 6);

  const todoItems = todos;
  // Group the athlete's plan into day sections (Today / Tomorrow / weekday) so
  // it reads as a schedule. Using the local calendar date keeps grouping and the
  // "Today" check consistent with how dates render (no UTC-slice day shift).
  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayK = dayKey(new Date());
  const tomorrowK = dayKey(addDays(new Date(), 1));
  type PlanItem = (typeof myAssignments)[number];
  const planGroups: { key: string; label: string; dateText: string; todo: number; items: PlanItem[] }[] = [];
  const planGroupIdx = new Map<string, number>();
  for (const a of myAssignments) {
    const key = a.scheduledDate ? dayKey(a.scheduledDate) : "anytime";
    let gi = planGroupIdx.get(key);
    if (gi == null) {
      gi = planGroups.length;
      planGroupIdx.set(key, gi);
      let label = "Anytime";
      let dateText = "";
      if (a.scheduledDate) {
        const [wd, ...rest] = formatDate(a.scheduledDate).split(", ");
        dateText = rest.join(", ");
        label = key === todayK ? "Today" : key === tomorrowK ? "Tomorrow" : wd;
      }
      planGroups.push({ key, label, dateText, todo: 0, items: [] });
    }
    planGroups[gi].items.push(a);
    if (a.status !== "completed") planGroups[gi].todo += 1;
  }
  // Glance summaries for the header: today's workout(s) and the next class.
  const todayItems = planGroups.find((g) => g.key === todayK)?.items ?? [];
  const todayTodo = todayItems.filter((a) => a.status !== "completed");
  const classDayLabel = (d: Date) => {
    const k = dayKey(d);
    return k === todayK ? "Today" : k === tomorrowK ? "Tomorrow" : formatDate(d);
  };
  const nextClass = nextClassRow;
  // Sign-up state for the dashboard next-class card:
  //   signedUp — already on the roster (show "You're in" + Drop)
  //   isFull   — capacity hit; hide the button
  //   eligible — camp class requires active membership (drop-ins are open)
  const myCampIds = new Set(myActiveCampIds.map((m) => m.campId));
  const nextClassSignedUp = !!nextClass && (nextClass as { roster?: { id: string }[] }).roster?.length === 1;
  const nextClassFull = !!nextClass && nextClass._count.roster >= nextClass.capacity;
  const nextClassEligible = !!nextClass && !!myCustomerId && (
    !nextClass.campId || nextClass.dropInAllowed || myCampIds.has(nextClass.campId)
  );

  // Show the plan card to every athlete (customers always; staff only once they
  // have something assigned — they manage plans elsewhere).
  const showPlan = !!myCustomerId && (myAssignments.length > 0 || !isStaff);

  // Today's nutrition rollup — anyone with a linked customer profile, including
  // staff who train (they have their own customer record). The coach view of
  // someone else's nutrition is a different surface on the customer profile.
  const showNutrition = !!myCustomerId;
  let nutritionProgress: ReturnType<typeof rollDay> | null = null;
  if (showNutrition) {
    const stats: Stats = { gender: myStats?.gender ?? null, weightKg: myStats?.weightKg ?? null, heightCm: myStats?.heightCm ?? null, age: myStats?.age ?? null };
    const exerciseMinutes = todayBurn.reduce((sum, a) => {
      const itemMin = a.workout.items.reduce((m, it) => m + ((it.timeSec ?? 0) + (it.groupTimeSec ?? 0)) / 60, 0);
      return sum + itemMin;
    }, 0);
    const intake: DayIntake = {
      caloriesIn: todayFood.reduce((s, r) => s + (r.calories ?? 0), 0),
      proteinG: todayFood.reduce((s, r) => s + (r.proteinG ?? 0), 0),
      carbsG: todayFood.reduce((s, r) => s + (r.carbsG ?? 0), 0),
      fatG: todayFood.reduce((s, r) => s + (r.fatG ?? 0), 0),
      fiberG: todayFood.reduce((s, r) => s + (r.fiberG ?? 0), 0),
      waterMl: todayWater.reduce((s, r) => s + r.amountMl, 0),
      caloriesOut: todayBurn.reduce((s, r) => s + (r.caloriesBurned ?? 0), 0),
      exerciseMinutes: Math.round(exerciseMinutes),
    };
    nutritionProgress = rollDay(stats, intake);
  }

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

  // Athlete signs up for a class from the dashboard's "Next class" card. Same
  // access checks as /api/class/[id]/signup — keeps the camp/drop-in gate
  // honest, and 409s when the class is already full.
  async function signUpForClass(formData: FormData) {
    "use server";
    const mine = await getMyCustomerId();
    if (!mine) redirect("/profile");
    const classId = String(formData.get("classId") ?? "");
    if (!classId) return;
    const cls = await db.class.findUnique({
      where: { id: classId },
      select: { campId: true, dropInAllowed: true, capacity: true, _count: { select: { roster: true } } },
    });
    if (!cls) return;
    let allowed = !cls.campId || cls.dropInAllowed;
    if (!allowed && cls.campId) {
      const mem = await db.campMember.findFirst({
        where: { campId: cls.campId, customerId: mine, status: "active" },
        select: { id: true },
      });
      allowed = !!mem;
    }
    if (!allowed) {
      redirect(flashUrl("/", "Not eligible to sign up"));
    }
    const existing = await db.rosterEntry.findUnique({
      where: { classId_customerId: { classId, customerId: mine } },
      select: { id: true },
    });
    if (existing) {
      revalidatePath("/");
      return;
    }
    if (cls._count.roster >= cls.capacity) {
      redirect(flashUrl("/", "Class is full"));
    }
    await db.rosterEntry.create({ data: { classId, customerId: mine } });
    revalidatePath("/");
    revalidatePath(`/classes/${classId}`);
    redirect(flashUrl("/", "Signed up"));
  }
  // Athlete drops the class they just signed up to.
  async function dropFromClass(formData: FormData) {
    "use server";
    const mine = await getMyCustomerId();
    if (!mine) redirect("/profile");
    const classId = String(formData.get("classId") ?? "");
    if (!classId) return;
    await db.rosterEntry.deleteMany({ where: { classId, customerId: mine } });
    revalidatePath("/");
    revalidatePath(`/classes/${classId}`);
    redirect(flashUrl("/", "Dropped from class"));
  }

  // Staff approve a pending camp application straight from the dashboard.
  async function approveApplication(formData: FormData) {
    "use server";
    const actor = await requireStaff();
    const memberId = String(formData.get("memberId") ?? "");
    if (!memberId) return;
    const m = await db.campMember.update({ where: { id: memberId }, data: { status: "active" }, select: { campId: true, customerId: true } });
    // Catch the approved member up on the plan already assigned for this camp.
    await backfillCampPlan(m.campId, m.customerId, actor.id);
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <div className="text-sm text-muted">{formatDateLong(now)}</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Welcome back, {user.name.split(" ")[0]}</h1>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <SummaryCard
          icon={Dumbbell}
          label="Today's workout"
          title={todayItems.length === 0 ? "Rest day" : (todayTodo[0]?.workout.name ?? todayItems[0].workout.name)}
          sub={
            todayItems.length === 0
              ? "Nothing scheduled — enjoy the recovery"
              : todayTodo.length === 0
                ? "All done for today ✓"
                : todayItems.length > 1
                  ? `+${todayItems.length - 1} more · tap to view`
                  : "Tap to view the exercises"
          }
          href={todayItems.length === 1 ? `/workouts/${todayItems[0].workout.id}` : "/calendar?view=day"}
          muted={todayItems.length === 0}
        />
        {nextClass ? (
          <div className="bg-card border border-border rounded-xl p-5 hover:border-accent transition">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted uppercase tracking-wide">Next class</div>
              <Calendar size={16} className="text-muted shrink-0" />
            </div>
            <div className="mt-2 flex items-start gap-3">
              <Link href={`/classes/${nextClass.id}`} className="min-w-0 flex-1 group">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-semibold leading-tight truncate group-hover:text-orange-700">{nextClass.title}</span>
                  {divisionMeta(nextClass.camp?.division) && (
                    <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${divisionMeta(nextClass.camp?.division)!.cls}`}>
                      {divisionMeta(nextClass.camp?.division)!.label}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted mt-1 truncate">{classDayLabel(nextClass.startsAt)} · {formatTime(nextClass.startsAt)}</div>
                {nextClass.location && <div className="text-xs text-muted mt-0.5 truncate">at {nextClass.location}</div>}
                <div className="text-[11px] text-muted mt-1 tabular-nums">{nextClass._count.roster} / {nextClass.capacity} signed up</div>
              </Link>
              {/* Quick sign-up: only shown for athletes (myCustomerId set);
                  staff/admins who aren't a customer see the card without the
                  button. */}
              {myCustomerId && (
                nextClassSignedUp ? (
                  <form action={dropFromClass} className="shrink-0 text-right">
                    <input type="hidden" name="classId" value={nextClass.id} />
                    <div className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">✓ You&apos;re in</div>
                    <button type="submit" className="block ml-auto mt-1.5 text-[11px] text-muted hover:text-red-600 underline">Drop</button>
                  </form>
                ) : nextClassFull ? (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 rounded-full bg-zinc-100 px-2 py-1">Full</span>
                ) : !nextClassEligible ? (
                  <span className="shrink-0 text-[11px] text-muted text-right max-w-[8rem]">Camp members only</span>
                ) : (
                  <form action={signUpForClass} className="shrink-0">
                    <input type="hidden" name="classId" value={nextClass.id} />
                    <button type="submit" className="rounded-lg bg-foreground text-white px-3 py-1.5 text-xs font-medium hover:opacity-90 whitespace-nowrap">Sign up</button>
                  </form>
                )
              )}
            </div>
          </div>
        ) : (
          <SummaryCard
            icon={Calendar}
            label="Next class"
            title="No upcoming classes"
            sub="Nothing on the schedule"
            href="/calendar"
            muted
          />
        )}
      </div>

      {/* Today's nutrition — athlete-only quick glance. Sits above the main
          grid so it's the first thing they see after the summary cards. */}
      {showNutrition && nutritionProgress && (
        <div className="mb-8">
          <TodayNutrition
            progress={nutritionProgress}
            hasStats={myStats?.weightKg != null && myStats?.heightCm != null && myStats?.age != null && (myStats?.gender === "male" || myStats?.gender === "female")}
            restingKcal={bmrKcal({ gender: myStats?.gender ?? null, weightKg: myStats?.weightKg ?? null, heightCm: myStats?.heightCm ?? null, age: myStats?.age ?? null })}
          />
        </div>
      )}

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
                  <Link href={`/customers/${m.customerId}`} className="text-sm font-medium hover:text-orange-700">{m.customer.name}</Link>
                  <div className="text-xs text-muted">
                    applied to <Link href={`/camps/${m.campId}`} className="font-medium hover:text-orange-700">{m.camp.name}</Link>
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

      {/* Athletes get a single column (just their plan, feedback, mocks,
          todos) — no right-hand sidebar duplicating what's already above.
          Staff still get the 3+2 split because they need the class-management
          views (today's roster, next 7 days, recent customer activity). */}
      <div className={isStaff ? "grid grid-cols-1 lg:grid-cols-5 gap-6" : ""}>
        <section className={`space-y-6${isStaff ? " lg:col-span-3" : ""}`}>
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
                (() => {
                  // Split the plan into TODAY (expanded) and UPCOMING (collapsed
                  // into a <details> disclosure). "Anytime" items count as today
                  // so they're not buried in the disclosure. Counters power the
                  // disclosure summary so the athlete sees scope at a glance.
                  const todayGroups = planGroups.filter((g) => g.key === todayK || g.key === "anytime");
                  const futureGroups = planGroups.filter((g) => g.key !== todayK && g.key !== "anytime");
                  const futureItems = futureGroups.reduce((n, g) => n + g.items.length, 0);
                  const futureTodo = futureGroups.reduce((n, g) => n + g.todo, 0);
                  function renderGroup(g: typeof planGroups[number]) {
                    return (
                      <section key={g.key}>
                        <div className="flex items-baseline gap-2 mb-2 px-0.5">
                          <h3 className="text-sm font-semibold tracking-tight">{g.label}</h3>
                          {g.dateText && <span className="text-xs text-muted">{g.dateText}</span>}
                        </div>
                        <ul className="space-y-3">
                          {g.items.map((a) => {
                            const done = a.status === "completed";
                            return (
                              <li key={a.id} id={`plan-${a.id}`} className={`scroll-mt-20 bg-card border rounded-xl p-4 ${done ? "border-emerald-200" : "border-border"}`}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold">{a.workout.name}</span>
                                  {a.camp && <span className="text-[11px] text-orange-700">· {a.camp.name}</span>}
                                  {done && <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700">done</span>}
                                </div>

                                {done ? <ExerciseList items={a.workout.items} /> : <PlanExerciseChecklist items={a.workout.items} storageKey={a.id} />}

                                {(a.coachSuggestion || a.foodAdvice) && (
                                  <div className="mt-3 space-y-1">
                                    {a.coachSuggestion && <div className="text-xs rounded-lg bg-orange-50 px-2.5 py-1.5 leading-snug"><span className="font-semibold text-orange-700">Coach</span> · {a.coachSuggestion}</div>}
                                    {a.foodAdvice && <div className="text-xs rounded-lg bg-emerald-50 px-2.5 py-1.5 leading-snug"><span className="font-semibold text-emerald-700">Food</span> · {a.foodAdvice}</div>}
                                  </div>
                                )}
                                {done && (a.rpe != null || a.feeling) && (
                                  <div className="mt-2 text-xs text-muted">{a.rpe != null ? `RPE ${a.rpe}` : ""}{a.feeling ? `${a.rpe != null ? " · " : ""}${a.feeling}` : ""}</div>
                                )}

                                {!done && (a.workout.type === "relax" ? (
                                  /* Relax sessions are just-tick-off — no RPE/feeling/notes. */
                                  <form action={logMyAssignment} className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
                                    <input type="hidden" name="assignmentId" value={a.id} />
                                    <input type="hidden" name="status" value="completed" />
                                    <span className="text-[11px] text-muted">Relax session — no feedback needed.</span>
                                    <button type="submit" className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium">Mark done</button>
                                  </form>
                                ) : (
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
                                ))}
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    );
                  }
                  return (
                    <div className="space-y-5">
                      {todayGroups.length === 0 ? (
                        <div className="bg-card border border-border border-dashed rounded-xl p-4 text-center text-sm text-muted">
                          Nothing scheduled today — rest up, or expand <span className="font-medium">Coming up</span> to preview the rest of the week.
                        </div>
                      ) : (
                        todayGroups.map(renderGroup)
                      )}

                      {futureGroups.length > 0 && (
                        <details className="bg-card border border-border rounded-xl group">
                          <summary className="cursor-pointer flex items-center justify-between gap-2 px-4 py-3 list-none select-none">
                            <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                              <span className="text-sm font-medium">Coming up</span>
                              <span className="text-xs text-muted">{futureItems} workout{futureItems === 1 ? "" : "s"} · {futureGroups.length} day{futureGroups.length === 1 ? "" : "s"}</span>
                              {futureTodo > 0 && <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-orange-100 text-orange-700">{futureTodo} to do</span>}
                            </div>
                            <ChevronDown size={14} className="text-muted shrink-0 transition group-open:rotate-180" />
                          </summary>
                          <div className="border-t border-border p-4 space-y-5">
                            {futureGroups.map(renderGroup)}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })()
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
                        {r.class.feedbackRequestedAt && <span className="ml-2 text-orange-700">· requested by your coach</span>}
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

          {myMockResults.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Recent mock tests</h2>
              <ul className="bg-card border border-border rounded-xl divide-y divide-border">
                {myMockResults.map((mr) => {
                  let count = 0;
                  try { count = mr.timesJson ? Object.keys(JSON.parse(mr.timesJson) as Record<string, number>).length : 0; } catch {}
                  const total = mr.totalSec != null
                    ? (mr.totalSec >= 3600
                        ? `${Math.floor(mr.totalSec / 3600)}:${String(Math.floor((mr.totalSec % 3600) / 60)).padStart(2, "0")}:${String(mr.totalSec % 60).padStart(2, "0")}`
                        : `${Math.floor(mr.totalSec / 60)}:${String(mr.totalSec % 60).padStart(2, "0")}`)
                    : null;
                  return (
                    <li key={mr.id}>
                      <Link href={`/classes/${mr.class.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-background">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{mr.class.title}</div>
                          <div className="text-xs text-muted">{formatDate(mr.class.startsAt)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          {total && <div className="text-sm font-semibold tabular-nums">{total}</div>}
                          <div className="text-[11px] text-muted">{count > 0 ? `${count} exercise${count === 1 ? "" : "s"}` : total ? "total time" : "—"}</div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <TodoList todos={todoItems} />

          {/* Coach-management view of today's classes: roster size + attendance.
              Athletes already see their next class up top and their training plan
              above — they don't need this. */}
          {isStaff && (
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
          )}
        </section>

        {/* Staff-only right rail: next-7-day class schedule + recent customer
            activity. Athletes don't need either — their plan + next class +
            calendar nav cover this. */}
        {isStaff && (
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
        )}
      </div>
    </div>
  );
}

function divisionMeta(division?: string | null): { label: string; cls: string } | undefined {
  if (!division) return undefined;
  const cls: Record<string, string> = {
    open: "bg-sky-100 text-sky-700",
    pro: "bg-violet-100 text-violet-700",
    doubles: "bg-amber-100 text-amber-700",
    relay: "bg-teal-100 text-teal-700",
  };
  return { label: division.charAt(0).toUpperCase() + division.slice(1), cls: cls[division] ?? "bg-zinc-100 text-zinc-600" };
}

function SummaryCard({ icon: Icon, label, title, sub, sub2, badge, href, muted = false }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; title: string; sub?: string; sub2?: string; badge?: { label: string; cls: string }; href: string; muted?: boolean }) {
  return (
    <Link href={href} className="bg-card border border-border rounded-xl p-5 hover:border-accent transition block">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
        <Icon size={16} className="text-muted shrink-0" />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className={`text-lg font-semibold leading-tight truncate ${muted ? "text-muted" : ""}`}>{title}</span>
        {badge && <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>}
      </div>
      {sub && <div className="text-xs text-muted mt-1 truncate">{sub}</div>}
      {sub2 && <div className="text-xs text-muted mt-0.5 truncate">{sub2}</div>}
    </Link>
  );
}
