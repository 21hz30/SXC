import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, requireStaff, getMyCustomerId } from "@/lib/auth";
import { formatTime, formatDate, startOfDay, endOfDay, addDays, formatDateLong } from "@/lib/utils";
import { Calendar, ChevronDown, Dumbbell, KeyRound, Tent, UserPlus } from "lucide-react";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import ClassSignupButton from "@/components/ClassSignupButton";
import { backfillCampPlan } from "@/domain/camps";
import { decideConnection, connectByCode, disconnectCoachConnection } from "@/domain/coachConnections";
import ExerciseList from "@/components/ExerciseList";
import PlanExerciseChecklist from "@/components/PlanExerciseChecklist";
import MarkDoneFeedback from "@/components/MarkDoneFeedback";
import TodayNutrition from "@/components/TodayNutrition";
import { flashUrl } from "@/lib/flash";
import { classScope, campScope, canAccessCamp } from "@/lib/access";
import { rollDay, bmrKcal, type Stats, type DayIntake } from "@/domain/nutrition";
import { FEATURES } from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const isStaff = user.role === "admin" || user.role === "coach";
  const now = new Date();
  const myCustomerId = await getMyCustomerId();
  const [dropInClasses, myAssignments, myClassSessions, myWorkouts, myPastRoster, myFeedbackDone, pendingApplications, nextClassRow, myMockResults, myStats, todayFood, todayWater, todayBurn, myActiveCampIds, myInvitationCode, pendingConnections, myCoaches] = await Promise.all([
    // Every open drop-in over the next seven days. classScope keeps coaches in
    // their tenant while customers can discover all classes open to drop-ins.
    db.class.findMany({
      where: {
        startsAt: { gte: now, lte: endOfDay(addDays(now, 7)) },
        dropInAllowed: true,
        canceledAt: null,
        ...classScope(user),
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        title: true,
        startsAt: true,
        location: true,
        capacity: true,
        camp: { select: { name: true, division: true } },
        _count: { select: { roster: true } },
        roster: {
          where: { customerId: myCustomerId ?? "__none__" },
          select: { id: true },
        },
      },
    }),
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
    // Roster membership is the source of truth for class sessions. Detect the
    // next seven days automatically so classes appear in the athlete's plan
    // without creating duplicate WorkoutAssignment rows.
    myCustomerId
      ? db.class.findMany({
          where: {
            startsAt: { gte: startOfDay(), lte: endOfDay(addDays(now, 7)) },
            canceledAt: null,
            roster: { some: { customerId: myCustomerId } },
          },
          orderBy: { startsAt: "asc" },
          select: {
            id: true,
            title: true,
            startsAt: true,
            durationMin: true,
            location: true,
            camp: { select: { name: true } },
          },
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
    // Scoped to the coach's own camps (admins see all) so a coach's inbox never
    // surfaces another tenant's applications.
    isStaff
      ? db.campMember.findMany({
          where: { status: "pending", camp: campScope(user), customer: { deletedAt: null } },
          include: { customer: { select: { id: true, name: true } }, camp: { select: { id: true, name: true } } },
          orderBy: { joinedAt: "asc" },
        })
      : Promise.resolve([]),
    // The single next class on the schedule (in the viewer's scope) for the
    // header summary + quick sign-up button. Also pulls capacity + roster size
    // (for full check) and the caller's own roster row (to detect signed-up).
    db.class.findFirst({
      where: { startsAt: { gte: now }, canceledAt: null, ...classScope(user) },
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
    FEATURES.nutrition && myCustomerId
      ? db.customer.findUnique({ where: { id: myCustomerId }, select: { gender: true, weightKg: true, heightCm: true, age: true } })
      : Promise.resolve(null),
    FEATURES.nutrition && myCustomerId
      ? db.foodLog.findMany({
          where: { customerId: myCustomerId, loggedAt: { gte: startOfDay(), lte: endOfDay() } },
          select: { calories: true, proteinG: true, carbsG: true, fatG: true, fiberG: true },
        })
      : Promise.resolve([]),
    FEATURES.nutrition && myCustomerId
      ? db.waterLog.findMany({
          where: { customerId: myCustomerId, loggedAt: { gte: startOfDay(), lte: endOfDay() } },
          select: { amountMl: true },
        })
      : Promise.resolve([]),
    FEATURES.nutrition && myCustomerId
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
    // The coach's own invitation code — shown on their dashboard so they can
    // share it without digging into /admin/tenants or a customer profile.
    user.role === "coach"
      ? db.user.findUnique({ where: { id: user.id }, select: { invitationCode: true } }).then((u) => u?.invitationCode ?? null)
      : Promise.resolve(null),
    // Athletes who pasted this coach's invitation code and are waiting to be
    // approved (#31). A coach sees only their own inbox; an admin sees every
    // tenant's pending requests (with the target coach named) so nothing stalls.
    isStaff
      ? db.customerCoach.findMany({
          where: { status: "pending", customer: { deletedAt: null }, coach: { deletedAt: null }, ...(user.role === "coach" ? { coachUserId: user.id } : {}) },
          orderBy: { requestedAt: "asc" },
          include: {
            customer: { select: { id: true, name: true } },
            coach: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
    // The athlete's own coach connections (active + pending), for the dashboard
    // "Your coaches" quick-connect card. Athletes can link multiple coaches.
    myCustomerId && !isStaff
      ? db.customerCoach.findMany({
          where: { customerId: myCustomerId, status: { in: ["pending", "active"] }, coach: { deletedAt: null } },
          orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
          include: { coach: { select: { id: true, name: true, tenant: { select: { name: true } } } } },
        })
      : Promise.resolve([]),
  ]);

  const feedbackDoneClassIds = new Set(myFeedbackDone.map((p) => p.classId));
  const needFeedback = myPastRoster.filter((r) => !feedbackDoneClassIds.has(r.classId)).slice(0, 6);

  // Group assigned workouts and rostered classes into one day-by-day schedule.
  // Using the local calendar date keeps grouping consistent with date rendering.
  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayK = dayKey(new Date());
  const tomorrowK = dayKey(addDays(new Date(), 1));
  type PlanWorkout = (typeof myAssignments)[number];
  type PlanClass = (typeof myClassSessions)[number];
  type PlanGroup = { key: string; label: string; dateText: string; open: number; workouts: PlanWorkout[]; classes: PlanClass[] };
  const planGroupMap = new Map<string, PlanGroup>();

  function ensurePlanGroup(date: Date | null): PlanGroup {
    const key = date ? dayKey(date) : "anytime";
    const existing = planGroupMap.get(key);
    if (existing) return existing;

    let label = "Anytime";
    let dateText = "";
    if (date) {
      const [wd, ...rest] = formatDate(date).split(", ");
      dateText = rest.join(", ");
      label = key === todayK ? "Today" : key === tomorrowK ? "Tomorrow" : wd;
    }
    const group: PlanGroup = { key, label, dateText, open: 0, workouts: [], classes: [] };
    planGroupMap.set(key, group);
    return group;
  }

  for (const a of myAssignments) {
    const group = ensurePlanGroup(a.scheduledDate);
    group.workouts.push(a);
    if (a.status !== "completed") group.open += 1;
  }
  for (const c of myClassSessions) ensurePlanGroup(c.startsAt).classes.push(c);

  const planGroups = [...planGroupMap.values()].sort((a, b) => {
    if (a.key === "anytime") return -1;
    if (b.key === "anytime") return 1;
    return a.key.localeCompare(b.key);
  });

  // Glance summaries for the header: today's workouts/classes and the next class.
  const todayGroup = planGroupMap.get(todayK);
  const todayWorkouts = todayGroup?.workouts ?? [];
  const todayClassSessions = todayGroup?.classes ?? [];
  const todayOpen = todayWorkouts.filter((a) => a.status !== "completed");
  const todayTrainingCount = todayWorkouts.length + todayClassSessions.length;
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
  const showPlan = !!myCustomerId && (myAssignments.length > 0 || myClassSessions.length > 0 || !isStaff);

  // Today's nutrition rollup — anyone with a linked customer profile, including
  // staff who train (they have their own customer record). The coach view of
  // someone else's nutrition is a different surface on the customer profile.
  const showNutrition = FEATURES.nutrition && !!myCustomerId;
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

  // Athlete connects to a coach by code straight from the dashboard (quick
  // connect). Reuses the same rules as the profile's "My coaches" — pending
  // request the coach approves. Athletes can link multiple coaches.
  async function connectMyCoach(formData: FormData) {
    "use server";
    const mine = await getMyCustomerId();
    if (!mine) redirect("/profile");
    const res = await connectByCode(mine, String(formData.get("code") ?? ""));
    revalidatePath("/");
    redirect(flashUrl("/", res.ok ? `Request sent to ${res.coachName} — they'll approve soon` : res.message));
  }
  // Athlete drops one of their coach connections from the dashboard.
  async function disconnectMyCoach(formData: FormData) {
    "use server";
    const mine = await getMyCustomerId();
    if (!mine) redirect("/profile");
    await disconnectCoachConnection(mine, String(formData.get("connId") ?? ""));
    revalidatePath("/");
    redirect(flashUrl("/", "Coach disconnected"));
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
    // Only act on an application to a camp the actor runs (admins span all).
    const member = await db.campMember.findUnique({ where: { id: memberId }, select: { campId: true, customerId: true, camp: { select: { id: true, coachId: true, createdById: true } } } });
    if (!member || !canAccessCamp(actor, member.camp)) redirect(flashUrl("/", "That application isn't yours to review"));
    await db.campMember.update({ where: { id: memberId }, data: { status: "active" } });
    // Catch the approved member up on the plan already assigned for this camp.
    await backfillCampPlan(member.campId, member.customerId, actor.id);
    revalidatePath("/");
    revalidatePath(`/camps/${member.campId}`);
    revalidatePath("/camps");
    redirect(flashUrl("/", "Application approved"));
  }
  // Staff reject (delete) a pending application.
  async function rejectApplication(formData: FormData) {
    "use server";
    const actor = await requireStaff();
    const memberId = String(formData.get("memberId") ?? "");
    if (!memberId) return;
    const member = await db.campMember.findUnique({ where: { id: memberId }, select: { campId: true, camp: { select: { id: true, coachId: true, createdById: true } } } });
    if (!member || !canAccessCamp(actor, member.camp)) redirect(flashUrl("/", "That application isn't yours to review"));
    await db.campMember.delete({ where: { id: memberId } });
    revalidatePath("/");
    revalidatePath(`/camps/${member.campId}`);
    revalidatePath("/camps");
    redirect(flashUrl("/", "Application rejected"));
  }

  // Staff approve / decline an athlete's connection request (#31). The rules
  // (ownership, pending-only, active-vs-delete) live in decideConnection.
  async function approveConnection(formData: FormData) {
    "use server";
    const actor = await requireStaff();
    const res = await decideConnection(actor, String(formData.get("connId") ?? ""), "approve");
    revalidatePath("/");
    if (res.ok) revalidatePath("/customers");
    redirect(flashUrl("/", res.message));
  }
  async function rejectConnection(formData: FormData) {
    "use server";
    const actor = await requireStaff();
    const res = await decideConnection(actor, String(formData.get("connId") ?? ""), "decline");
    revalidatePath("/");
    redirect(flashUrl("/", res.message));
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
          label="Today's training"
          title={todayTrainingCount === 0 ? "Rest day" : (todayOpen[0]?.workout.name ?? todayClassSessions[0]?.title ?? todayWorkouts[0].workout.name)}
          sub={
            todayTrainingCount === 0
              ? "Nothing scheduled — enjoy the recovery"
              : todayOpen.length === 0 && todayClassSessions.length === 0
                ? "All done for today ✓"
                : todayTrainingCount > 1
                  ? `+${todayTrainingCount - 1} more · tap to view`
                  : todayClassSessions.length === 1 && todayWorkouts.length === 0
                    ? `${formatTime(todayClassSessions[0].startsAt)} class session`
                    : "Tap to view the exercises"
          }
          href={
            todayTrainingCount === 1
              ? todayClassSessions.length === 1
                ? `/classes/${todayClassSessions[0].id}`
                : `/workouts/${todayWorkouts[0].workout.id}`
              : "/calendar?view=day"
          }
          muted={todayTrainingCount === 0}
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

      {/* Athletes who entered this coach's invitation code, awaiting approval
          (#31). Sky-tinted to set it apart from the amber camp applications. */}
      {isStaff && pendingConnections.length > 0 && (
        <div className="mb-8 bg-sky-50 border border-sky-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <UserPlus size={16} className="text-sky-600 shrink-0" />
            <h2 className="text-sm font-semibold text-sky-900">
              {pendingConnections.length} athlete{pendingConnections.length === 1 ? "" : "s"} want{pendingConnections.length === 1 ? "s" : ""} to connect
            </h2>
          </div>
          <ul className="divide-y divide-sky-200">
            {pendingConnections.map((conn) => (
              <li key={conn.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link href={`/customers/${conn.customerId}`} className="text-sm font-medium hover:text-orange-700">{conn.customer.name}</Link>
                  <div className="text-xs text-muted">
                    {/* Coaches know it's them; admins need the target coach named. */}
                    {user.role === "admin" ? <>wants <span className="font-medium">{conn.coach.name}</span> as their coach</> : "wants you as their coach"}
                    <span className="mx-1">·</span>{formatDate(conn.requestedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <form action={approveConnection}>
                    <input type="hidden" name="connId" value={conn.id} />
                    <button type="submit" className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:opacity-90">Approve</button>
                  </form>
                  <form action={rejectConnection}>
                    <input type="hidden" name="connId" value={conn.id} />
                    <ConfirmSubmit message={`Decline ${conn.customer.name}'s request to connect?`} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-red-600 hover:bg-sky-100">Decline</ConfirmSubmit>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Discovery stays full-width so the dashboard never collapses into an
          empty main column with a narrow schedule rail. */}
      <div className={`mb-8${user.role === "coach" && myInvitationCode ? " grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start" : ""}`}>
        <DropInClassList classes={dropInClasses} signupEnabled={!!myCustomerId} />

        {user.role === "coach" && myInvitationCode && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound size={14} className="text-muted shrink-0" />
              <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Your invitation code</h2>
            </div>
            <code className="block text-base font-mono tracking-wider rounded-lg bg-background border border-border px-3 py-2 mb-2 select-all">{myInvitationCode}</code>
            <p className="text-xs text-muted leading-snug">Share this with an athlete so they can connect with you. Once they paste it on their profile, you&apos;ll see the request here to approve.</p>
          </div>
        )}
      </div>

      <section className="space-y-6">
          {showPlan && (
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Your training plan</h2>
                <span className="text-xs text-muted">{myAssignments.length + myClassSessions.length} scheduled</span>
              </div>

              {myAssignments.length === 0 && myClassSessions.length === 0 ? (
                <div className="bg-card border border-border border-dashed rounded-xl p-5 text-center text-sm text-muted">
                  Nothing scheduled right now. Add one of your own workouts below, or sign up for a class.
                </div>
              ) : (
                (() => {
                  // Split the plan into TODAY (expanded) and UPCOMING (collapsed
                  // into a <details> disclosure). "Anytime" items count as today
                  // so they're not buried in the disclosure. Counters power the
                  // disclosure summary so the athlete sees scope at a glance.
                  const todayGroups = planGroups.filter((g) => g.key === todayK || g.key === "anytime");
                  const futureGroups = planGroups.filter((g) => g.key !== todayK && g.key !== "anytime");
                  const futureItems = futureGroups.reduce((n, g) => n + g.workouts.length + g.classes.length, 0);
                  const futureOpen = futureGroups.reduce((n, g) => n + g.open, 0);
                  function renderGroup(g: typeof planGroups[number]) {
                    return (
                      <section key={g.key}>
                        <div className="flex items-baseline gap-2 mb-2 px-0.5">
                          <h3 className="text-sm font-semibold tracking-tight">{g.label}</h3>
                          {g.dateText && <span className="text-xs text-muted">{g.dateText}</span>}
                        </div>
                        <ul className="space-y-3">
                          {g.classes.map((c) => (
                            <li key={`class-${c.id}`} className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                              <Link href={`/classes/${c.id}`} className="block group">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Calendar size={15} className="text-sky-700 shrink-0" />
                                  <span className="font-semibold group-hover:text-sky-800">{c.title}</span>
                                  <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-sky-100 text-sky-700">Class session</span>
                                </div>
                                <div className="mt-1.5 text-xs text-muted flex flex-wrap gap-x-2 gap-y-1">
                                  <span>{formatTime(c.startsAt)} · {c.durationMin} min</span>
                                  {c.camp && <span>· {c.camp.name}</span>}
                                  {c.location && <span>· {c.location}</span>}
                                </div>
                              </Link>
                            </li>
                          ))}
                          {g.workouts.map((a) => {
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
                                  /* Tapping "Mark done" pops a feedback sheet (RPE / feeling /
                                     notes) so it isn't skipped, then marks the assignment done. */
                                  <MarkDoneFeedback assignmentId={a.id} workoutName={a.workout.name} action={logMyAssignment} />
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
                              <span className="text-xs text-muted">{futureItems} session{futureItems === 1 ? "" : "s"} · {futureGroups.length} day{futureGroups.length === 1 ? "" : "s"}</span>
                              {futureOpen > 0 && <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-orange-100 text-orange-700">{futureOpen} to do</span>}
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

          {/* Quick-connect with a coach (athletes only). Athletes can link more
              than one coach — each connection is approved by that coach. */}
          {!isStaff && myCustomerId && (
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Your coaches</h2>
                {myCoaches.length > 0 && (
                  <span className="text-xs text-muted">{myCoaches.filter((c) => c.status === "active").length} connected</span>
                )}
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                {myCoaches.length === 0 ? (
                  <p className="text-sm text-muted mb-3">You&apos;re not connected to a coach yet. Enter your coach&apos;s code to send a request.</p>
                ) : (
                  <ul className="divide-y divide-border mb-3">
                    {myCoaches.map((conn) => (
                      <li key={conn.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{conn.coach.name}</div>
                          {conn.coach.tenant && <div className="text-[11px] text-muted truncate">{conn.coach.tenant.name}</div>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5 ${conn.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                            {conn.status === "active" ? "connected" : "pending"}
                          </span>
                          <form action={disconnectMyCoach}>
                            <input type="hidden" name="connId" value={conn.id} />
                            <ConfirmSubmit message={`Disconnect from ${conn.coach.name}? You can reconnect later with their code.`} className="text-[11px] text-muted hover:text-red-600 underline">Disconnect</ConfirmSubmit>
                          </form>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <form action={connectMyCoach} className="flex flex-col sm:flex-row gap-2">
                  <input
                    name="code"
                    required
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="Coach code e.g. SRC-TAY-9X3K"
                    className="flex-1 min-w-0 rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono tracking-wider uppercase"
                  />
                  <button type="submit" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium hover:opacity-90 inline-flex items-center justify-center gap-1.5">
                    <UserPlus size={15} /> Connect
                  </button>
                </form>
                <p className="text-[11px] text-muted mt-2 leading-snug">Add as many coaches as you like — each gets a request to approve before you see their plans.</p>
              </div>
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
              <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Recent simulation races</h2>
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

      </section>
    </div>
  );
}

type DropInClassItem = {
  id: string;
  title: string;
  startsAt: Date;
  location: string | null;
  capacity: number;
  camp: { name: string; division: string | null } | null;
  _count: { roster: number };
  roster: { id: string }[];
};

function DropInClassList({ classes, signupEnabled }: { classes: DropInClassItem[]; signupEnabled: boolean }) {
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-3">
        <div>
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Drop-in schedule</h2>
          <p className="text-xs text-muted mt-1">
            {classes.length} open session{classes.length === 1 ? "" : "s"} in the next 7 days
          </p>
        </div>
        <Link href="/calendar" className="inline-flex items-center gap-1.5 text-xs font-medium hover:text-orange-700 self-start sm:self-auto">
          <Calendar size={14} /> View calendar
        </Link>
      </div>
      {classes.length === 0 ? (
        <div className="bg-card border border-border border-dashed rounded-xl px-5 py-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Calendar size={20} className="text-muted shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium">No drop-in sessions scheduled</div>
              <div className="text-xs text-muted mt-1">New sessions will appear here as soon as they open.</div>
            </div>
          </div>
          <Link href="/calendar" className="text-xs font-medium underline underline-offset-4 hover:text-orange-700 self-start sm:self-auto">Browse the calendar</Link>
        </div>
      ) : (
        <ul className={classes.length === 1 ? "" : "grid grid-cols-1 md:grid-cols-2 gap-3"}>
          {classes.map((c) => {
            const division = divisionMeta(c.camp?.division);
            return (
              <li key={c.id} className="bg-card border border-border rounded-xl p-4 flex flex-col">
                <Link href={`/classes/${c.id}`} className="min-w-0 flex-1 group">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold group-hover:text-orange-700">{c.title}</span>
                    {division && <span className={`text-[9px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${division.cls}`}>{division.label}</span>}
                  </div>
                  <div className="text-xs text-muted mt-2 flex items-center gap-1.5">
                    <Calendar size={13} className="shrink-0" />
                    <span>{formatDate(c.startsAt)} · {formatTime(c.startsAt)}</span>
                  </div>
                  {(c.camp?.name || c.location) && (
                    <div className="text-[11px] text-muted mt-1 leading-snug">{[c.camp?.name, c.location].filter(Boolean).join(" · ")}</div>
                  )}
                </Link>
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-3">
                  <span className="text-xs text-muted tabular-nums">{c._count.roster} / {c.capacity} signed up</span>
                  {signupEnabled && (
                    <ClassSignupButton
                      classId={c.id}
                      signedUp={c.roster.length > 0}
                      isFull={c._count.roster >= c.capacity}
                      size="xs"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
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
