import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatDate, formatTime } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import CampSchedule from "@/components/CampSchedule";
import { requireStaff, requireUser , getMyCustomerId } from "@/lib/auth";
import { customerDetail, customerOptionLabel } from "@/domain/customers";
import { flashUrl } from "@/lib/flash";

export const dynamic = "force-dynamic";

export default async function CampDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireUser();
  const isStaff = user.role === "admin" || user.role === "coach";
  const { id } = await params;
  const { edit: editParam } = await searchParams;
  const edit = isStaff ? editParam : undefined; // only staff get the edit form

  // All independent reads run in parallel — one DB round-trip instead of four.
  const [camp, allCustomers, allWorkouts, coaches, myCustomerId, planRows] = await Promise.all([
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
    isStaff ? db.customer.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    isStaff
      ? db.workout.findMany({ where: { ownerCustomerId: null }, orderBy: { name: "asc" }, select: { id: true, name: true, description: true, items: { select: { id: true } } } })
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
  ]);
  if (!camp) notFound();

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

  // Default the plan builder to the upcoming Monday (UTC, to match how
  // scheduledDate is stored from a YYYY-MM-DD input).
  const nextMonday = (() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    d.setUTCDate(d.getUTCDate() + ((8 - day) % 7 || 7));
    return d.toISOString().slice(0, 10);
  })();
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  async function updateCamp(formData: FormData) {
    "use server";
    await requireStaff();
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
    await requireStaff();
    await db.camp.delete({ where: { id } });
    revalidatePath("/camps");
    redirect(flashUrl("/camps", "Camp deleted"));
  }

  async function addMember(formData: FormData) {
    "use server";
    await requireStaff();
    const customerId = String(formData.get("customerId"));
    // Staff add → an active member straight away (upsert in case they had a
    // pending application).
    if (customerId) {
      await db.campMember.upsert({
        where: { campId_customerId: { campId: id, customerId } },
        create: { campId: id, customerId, status: "active" },
        update: { status: "active" },
      });
    }
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Member added"));
  }
  async function removeMember(formData: FormData) {
    "use server";
    await requireStaff();
    const memberId = String(formData.get("memberId"));
    await db.campMember.delete({ where: { id: memberId } });
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Member removed"));
  }
  async function approveMember(formData: FormData) {
    "use server";
    await requireStaff();
    const memberId = String(formData.get("memberId"));
    await db.campMember.update({ where: { id: memberId }, data: { status: "active" } });
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
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Left the camp"));
  }
  // Coach builds a Mon–Sun week grid and fans it out to every active member:
  // one WorkoutAssignment per (member, day-with-a-workout). Idempotent — keyed
  // on (campId, customerId, scheduledDate) so re-publishing edits in place
  // without wiping a member's completion log; cleared days are removed.
  async function assignCampPlan(formData: FormData) {
    "use server";
    const actor = await requireStaff();
    const weekStart = String(formData.get("weekStart") ?? "").trim();
    if (!weekStart) return;
    const members = await db.campMember.findMany({
      where: { campId: id, status: "active" },
      select: { customerId: true },
    });
    if (members.length === 0) redirect(flashUrl(`/camps/${id}`, "No active members to assign to yet"));
    const memberIdList = members.map((m) => m.customerId);
    const base = new Date(weekStart); // YYYY-MM-DD → UTC midnight
    for (let d = 0; d < 7; d++) {
      const date = new Date(base.getTime() + d * 86_400_000);
      const workoutId = String(formData.get(`dayWorkout_${d}`) ?? "").trim();
      const note = String(formData.get(`dayNote_${d}`) ?? "").trim() || null;
      if (!workoutId) {
        // Rest day — drop any not-yet-done camp assignment on this date.
        await db.workoutAssignment.deleteMany({
          where: { campId: id, scheduledDate: date, status: { not: "completed" }, customerId: { in: memberIdList } },
        });
        continue;
      }
      for (const customerId of memberIdList) {
        await db.workoutAssignment.upsert({
          where: { campId_customerId_scheduledDate: { campId: id, customerId, scheduledDate: date } },
          create: { campId: id, customerId, workoutId, scheduledDate: date, assignedById: actor.id, coachSuggestion: note },
          update: { workoutId, coachSuggestion: note }, // leave status/log untouched
        });
      }
    }
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, `Weekly plan assigned to ${members.length} member${members.length === 1 ? "" : "s"}`));
  }
  // Wipe the camp's plan, keeping any already-completed sessions for the record.
  async function clearCampPlan() {
    "use server";
    await requireStaff();
    await db.workoutAssignment.deleteMany({ where: { campId: id, status: { not: "completed" } } });
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Plan cleared"));
  }
  async function addClass(formData: FormData) {
    "use server";
    const u = await requireStaff();
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
    await requireStaff();
    const classId = String(formData.get("classId") ?? "");
    if (!classId) return;
    // Roster, assigned workouts and performances cascade via the schema.
    await db.class.delete({ where: { id: classId } });
    revalidatePath(`/camps/${id}`);
    redirect(flashUrl(`/camps/${id}`, "Class deleted"));
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <BackButton fallback="/camps" label="Back" />
      <header className="mt-3 mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{camp.name}</h1>
            <span className={`text-[11px] font-semibold uppercase tracking-wide rounded px-2 py-1 ${camp.division === "pro" ? "bg-accent/10 text-accent" : "bg-zinc-100 text-zinc-600"}`}>
              {camp.division === "pro" ? "Pro" : "Open"}
            </span>
          </div>
          <div className="text-sm text-muted mt-1">{camp.description}</div>
          <div className="text-sm text-muted mt-2">
            {formatDate(camp.startDate)} → {formatDate(camp.endDate)} · Coach: {camp.coach?.name ?? "Unassigned"} · Created by {camp.createdBy?.name ?? "—"}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2 mt-1">
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
          <form action={updateCamp} className="bg-card border border-border rounded-xl p-5 mb-3 grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-muted mb-1">Name</label>
              <input name="name" required defaultValue={camp.name} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
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
            <div className="col-span-2 flex justify-end gap-2">
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
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Weekly training plan</h2>
            <span className="text-xs text-muted">For the days between classes — pushed to every member&apos;s dashboard</span>
          </div>

          <form action={assignCampPlan} className="bg-card border border-border rounded-xl p-5">
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-[11px] text-muted mb-1">Week starting (Mon)</label>
                <input name="weekStart" type="date" required defaultValue={nextMonday} className="rounded-lg border border-border px-3 py-2 text-sm" />
              </div>
              <p className="text-xs text-muted flex-1 min-w-[12rem]">
                Pick a workout for each day (leave a day blank for a rest day). Assigning is safe to repeat —
                it updates the plan without wiping what members have already completed.
              </p>
            </div>

            {allWorkouts.length === 0 ? (
              <div className="text-sm text-muted border border-dashed border-border rounded-lg p-4 text-center">
                Add workouts to the library first — then you can build the week here.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {WEEKDAYS.map((label, d) => (
                  <div key={d} className="border border-border rounded-lg p-3">
                    <div className="text-xs font-semibold mb-1.5">{label}</div>
                    <select name={`dayWorkout_${d}`} defaultValue="" className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm mb-2">
                      <option value="">Rest day</option>
                      {allWorkouts.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <input name={`dayNote_${d}`} placeholder="note (optional)" className="w-full rounded-lg border border-border px-2 py-1 text-xs" />
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted">{activeMembers.length} active member{activeMembers.length === 1 ? "" : "s"} will receive this plan</span>
              <button type="submit" disabled={allWorkouts.length === 0 || activeMembers.length === 0} className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium disabled:opacity-40">
                Assign to {activeMembers.length} member{activeMembers.length === 1 ? "" : "s"}
              </button>
            </div>
          </form>

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
              <ul className="divide-y divide-border">
                {planDays.map((p, i) => (
                  <li key={i} className="flex items-center justify-between py-1.5 text-sm">
                    <span><span className="text-muted tabular-nums mr-2">{formatDate(p.date)}</span>{p.workoutName}</span>
                    <span className="text-xs text-muted tabular-nums">{p.done}/{p.total} done</span>
                  </li>
                ))}
              </ul>
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
              <div className="grid grid-cols-2 gap-2">
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
            classes={camp.classes.map((c) => ({
              id: c.id,
              title: c.title,
              startsAtLabel: `${formatDate(c.startsAt)} · ${formatTime(c.startsAt)}`,
              location: c.location,
              workouts: c.workouts.map((cw) => ({ id: cw.workout.id, name: cw.workout.name })),
              rosterCount: c.roster.length,
              capacity: c.capacity,
              dropInAllowed: c.dropInAllowed,
              createdByName: c.createdBy?.name ?? null,
              signedUp: myCustomerId ? c.roster.some((r) => r.customerId === myCustomerId) : false,
            }))}
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
