import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatDate, formatTime, mondayOf } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import CampSchedule from "@/components/CampSchedule";
import CampPlanBuilder from "@/components/CampPlanBuilder";
import { requireStaff, requireUser , getMyCustomerId } from "@/lib/auth";
import { canAccessCamp, customerScope, workoutScope } from "@/lib/access";
import { customerDetail, customerOptionLabel } from "@/domain/customers";
import { backfillCampPlan } from "@/domain/camps";
import { flashUrl } from "@/lib/flash";

export const dynamic = "force-dynamic";

export default async function CampDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; planWeek?: string }> }) {
  const user = await requireUser();
  const isStaff = user.role === "admin" || user.role === "coach";
  const { id } = await params;
  const sp = await searchParams;
  const edit = isStaff ? sp.edit : undefined; // only staff get the edit form
  // The plan builder loads one Mon–Sun week; default to the upcoming Monday (UTC).
  const defaultMonday = (() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() + ((8 - day) % 7 || 7));
    return d.toISOString().slice(0, 10);
  })();
  // Always anchor the plan grid to a Monday, even if a non-Monday date arrives
  // via ?planWeek — that keeps every column's weekday label matching its date.
  const rawWeek = isStaff && /^\d{4}-\d{2}-\d{2}$/.test(sp.planWeek ?? "") ? sp.planWeek! : defaultMonday;
  const planWeek = mondayOf(rawWeek);
  const planBase = new Date(planWeek);

  // All independent reads run in parallel — one DB round-trip instead of four.
  const [camp, allCustomers, allWorkouts, coaches, myCustomerId, planRows, weekPlanRows] = await Promise.all([
    db.camp.findUnique({
      where: { id },
      include: {
        coach: true,
        createdBy: true,
        members: { include: { customer: true } },
        classes: {
          orderBy: { startsAt: "asc" },
          include: {
            workouts: { orderBy: { order: "asc" }, include: { workout: { select: { id: true, name: true } } } },
            roster: true,
            createdBy: { select: { name: true } },
          },
        },
      },
    }),
    // Add-member + workout pickers, tenant-scoped: a coach only sees the
    // athletes connected to them and their own tenant's library (admin = all).
    isStaff ? db.customer.findMany({ where: customerScope(user), orderBy: { name: "asc" } }) : Promise.resolve([]),
    isStaff
      ? db.workout.findMany({ where: workoutScope(user), orderBy: { name: "asc" }, select: { id: true, name: true, description: true, items: { select: { id: true } } } })
      : Promise.resolve([]),
    edit ? db.user.findMany({ where: { role: { in: ["admin", "coach"] } }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    // Staff have a profile too, so they can join the camp and its classes as a
    // real participant — fetch their customer id like anyone else.
    getMyCustomerId(),
    // The camp's live weekly plan (one row per member per day). Staff only.
    isStaff
      ? db.workoutAssignment.findMany({
          where: { campId: id },
          select: { scheduledDate: true, status: true, workout: { select: { id: true, name: true } } },
          orderBy: { scheduledDate: "asc" },
        })
      : Promise.resolve([]),
    // Workouts already scheduled in the builder's selected week, so it loads the
    // saved plan instead of starting blank.
    isStaff
      ? db.workoutAssignment.findMany({
          where: { campId: id, scheduledDate: { gte: planBase, lt: new Date(planBase.getTime() + 7 * 86_400_000) } },
          select: { scheduledDate: true, workoutId: true, coachSuggestion: true },
        })
      : Promise.resolve([]),
  ]);
  if (!camp) notFound();
  // Tenant isolation: a coach can only open a camp they coach/created. Admins
  // see all; customers may view any camp (they browse to apply), so this guard
  // is staff-only. Customers who aren't members still only see the public
  // overview (the roster/plan stay gated by `canSeeInside` below).
  if (isStaff && !canAccessCamp(user, camp)) redirect(flashUrl("/camps", "That camp isn't in your tenant"));

  // Re-checks camp management rights inside a server action (forged/stale form
  // can't mutate another tenant's camp). Returns the acting staff user.
  async function assertManageCamp() {
    "use server";
    const u = await requireStaff();
    const c = await db.camp.findUnique({ where: { id }, select: { id: true, coachId: true, createdById: true } });
    if (!c || !canAccessCamp(u, c)) redirect(flashUrl("/camps", "That camp isn't in your tenant"));
    return u;
  }

  // Active members vs pending applicants.
  const activeMembers = camp.members.filter((m) => m.status !== "pending");
  const applicants = camp.members.filter((m) => m.status === "pending");

  const myMembership = myCustomerId ? camp.members.find((m) => m.customerId === myCustomerId) ?? null : null;
  // A customer only sees the roster + class details once they're an active
  // member; staff always can. Pending applicants can't yet.
  const canSeeInside = isStaff || myMembership?.status === "active";
  const memberIds = new Set(camp.members.map((m) => m.customerId));

  // Collapse the per-member plan rows into one entry per (day, workout) for the
  // "current plan" summary — with how many members have completed it.
  const planByDay = new Map<string, { date: Date; workoutName: string; total: number; done: number }>();
  for (const r of planRows) {
    if (!r.scheduledDate) continue;
    const key = `${r.scheduledDate.toISOString().slice(0, 10)}|${r.workout.id}`;
    const entry = planByDay.get(key) ?? { date: r.scheduledDate, workoutName: r.workout.name, total: 0, done: 0 };
    entry.total += 1;
    if (r.status === "completed") entry.done += 1;
    planByDay.set(key, entry);
  }
  const planDays = [...planByDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  // Stack the live plan by week so a long-running camp collapses into expandable
  // weeks instead of one ever-growing list. The current week opens by default.
  type PlanDay = (typeof planDays)[number];
  const planWeekMap = new Map<string, { weekKey: string; weekStart: Date; days: PlanDay[]; total: number; done: number }>();
  for (const p of planDays) {
    const wk = mondayOf(p.date.toISOString().slice(0, 10)); // UTC Monday, matches scheduledDate
    const e = planWeekMap.get(wk) ?? { weekKey: wk, weekStart: new Date(`${wk}T00:00:00Z`), days: [], total: 0, done: 0 };
    e.days.push(p);
    e.total += p.total;
    e.done += p.done;
    planWeekMap.set(wk, e);
  }
  const planWeeks = [...planWeekMap.values()].sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
  const thisMonday = mondayOf(new Date().toISOString().slice(0, 10));

  // Pre-load the builder with the workouts already scheduled for `planWeek`,
  // grouped per weekday, so it shows the saved plan instead of starting blank.
  const initialDays = Array.from({ length: 7 }, () => ({
    workouts: [] as { workoutId: string; note: string }[],
  }));
  for (const r of weekPlanRows) {
    if (!r.scheduledDate) continue;
    const di = Math.round((r.scheduledDate.getTime() - planBase.getTime()) / 86_400_000);
    if (di < 0 || di > 6) continue;
    const day = initialDays[di];
    if (!day.workouts.some((w) => w.workoutId === r.workoutId)) {
      day.workouts.push({ workoutId: r.workoutId, note: r.coachSuggestion ?? "" });
    }
  }

  async function updateCamp(formData: FormData) {
    "use server";
    await assertManageCamp();
    const name = String(formData.get("name") ?? "").trim();
    const startDate = String(formData.get("startDate") ?? "");
    const endDate = String(formData.get("endDate") ?? "");
    if (!name || !startDate || !endDate) return;
    await db.camp.update({
      where: { id },
      data: {
        name,
        description: String(formData.get("description") ?? "").trim() || null,
        division: String(formData.get("division") ?? "open") === "pro" ? "pro" : "open",
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        coachId: String(formData.get("coachId") ?? "") || null,
      },
    });
    revalidatePath(`/camps/${id}`);
    revalidatePath("/camps");
    redirect(flashUrl(`/camps/${id}`, "Camp updated"));
  }

  async function deleteCamp() {
    "use server";
    await assertManageCamp();
    await db.camp.delete({ where: { id } });
    revalidatePath("/camps");
    redirect(flashUrl("/camps", "Camp deleted"));
  }

  async function addMember(formData: FormData) {
    "use server";
    const actor = await assertManageCamp();
    const customerId = String(formData.get("customerId"));
    // Staff add → an active member straight away (upsert in case they had a
    // pending application). The customer must be in the actor's scope so a coach
    // can't pull a foreign-tenant athlete into their camp via a forged form.
    if (customerId) {
      const inScope = await db.customer.findFirst({ where: { id: customerId, ...customerScope(actor) }, select: { id: true } });
      if (!inScope) redirect(flashUrl(`/camps/${id}`, "That athlete isn't one of yours"));
      await db.campMember.upsert({
        where: { campId_customerId: { campId: id, customerId } },
        create: { campId: id, customerId, status: "active" },
        update: { status: "active" },
      });
      // Catch the new member up on the plan already assigned for this camp.
      await backfillCampPlan(id, customerId, actor.id);
    }
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Member added"));
  }
  async function removeMember(formData: FormData) {
    "use server";
    await assertManageCamp();
    const memberId = String(formData.get("memberId"));
    // Scope to THIS camp so a forged memberId can't drop a member of another camp.
    const m = await db.campMember.findUnique({ where: { id: memberId }, select: { customerId: true, campId: true } });
    if (!m || m.campId !== id) redirect(flashUrl(`/camps/${id}`, "Not a member of this camp"));
    await db.campMember.delete({ where: { id: memberId } });
    // Removing a member also drops this camp's training plan from them, so they
    // no longer see it. Workouts they already completed stay as history.
    await db.workoutAssignment.deleteMany({ where: { campId: id, customerId: m.customerId, status: { not: "completed" } } });
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Member removed"));
  }
  async function approveMember(formData: FormData) {
    "use server";
    const actor = await assertManageCamp();
    const memberId = String(formData.get("memberId"));
    // Scope to THIS camp so a forged memberId can't approve an applicant elsewhere.
    const m = await db.campMember.findUnique({ where: { id: memberId }, select: { customerId: true, campId: true } });
    if (!m || m.campId !== id) redirect(flashUrl(`/camps/${id}`, "Not an applicant of this camp"));
    await db.campMember.update({ where: { id: memberId }, data: { status: "active" } });
    // Newly-approved member catches up on the plan already assigned for this camp.
    await backfillCampPlan(id, m.customerId, actor.id);
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Application approved"));
  }
  // Staff join the camp themselves — straight to active, no approval needed.
  // They keep all their management powers; this just makes them a participant
  // so they appear on the roster and can sign up for the camp's classes.
  async function joinCamp() {
    "use server";
    const u = await requireStaff();
    const acct = await db.user.findUnique({ where: { id: u.id }, select: { customerId: true } });
    if (!acct?.customerId) redirect("/profile");
    await db.campMember.upsert({
      where: { campId_customerId: { campId: id, customerId: acct.customerId } },
      create: { campId: id, customerId: acct.customerId, status: "active" },
      update: { status: "active" },
    });
    await backfillCampPlan(id, acct.customerId, u.id);
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "You joined the camp"));
  }
  // Customer applies to join — creates a pending membership.
  async function applyToCamp() {
    "use server";
    const u = await requireUser();
    const acct = await db.user.findUnique({ where: { id: u.id }, select: { customerId: true } });
    if (!acct?.customerId) redirect("/profile");
    await db.campMember.upsert({
      where: { campId_customerId: { campId: id, customerId: acct.customerId } },
      create: { campId: id, customerId: acct.customerId, status: "pending" },
      update: {}, // already applied/member — leave as-is
    });
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Application submitted — your coach will review it"));
  }
  // Customer withdraws their own application / leaves the camp.
  async function leaveCamp() {
    "use server";
    const u = await requireUser();
    const acct = await db.user.findUnique({ where: { id: u.id }, select: { customerId: true } });
    if (!acct?.customerId) redirect("/profile");
    await db.campMember.deleteMany({ where: { campId: id, customerId: acct.customerId } });
    // Leaving also drops this camp's training plan they should no longer see
    // (workouts they already completed stay as history).
    await db.workoutAssignment.deleteMany({ where: { campId: id, customerId: acct.customerId, status: { not: "completed" } } });
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Left the camp"));
  }
  // Coach builds a Mon–Sun week grid and fans it out to every active member:
  // one WorkoutAssignment per (member, day-with-a-workout). Re-assigning a week
  // covers only THAT week (not the whole camp), so earlier weeks stay as history
  // and other weeks keep their plan; completed sessions are always kept.
  async function assignCampPlan(formData: FormData) {
    "use server";
    const actor = await assertManageCamp();
    type PlanDay = { workouts?: { workoutId?: string; note?: string }[] };
    let plan: { weekStart?: string; days?: PlanDay[] };
    try {
      plan = JSON.parse(String(formData.get("plan") ?? "{}"));
    } catch {
      return;
    }
    const weekStart = String(plan.weekStart ?? "").trim();
    if (!weekStart || !Array.isArray(plan.days)) return;
    const members = await db.campMember.findMany({ where: { campId: id, status: "active" }, select: { customerId: true } });
    const memberIds = members.map((m) => m.customerId);
    const base = new Date(weekStart); // YYYY-MM-DD → UTC midnight

    // Re-assigning replaces ONLY the week being assigned: wipe that week's
    // not-yet-completed workouts, then fan out the new version. Other weeks are
    // left intact — past weeks stay as the member's history (visible on the
    // calendar, hidden from the dashboard once past-due) and future weeks keep
    // their plan. Completed sessions are always preserved.
    const weekEnd = new Date(base.getTime() + 7 * 86_400_000);
    await db.workoutAssignment.deleteMany({
      where: { campId: id, status: { not: "completed" }, scheduledDate: { gte: base, lt: weekEnd } },
    });

    for (let d = 0; d < 7 && d < plan.days.length; d++) {
      const day = plan.days[d] ?? {};
      const date = new Date(base.getTime() + d * 86_400_000);

      // Workouts: fan this day's set out to every active member (deduped per day).
      const seen = new Set<string>();
      const dayWorkouts = (day.workouts ?? []).filter((w) => {
        if (!w.workoutId || seen.has(w.workoutId)) return false;
        seen.add(w.workoutId);
        return true;
      });
      if (memberIds.length > 0 && dayWorkouts.length > 0) {
        const toCreate: { campId: string; customerId: string; workoutId: string; scheduledDate: Date; assignedById: string; coachSuggestion: string | null }[] = [];
        for (const customerId of memberIds) {
          for (const w of dayWorkouts) {
            toCreate.push({ campId: id, customerId, workoutId: w.workoutId as string, scheduledDate: date, assignedById: actor.id, coachSuggestion: w.note?.trim() || null });
          }
        }
        if (toCreate.length) await db.workoutAssignment.createMany({ data: toCreate, skipDuplicates: true });
      }
    }

    revalidatePath(`/camps/${id}`);
    revalidatePath("/");
    revalidatePath("/calendar");
    redirect(flashUrl(`/camps/${id}?planWeek=${weekStart}`, `Plan assigned to ${memberIds.length} member${memberIds.length === 1 ? "" : "s"}`));
  }
  // Wipe the camp's plan, keeping any already-completed sessions for the record.
  async function clearCampPlan() {
    "use server";
    await assertManageCamp();
    await db.workoutAssignment.deleteMany({ where: { campId: id, status: { not: "completed" } } });
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Plan cleared"));
  }
  async function addClass(formData: FormData) {
    "use server";
    const u = await assertManageCamp();
    const title = String(formData.get("title") ?? "").trim();
    const date = String(formData.get("date") ?? "");
    const time = String(formData.get("time") ?? "") || "07:00";
    if (!title || !date) return;
    await db.class.create({
      data: {
        campId: id,
        title,
        startsAt: new Date(`${date}T${time}`),
        durationMin: Number(formData.get("durationMin")) || 60,
        capacity: Number(formData.get("capacity")) || 12,
        location: String(formData.get("location") ?? "").trim() || null,
        dropInAllowed: formData.get("dropInAllowed") === "on",
        createdById: u.id,
      },
    });
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, `Class "${title}" added`));
  }
  async function deleteClass(formData: FormData) {
    "use server";
    await assertManageCamp();
    const classId = String(formData.get("classId") ?? "");
    if (!classId) return;
    // Roster, assigned workouts and performances cascade via the schema.
    await db.class.delete({ where: { id: classId } });
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Class deleted"));
  }

  const nowMs = new Date().getTime();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <BackButton fallback="/camps" label="Back" />
      <header className="mt-3 mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{camp.name}</h1>
            <span className={`text-[11px] font-semibold uppercase tracking-wide rounded px-2 py-1 ${camp.division === "pro" ? "bg-accent/10 text-accent" : "bg-zinc-100 text-zinc-600"}`}>
              {camp.division === "pro" ? "Pro" : "Open"}
            </span>
          </div>
          <div className="text-sm text-muted mt-1">{camp.description}</div>
          <div className="text-sm text-muted mt-2">
            {formatDate(camp.startDate)} → {formatDate(camp.endDate)} · Coach: {camp.coach?.name ?? "Unassigned"} · Created by {camp.createdBy?.name ?? "—"}
          </div>
        </div>
        <div className="shrink-0 flex flex-row flex-wrap items-center sm:flex-col sm:items-end gap-2 sm:mt-1">
          {isStaff && (
            <Link href={edit ? `/camps/${id}` : `/camps/${id}?edit=1`} className="text-xs text-accent hover:underline">
              {edit ? "Cancel" : "Edit camp"}
            </Link>
          )}
          {isStaff ? (
            // Staff can also join the camp as a participant (still keep edit powers).
            !myMembership ? (
              <form action={joinCamp}>
                <button type="submit" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium hover:opacity-90">Join this camp</button>
              </form>
            ) : (
              <div className="text-right">
                <span className="inline-block rounded-lg bg-emerald-100 text-emerald-700 px-3 py-2 text-xs font-medium">You&apos;re a member</span>
                <form action={leaveCamp} className="mt-1"><button type="submit" className="text-xs text-muted hover:text-red-600">Leave camp</button></form>
              </div>
            )
          ) : (
            <>
              {!myMembership && (
                <form action={applyToCamp}>
                  <button type="submit" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium hover:opacity-90">Apply to join</button>
                </form>
              )}
              {myMembership?.status === "pending" && (
                <div className="text-right">
                  <span className="inline-block rounded-lg bg-amber-100 text-amber-700 px-3 py-2 text-xs font-medium">Application pending</span>
                  <form action={leaveCamp} className="mt-1"><button type="submit" className="text-xs text-muted hover:text-red-600">Withdraw</button></form>
                </div>
              )}
              {myMembership?.status === "active" && (
                <div className="text-right">
                  <span className="inline-block rounded-lg bg-emerald-100 text-emerald-700 px-3 py-2 text-xs font-medium">You&apos;re a member</span>
                  <form action={leaveCamp} className="mt-1"><button type="submit" className="text-xs text-muted hover:text-red-600">Leave camp</button></form>
                </div>
              )}
            </>
          )}
        </div>
      </header>

      {edit && (
        <>
          <form action={updateCamp} className="bg-card border border-border rounded-xl p-5 mb-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs text-muted mb-1">Name</label>
              <input name="name" required defaultValue={camp.name} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-muted mb-1">Description</label>
              <textarea name="description" rows={2} defaultValue={camp.description ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Type</label>
              <select name="division" defaultValue={camp.division} className="w-full rounded-lg border border-border px-3 py-2 text-sm">
                <option value="open">Open</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Coach</label>
              <select name="coachId" defaultValue={camp.coachId ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm">
                <option value="">— unassigned —</option>
                {coaches.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Start date</label>
              <input name="startDate" type="date" required defaultValue={camp.startDate.toISOString().slice(0, 10)} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">End date</label>
              <input name="endDate" type="date" required defaultValue={camp.endDate.toISOString().slice(0, 10)} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Link href={`/camps/${id}`} className="px-3 py-2 text-sm rounded-lg border border-border">Cancel</Link>
              <button type="submit" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium">Save</button>
            </div>
          </form>
          <form action={deleteCamp} className="mb-6 text-right">
            <ConfirmSubmit
              message={`Delete camp "${camp.name}"? Its classes and memberships will be removed. This cannot be undone.`}
              className="text-xs text-muted hover:text-red-600"
            >
              Delete this camp
            </ConfirmSubmit>
          </form>
        </>
      )}

      {/* WEEKLY TRAINING PLAN — coach builds a Mon–Sun grid that members train
          on their off-days; it lands on each member's dashboard. Staff only. */}
      {isStaff && (
        <section className="mb-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between mb-3">
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Weekly training plan</h2>
            <span className="text-xs text-muted">Workouts land on each member&apos;s dashboard &amp; calendar.</span>
          </div>

          <CampPlanBuilder
            key={planWeek}
            workouts={allWorkouts.map((w) => ({ id: w.id, name: w.name }))}
            classes={camp.classes
              .filter((c) => !c.canceledAt && c.startsAt >= planBase && c.startsAt < new Date(planBase.getTime() + 7 * 86_400_000))
              .map((c) => ({
                id: c.id,
                title: c.title,
                date: c.startsAt.toISOString().slice(0, 10),
                time: formatTime(c.startsAt),
              }))}
            weekStart={planWeek}
            initialDays={initialDays}
            memberCount={activeMembers.length}
            action={assignCampPlan}
          />

          {/* What's currently live */}
          {planDays.length > 0 && (
            <div className="mt-3 bg-card border border-border rounded-xl p-4">
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-xs font-medium text-muted uppercase tracking-wide">Currently assigned</div>
                <form action={clearCampPlan}>
                  <ConfirmSubmit message="Clear the camp's training plan? Sessions members already completed are kept." className="text-xs text-muted hover:text-red-600">
                    Clear plan
                  </ConfirmSubmit>
                </form>
              </div>
              <div className="space-y-1.5">
                {planWeeks.map((wk) => {
                  const isCurrent = wk.weekKey === thisMonday;
                  return (
                    <details key={wk.weekKey} open={isCurrent} className="rounded-lg border border-border bg-background/40 overflow-hidden">
                      <summary className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-background select-none">
                        <span className="font-medium">
                          Week of {formatDate(wk.weekStart)}
                          <span className="text-muted font-normal"> · {wk.days.length} session{wk.days.length === 1 ? "" : "s"}</span>
                          {isCurrent && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-accent">this week</span>}
                        </span>
                        <span className="text-xs text-muted tabular-nums shrink-0">{wk.done}/{wk.total} done</span>
                      </summary>
                      <ul className="divide-y divide-border border-t border-border bg-card px-3">
                        {wk.days.map((p, i) => (
                          <li key={i} className="flex items-center justify-between py-1.5 text-sm">
                            <span><span className="text-muted tabular-nums mr-2">{formatDate(p.date)}</span>{p.workoutName}</span>
                            <span className="text-xs text-muted tabular-nums">{p.done}/{p.total} done</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Members, then the add-class form */}
        <div className="lg:col-span-1 space-y-6">
          {/* Applicants — staff only, shown above members when present */}
          {isStaff && applicants.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Applications ({applicants.length})</h2>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <ul className="divide-y divide-amber-200">
                  {applicants.map((m) => {
                    const detail = customerDetail(m.customer);
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-2 px-1 py-2">
                        <Link href={`/customers/${m.customerId}`} className="min-w-0 hover:text-accent">
                          <div className="text-sm font-medium truncate">{m.customer.name}</div>
                          {detail && <div className="text-[11px] text-muted truncate">{detail}</div>}
                        </Link>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <form action={approveMember}>
                            <input type="hidden" name="memberId" value={m.id} />
                            <button type="submit" className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:opacity-90">Approve</button>
                          </form>
                          <form action={removeMember}>
                            <input type="hidden" name="memberId" value={m.id} />
                            <ConfirmSubmit message={`Reject ${m.customer.name}'s application?`} className="text-xs text-muted hover:text-red-600 px-1">Reject</ConfirmSubmit>
                          </form>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          )}

          {!canSeeInside ? (
            <section>
              <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Members</h2>
              <div className="bg-card border border-border border-dashed rounded-xl p-6 text-center text-sm text-muted">
                {myMembership?.status === "pending"
                  ? "Your application is pending. Once your coach approves it, you'll see the members and class details here."
                  : "Join this camp to see its members and class details."}
              </div>
            </section>
          ) : (
          <section>
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Members ({activeMembers.length})</h2>
            <div className="bg-card border border-border rounded-xl p-3">
              {activeMembers.length === 0 ? (
                <div className="text-xs text-muted px-1 py-2">No members yet.</div>
              ) : (
                <ul className="divide-y divide-border mb-2 max-h-80 overflow-auto">
                  {activeMembers.map((m) => {
                    const detail = customerDetail(m.customer);
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-2 px-1 py-1.5 group">
                        {isStaff ? (
                          <Link href={`/customers/${m.customerId}`} className="min-w-0 hover:text-accent">
                            <div className="text-sm font-medium truncate">{m.customer.name}</div>
                            {detail && <div className="text-[11px] text-muted truncate">{detail}</div>}
                          </Link>
                        ) : (
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{m.customer.name}</div>
                          </div>
                        )}
                        {isStaff && (
                          <form action={removeMember} className="shrink-0">
                            <input type="hidden" name="memberId" value={m.id} />
                            <ConfirmSubmit message={`Remove ${m.customer.name} from this camp?`} className="text-muted hover:text-red-600 text-base leading-none px-1 opacity-0 group-hover:opacity-100" >×</ConfirmSubmit>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {isStaff && (
                <form action={addMember} className="flex gap-2 pt-1">
                  <select name="customerId" className="flex-1 min-w-0 rounded-lg border border-border px-2 py-1.5 text-sm">
                    <option value="">+ Add member…</option>
                    {allCustomers.filter((c) => !memberIds.has(c.id)).map((c) => <option key={c.id} value={c.id}>{customerOptionLabel(c)}</option>)}
                  </select>
                  <button type="submit" className="rounded-lg bg-foreground text-white px-3 text-sm shrink-0">Add</button>
                </form>
              )}
            </div>
          </section>
          )}

          {isStaff && (
          <section>
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Add a class</h2>
            <form action={addClass} className="bg-card border border-border rounded-xl p-4 space-y-2.5">
              <input name="title" required placeholder="Class title (e.g. Pro Team Strength)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-muted mb-1">Date</label>
                  <input name="date" type="date" required defaultValue={camp.startDate.toISOString().slice(0, 10)} className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-muted mb-1">Time</label>
                  <input name="time" type="time" defaultValue="07:00" className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-muted mb-1">Capacity</label>
                  <input name="capacity" type="number" defaultValue={12} className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-muted mb-1">Location</label>
                  <input name="location" placeholder="optional" className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                  <input type="checkbox" name="dropInAllowed" className="rounded border-border" />
                  Allow drop-ins
                </label>
                <button type="submit" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium">Add class</button>
              </div>
            </form>
          </section>
          )}
        </div>

        {/* Right column — the class list */}
        <section className="lg:col-span-2">
          <CampSchedule
            workouts={allWorkouts.map((w) => ({
              id: w.id,
              name: w.name,
              description: w.description,
              itemCount: w.items.length,
            }))}
            classes={camp.classes.map((c) => {
              // Members only see a class's workouts from 30 min before it starts
              // (mirrors the class page) OR once a coach pre-released them;
              // staff always see them. We don't even send the names to members
              // early — nothing to leak.
              const revealed = isStaff || !!c.workoutsRevealedAt || nowMs >= c.startsAt.getTime() - 30 * 60_000;
              return {
                id: c.id,
                title: c.title,
                startsAtLabel: `${formatDate(c.startsAt)} · ${formatTime(c.startsAt)}`,
                location: c.location,
                workouts: revealed ? c.workouts.map((cw) => ({ id: cw.workout.id, name: cw.workout.name })) : [],
                locked: !revealed && c.workouts.length > 0,
                rosterCount: c.roster.length,
                capacity: c.capacity,
                dropInAllowed: c.dropInAllowed,
                createdByName: c.createdBy?.name ?? null,
                signedUp: myCustomerId ? c.roster.some((r) => r.customerId === myCustomerId) : false,
              };
            })}
            onDeleteClass={isStaff ? deleteClass : undefined}
            canEdit={isStaff}
            showDetail={canSeeInside}
            // Anyone who's an active member — staff included — can sign up for
            // the camp's classes from here.
            signupEnabled={myMembership?.status === "active"}
          />
        </section>
      </div>
    </div>
  );
}
