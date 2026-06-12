import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatTime, formatDate } from "@/lib/utils";
import BackButton from "@/components/BackButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { flashUrl } from "@/lib/flash";
import { formatItem } from "@/domain/exercises";
import ExerciseList from "@/components/ExerciseList";
import { requireUser, requireCoach, getMyCustomerId } from "@/lib/auth";
import { listPerformance } from "@/domain/performance";
import { listWatchData, upsertWatchData } from "@/domain/watch";
import ClassWorkoutEditor from "@/components/ClassWorkoutEditor";
import ClassWorkoutList from "@/components/ClassWorkoutList";
import WorkoutCreateDrawer from "@/components/WorkoutCreateDrawer";
import AddWorkoutPicker from "@/components/AddWorkoutPicker";
import WatchDataPanel, { type WatchRow } from "@/components/WatchDataPanel";
import HrZoneBars from "@/components/HrZoneBars";
import { canAccessCamp } from "@/lib/access";
import { classStatus, canSignUp, CLASS_STATUS_META } from "@/lib/classStatus";
import { HYROX_MOCK_STATIONS } from "@/lib/hyrox";

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
      mockResults: true,
    },
  });
  if (!cls) notFound();

  // Mock-test helpers (shared by the athlete + staff views).
  // A mock always asks for a time per exercise. Prefer the class's own workout
  // stations; if the coach only flagged the class as a mock without attaching a
  // workout, fall back to the standard Hyrox stations so the athlete can still
  // record a split for each exercise (not just one total time).
  const classMockExercises = cls.workouts.flatMap((cw) => cw.workout.items.map((it) => ({ id: it.id, title: it.label?.trim() || it.category })));
  const mockExercises =
    classMockExercises.length > 0
      ? classMockExercises
      : cls.isMockTest
      ? HYROX_MOCK_STATIONS.map((s) => ({ id: s.key, title: s.title }))
      : [];
  const mockByCustomer = new Map(cls.mockResults.map((mr) => [mr.customerId, mr]));
  const fmtMock = (sec: number | null | undefined) => (sec == null ? "" : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`);
  // The total can exceed an hour (a full Hyrox is ~60–90 min), so show h:mm:ss.
  const fmtTotal = (sec: number | null | undefined) => {
    if (sec == null) return "";
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  };
  // Save one athlete's mock result. Staff may save for anyone; a customer only
  // for themselves. Reads per-exercise inputs (time_<itemId>) + an optional total.
  async function saveMockResult(formData: FormData) {
    "use server";
    const u = await requireUser();
    const target = String(formData.get("customerId") ?? "");
    if (!target) return;
    const staff = u.role === "admin" || u.role === "coach";
    const myCid = (await db.user.findUnique({ where: { id: u.id }, select: { customerId: true } }))?.customerId ?? null;
    if (!staff && target !== myCid) redirect(`/classes/${id}`);
    const toSec = (v: string): number | null => {
      const t = v.trim(); if (!t) return null;
      if (t.includes(":")) {
        // Accept h:mm:ss (e.g. a ~1h Hyrox total) as well as mm:ss.
        const p = t.split(":").map((x) => Number(x) || 0);
        const [h, m, s] = p.length === 3 ? p : [0, p[0] ?? 0, p[1] ?? 0];
        return Math.round(h * 3600 + m * 60 + s);
      }
      const n = Number(t); return isNaN(n) ? null : Math.round(n);
    };
    const times: Record<string, number> = {};
    for (const [k, v] of formData.entries()) {
      if (k.startsWith("time_")) { const sec = toSec(String(v)); if (sec != null) times[k.slice(5)] = sec; }
    }
    const totalSec = toSec(String(formData.get("totalSec") ?? ""));
    await db.mockResult.upsert({
      where: { classId_customerId: { classId: id, customerId: target } },
      create: { classId: id, customerId: target, timesJson: Object.keys(times).length ? JSON.stringify(times) : null, totalSec },
      update: { timesJson: Object.keys(times).length ? JSON.stringify(times) : null, totalSec },
    });
    revalidatePath(`/classes/${id}`);
    redirect(flashUrl(`/classes/${id}`, "Mock result saved"));
  }
  // A mock-test entry form for one athlete: a time per exercise + a total.
  const mockFormFor = (customerId: string) => {
    const mr = mockByCustomer.get(customerId);
    let times: Record<string, number> = {};
    try { times = mr?.timesJson ? (JSON.parse(mr.timesJson) as Record<string, number>) : {}; } catch {}
    return (
      <form action={saveMockResult} className="space-y-2">
        <input type="hidden" name="customerId" value={customerId} />
        {mockExercises.length > 0 ? (
          <>
            <div className="text-[11px] text-muted">Record your time for each exercise (mm:ss). Leave any you didn&apos;t time blank — the total is enough on its own.</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {mockExercises.map((ex) => (
                <div key={ex.id}>
                  <label className="block text-[10px] text-muted mb-0.5 truncate" title={ex.title}>{ex.title}</label>
                  <input name={`time_${ex.id}`} defaultValue={fmtMock(times[ex.id])} placeholder="mm:ss" className="w-full rounded-md border border-border px-2 py-1 text-xs tabular-nums" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-[11px] text-muted">No exercises on this class — just record the total time.</div>
        )}
        <div className="flex items-end gap-2 border-t border-border pt-2 mt-1">
          <div className="w-28">
            <label className="block text-[10px] font-semibold text-foreground mb-0.5">Total time *</label>
            <input name="totalSec" defaultValue={fmtTotal(mr?.totalSec)} placeholder="1:02:34" className="w-full rounded-md border border-border px-2 py-1 text-xs tabular-nums" />
          </div>
          <button type="submit" className="rounded-lg bg-foreground text-white px-3 py-1.5 text-xs font-medium">Save</button>
        </div>
      </form>
    );
  };

  // ---- Customer (athlete) view: read-only plan + self sign-up ----
  if (!isStaff) {
    const myCustomerId = await getMyCustomerId();
    // Access: a drop-in / free-standing class is open; a camp class needs an
    // active membership in that camp.
    const isMember = !!(cls.campId && myCustomerId && (await db.campMember.findFirst({
      where: { campId: cls.campId, customerId: myCustomerId, status: "active" }, select: { id: true },
    })));
    const allowed = !cls.campId || isMember || cls.dropInAllowed;
    if (!allowed) redirect(cls.campId ? `/camps/${cls.campId}` : "/calendar");
    // Joining a camp class you're not a member of is a drop-in application.
    const isDropIn = !!cls.campId && !isMember;

    const myEntry = myCustomerId ? cls.roster.find((r) => r.customerId === myCustomerId) ?? null : null;
    const status = classStatus({ canceledAt: cls.canceledAt, startsAt: cls.startsAt, durationMin: cls.durationMin, capacity: cls.capacity, rosterCount: cls.roster.length });
    // The coach reveals the session plan 30 minutes before it starts.
    const planRevealed = Date.now() >= cls.startsAt.getTime() - 30 * 60_000;
    // Feedback opens once the class has started (or the coach explicitly asks).
    const classStarted = cls.startsAt.getTime() <= Date.now();
    const showFeedback = !!myCustomerId && (classStarted || !!cls.feedbackRequestedAt);
    const [myPerf, myWatch] = myCustomerId
      ? await Promise.all([
          db.performance.findFirst({ where: { classId: id, customerId: myCustomerId, workoutId: null } }),
          db.classWatchData.findUnique({ where: { classId_customerId: { classId: id, customerId: myCustomerId } } }),
        ])
      : [null, null];
    // HR-zone times → minutes for the inputs; the % split is drawn by HrZoneBars.
    const zSec = [myWatch?.zone1Sec ?? null, myWatch?.zone2Sec ?? null, myWatch?.zone3Sec ?? null, myWatch?.zone4Sec ?? null, myWatch?.zone5Sec ?? null];
    const zMin = zSec.map((s) => (s != null ? Math.round((s / 60) * 10) / 10 : ""));

    // The athlete's own post-class feedback: how it felt + watch & nutrition
    // numbers. Scoped to their own ids — never trusts a client-supplied id.
    async function submitFeedback(formData: FormData) {
      "use server";
      const u = await requireUser();
      const mine = (await db.user.findUnique({ where: { id: u.id }, select: { customerId: true } }))?.customerId;
      if (!mine) redirect("/profile");
      const num = (k: string) => { const v = String(formData.get(k) ?? "").trim(); return v ? Number(v) : null; };
      const perf = {
        status: "completed",
        rpe: num("rpe"),
        feeling: String(formData.get("feeling") ?? "").trim() || null,
        injuryNote: String(formData.get("injuryNote") ?? "").trim() || null,
        notes: String(formData.get("notes") ?? "").trim() || null,
      };
      // Class-overall Performance row (workoutId null can't be upserted in Prisma).
      const existing = await db.performance.findFirst({ where: { classId: id, customerId: mine, workoutId: null }, select: { id: true } });
      if (existing) await db.performance.update({ where: { id: existing.id }, data: perf });
      else await db.performance.create({ data: { classId: id, customerId: mine, workoutId: null, ...perf } });
      // Heart-rate (avg/max + minutes per zone) + optional nutrition.
      const minToSec = (m: number | null) => (m == null ? null : Math.round(m * 60));
      await upsertWatchData({ user: u }, id, mine, {
        avgHr: num("avgHr"), maxHr: num("maxHr"),
        zone1Sec: minToSec(num("zone1Min")), zone2Sec: minToSec(num("zone2Min")), zone3Sec: minToSec(num("zone3Min")), zone4Sec: minToSec(num("zone4Min")), zone5Sec: minToSec(num("zone5Min")),
        restingCalories: num("restingCalories"), activeCalories: num("activeCalories"), sweatLossMl: num("sweatLossMl"),
      });
      revalidatePath(`/classes/${id}`);
      redirect(flashUrl(`/classes/${id}`, "Thanks — your feedback is saved"));
    }

    async function signUp() {
      "use server";
      const u = await requireUser();
      const a = await db.user.findUnique({ where: { id: u.id }, select: { customerId: true } });
      if (!a?.customerId) redirect("/profile");
      const fresh = await db.class.findUnique({ where: { id }, select: { capacity: true, canceledAt: true, startsAt: true, durationMin: true, _count: { select: { roster: true } } } });
      const existing = await db.rosterEntry.findUnique({ where: { classId_customerId: { classId: id, customerId: a.customerId } } });
      const st = fresh ? classStatus({ canceledAt: fresh.canceledAt, startsAt: fresh.startsAt, durationMin: fresh.durationMin, capacity: fresh.capacity, rosterCount: fresh._count.roster }) : "canceled";
      if (!existing && canSignUp(st)) {
        await db.rosterEntry.create({ data: { classId: id, customerId: a.customerId } });
      }
      revalidatePath(`/classes/${id}`);
      redirect(flashUrl(`/classes/${id}`, existing ? "You're already signed up" : canSignUp(st) ? "You're signed up!" : `Can't join — class is ${st}`));
    }
    async function cancelSignUp() {
      "use server";
      const u = await requireUser();
      const a = await db.user.findUnique({ where: { id: u.id }, select: { customerId: true } });
      if (a?.customerId) await db.rosterEntry.deleteMany({ where: { classId: id, customerId: a.customerId } });
      revalidatePath(`/classes/${id}`);
      redirect(flashUrl(`/classes/${id}`, "Sign-up cancelled"));
    }

    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <BackButton fallback={cls.campId ? `/camps/${cls.campId}` : "/calendar"} label="Back" />
        <header className="mt-3 mb-6">
          <div className="text-sm text-muted">
            {formatDate(cls.startsAt)} · {formatTime(cls.startsAt)} · {cls.location ?? "—"} · {cls.durationMin} min
            {cls.camp && (<> · <Link href={`/camps/${cls.campId}`} className="text-accent hover:underline">{cls.camp.name}</Link></>)}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <h1 className="text-3xl font-semibold tracking-tight">{cls.title}</h1>
            {cls.camp?.division && (
              <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                cls.camp.division === "pro" ? "bg-violet-100 text-violet-700"
                : cls.camp.division === "open" ? "bg-sky-100 text-sky-700"
                : cls.camp.division === "doubles" ? "bg-amber-100 text-amber-700"
                : "bg-teal-100 text-teal-700"
              }`}>{cls.camp.division.charAt(0).toUpperCase() + cls.camp.division.slice(1)}</span>
            )}
            <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${CLASS_STATUS_META[status].cls}`}>{CLASS_STATUS_META[status].label}</span>
          </div>
          {cls.notes && <p className="text-sm text-muted mt-2 whitespace-pre-wrap">{cls.notes}</p>}
        </header>

        {/* Sign-up card */}
        <div className="bg-card border border-border rounded-xl p-5 mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">
              {myEntry ? (
                <span className="text-emerald-700">✓ You&apos;re signed up</span>
              ) : status === "canceled" ? (
                <span className="text-red-600">This class was canceled</span>
              ) : status === "finished" ? (
                <span className="text-muted">Class finished — review only</span>
              ) : status === "full" ? (
                <span className="text-muted">Class is full</span>
              ) : isDropIn ? (
                "Drop-in spot available"
              ) : (
                "Open for sign-up"
              )}
            </div>
            <div className="text-xs text-muted mt-0.5 tabular-nums">{cls.roster.length} / {cls.capacity} spots filled</div>
          </div>
          {myEntry && (status === "open" || status === "full") ? (
            <form action={cancelSignUp}>
              <ConfirmSubmit
                message={`Cancel your sign-up for "${cls.title}" on ${formatDate(cls.startsAt)}?`}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:border-red-300 hover:text-red-600"
              >
                Cancel sign-up
              </ConfirmSubmit>
            </form>
          ) : !myEntry && status === "open" ? (
            <form action={signUp}>
              <ConfirmSubmit
                message={`${isDropIn ? "Apply for a drop-in spot in" : "Sign up for"} "${cls.title}" on ${formatDate(cls.startsAt)} at ${formatTime(cls.startsAt)}?`}
                className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium hover:opacity-90"
              >
                {isDropIn ? "Apply for drop-in" : "Sign up"}
              </ConfirmSubmit>
            </form>
          ) : (
            <span className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${CLASS_STATUS_META[status].cls}`}>{CLASS_STATUS_META[status].label}</span>
          )}
        </div>

        {/* Mock test — the athlete records their own time per exercise */}
        {cls.isMockTest && myCustomerId && (
          <div className="bg-card border border-border rounded-xl p-5 mb-6">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Mock test — your result</h2>
            <p className="text-xs text-muted mt-0.5 mb-3">Record your time per exercise (mm:ss), or just the total.</p>
            {mockFormFor(myCustomerId)}
          </div>
        )}

        {/* Post-class feedback — feeling + watch & nutrition numbers */}
        {showFeedback && (
          <div className="bg-card border border-border rounded-xl p-5 mb-6">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Post-class feedback</h2>
              {myPerf && <span className="text-[11px] font-medium text-emerald-700">✓ Submitted</span>}
            </div>
            {cls.feedbackRequestedAt && !myPerf && (
              <p className="text-xs text-accent mb-2">Your coach asked the class to share how this session went.</p>
            )}
            <form action={submitFeedback} className="space-y-4">
              {/* How it felt — RPE (explained) + a simple 5-level feeling + injury */}
              <div>
                <div className="text-[11px] font-medium text-muted uppercase tracking-wide mb-1.5">How it felt</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-muted mb-1">Effort — RPE (1–10)</label>
                    <input name="rpe" type="number" min={1} max={10} defaultValue={myPerf?.rpe ?? ""} className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
                    <div className="text-[10px] text-muted mt-1 leading-snug">RPE = Rate of Perceived Exertion — how hard it felt. 1 = very easy, 10 = all-out max.</div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted mb-1">Feeling about the session</label>
                    <select name="feeling" defaultValue={myPerf?.feeling ?? ""} className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm">
                      <option value="">—</option>
                      <option value="很弱">很弱 · Very weak</option>
                      <option value="弱">弱 · Weak</option>
                      <option value="中等">中等 · Medium</option>
                      <option value="强">强 · Strong</option>
                      <option value="很强">很强 · Very strong</option>
                    </select>
                    <div className="text-[10px] text-muted mt-1 leading-snug">How strong you felt overall during the session.</div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-muted mb-1">Any injury / not feeling well?</label>
                    <input name="injuryNote" defaultValue={myPerf?.injuryNote ?? ""} placeholder="anything off — niggles, illness, dizziness…" className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
                  </div>
                </div>
              </div>

              {/* Heart rate — avg/max + minutes per HR zone (the % split is derived) */}
              <div>
                <div className="text-[11px] font-medium text-muted uppercase tracking-wide mb-1.5">Heart rate <span className="normal-case text-muted/70">(from your watch)</span></div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="block text-[11px] text-muted mb-1">Avg HR (bpm)</label><input name="avgHr" type="number" defaultValue={myWatch?.avgHr ?? ""} className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" /></div>
                  <div><label className="block text-[11px] text-muted mb-1">Max HR (bpm)</label><input name="maxHr" type="number" defaultValue={myWatch?.maxHr ?? ""} className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" /></div>
                </div>
                <div className="text-[11px] text-muted mb-1.5">Minutes in each HR zone — Z1 easy → Z5 max. The % split is worked out for you.</div>
                <div className="grid grid-cols-5 gap-2">
                  {([1, 2, 3, 4, 5] as const).map((z) => (
                    <div key={z}>
                      <label className="block text-[10px] text-muted mb-1 text-center">Zone {z}</label>
                      <input name={`zone${z}Min`} type="number" min={0} step="0.1" defaultValue={zMin[z - 1]} placeholder="min" className="w-full rounded-lg border border-border px-1.5 py-1.5 text-sm text-center" />
                    </div>
                  ))}
                </div>
                <div className="mt-3"><HrZoneBars zones={zSec} showLegend /></div>
              </div>

              {/* Nutrition & hydration — optional, collapsed by default */}
              <details className="rounded-lg border border-border bg-background/40 px-3 py-2">
                <summary className="text-[11px] font-medium text-muted uppercase tracking-wide cursor-pointer select-none">Nutrition &amp; hydration <span className="normal-case text-muted/70">· optional</span></summary>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                  <div><label className="block text-[11px] text-muted mb-1">Resting calories</label><input name="restingCalories" type="number" defaultValue={myWatch?.restingCalories ?? ""} className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" /></div>
                  <div><label className="block text-[11px] text-muted mb-1">Active calories</label><input name="activeCalories" type="number" defaultValue={myWatch?.activeCalories ?? ""} className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" /></div>
                  <div><label className="block text-[11px] text-muted mb-1">Est. sweat loss (ml)</label><input name="sweatLossMl" type="number" defaultValue={myWatch?.sweatLossMl ?? ""} className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" /></div>
                </div>
              </details>

              <div className="flex justify-end">
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
          ) : !planRevealed ? (
            <div className="bg-card border border-border border-dashed rounded-xl p-6 text-center text-sm text-muted">
              🔒 The coach reveals the workout <span className="font-medium text-foreground">30 minutes before</span> the class — at {formatTime(new Date(cls.startsAt.getTime() - 30 * 60_000))}.
            </div>
          ) : (
            <div className="space-y-4">
              {cls.workouts.map((cw) => (
                <div key={cw.id} className="bg-card border border-border rounded-xl p-5">
                  <div className="font-semibold">{cw.workout.name}{cw.rounds > 1 && <span className="ml-2 text-xs font-medium text-accent">× {cw.rounds} rounds</span>}</div>
                  {cw.workout.description && <div className="text-sm text-muted mt-0.5">{cw.workout.description}</div>}
                  {cw.workout.items.length === 0 ? (
                    <div className="mt-3 text-sm text-muted">No exercises listed.</div>
                  ) : (
                    <ExerciseList items={cw.workout.items} />
                  )}
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
    db.workout.findMany({ where: { ownerCustomerId: null }, orderBy: { name: "asc" }, select: { id: true, name: true, tags: true } }),
  ]);
  const rosterCandidates = candidates.filter((c) => !rosteredIds.has(c.id));
  const reportByCustomer = new Map(reports.map((r) => [r.customerId, r]));
  const perfCustomerIds = new Set(performances.map((p) => p.customerId));
  const members = cls.roster.map((r) => ({ customerId: r.customerId, name: r.customer.name }));
  // Post-class feedback collection: a member "responded" once they have a
  // class-overall Performance row (workoutId null).
  const feedbackResponders = new Set(performances.filter((p) => p.workoutId === null).map((p) => p.customerId));
  const feedbackRespondedCount = cls.roster.filter((r) => feedbackResponders.has(r.customerId)).length;

  // The whole shared library is shown in the picker (with a tag filter); ones
  // already on this class are flagged so a coach always sees their full library.
  // To repeat a workout, bump its "rounds" on its card.
  const libraryOptions = allLibraryWorkouts.map((w) => ({
    id: w.id,
    name: w.name,
    tags: (w.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    assigned: assignedWorkoutIds.has(w.id),
  }));

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
        isMockTest: formData.get("isMockTest") === "on",
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

  // Coach asks the class to fill in post-class feedback (members get prompted on
  // their dashboard + a form on this class page).
  async function requestFeedback() {
    "use server";
    await requireCoach();
    await db.class.update({ where: { id }, data: { feedbackRequestedAt: new Date() } });
    revalidatePath(`/classes/${id}`);
    redirect(flashUrl(`/classes/${id}`, "Feedback requested from all members"));
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

  // Coach cancels (or reopens) the class. Other statuses are derived.
  async function toggleCancel() {
    "use server";
    await requireCoach();
    const c = await db.class.findUnique({ where: { id }, select: { canceledAt: true } });
    await db.class.update({ where: { id }, data: { canceledAt: c?.canceledAt ? null : new Date() } });
    revalidatePath(`/classes/${id}`);
    redirect(flashUrl(`/classes/${id}`, c?.canceledAt ? "Class reopened" : "Class canceled"));
  }

  const status = classStatus({ canceledAt: cls.canceledAt, startsAt: cls.startsAt, durationMin: cls.durationMin, capacity: cls.capacity, rosterCount: cls.roster.length });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <BackButton fallback={cls.campId ? `/camps/${cls.campId}` : "/calendar"} label="Back" />
      <header className="mt-3 mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted">
            {formatDate(cls.startsAt)} · {formatTime(cls.startsAt)} · {cls.location ?? "—"} · {cls.durationMin} min
            {cls.camp && (<> · <Link href={`/camps/${cls.campId}`} className="text-accent hover:underline">{cls.camp.name}</Link></>)}
            {cls.createdBy && (<> · Created by {cls.createdBy.name}</>)}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <h1 className="text-3xl font-semibold tracking-tight">{cls.title}</h1>
            {cls.camp?.division && (
              <span className={`text-[11px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                cls.camp.division === "pro" ? "bg-violet-100 text-violet-700"
                : cls.camp.division === "open" ? "bg-sky-100 text-sky-700"
                : cls.camp.division === "doubles" ? "bg-amber-100 text-amber-700"
                : "bg-teal-100 text-teal-700"
              }`}>{cls.camp.division.charAt(0).toUpperCase() + cls.camp.division.slice(1)}</span>
            )}
            {cls.dropInAllowed && (
              <span className="text-[11px] font-semibold uppercase tracking-wide rounded px-2 py-1 bg-emerald-100 text-emerald-700">Drop-in</span>
            )}
            <span className={`text-[11px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${CLASS_STATUS_META[status].cls}`}>{CLASS_STATUS_META[status].label}</span>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2 mt-1">
          <Link
            href={edit ? `/classes/${id}` : `/classes/${id}?edit=1`}
            className="text-xs text-accent hover:underline"
          >
            {edit ? "Cancel" : "Edit class"}
          </Link>
          <form action={toggleCancel}>
            <ConfirmSubmit
              message={cls.canceledAt ? `Reopen "${cls.title}"?` : `Cancel "${cls.title}"? Athletes won't be able to join, but the roster and history stay.`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${cls.canceledAt ? "border-border hover:border-accent hover:text-accent" : "border-border text-muted hover:border-red-300 hover:text-red-600"}`}
            >
              {cls.canceledAt ? "Reopen class" : "Cancel class"}
            </ConfirmSubmit>
          </form>
          {/* Ask the class for post-class feedback */}
          <form action={requestFeedback} className="text-right">
            <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent">
              {cls.feedbackRequestedAt ? "Re-request feedback" : "Request feedback"}
            </button>
            <div className="text-[11px] text-muted mt-1">
              {cls.feedbackRequestedAt
                ? `Requested · ${feedbackRespondedCount}/${cls.roster.length} responded`
                : `${feedbackRespondedCount}/${cls.roster.length} have given feedback`}
            </div>
          </form>
        </div>
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
          <label className="flex items-center gap-1.5 text-xs text-muted pb-2 cursor-pointer">
            <input type="checkbox" name="isMockTest" defaultChecked={cls.isMockTest} className="rounded border-border" />
            Mock test
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
          <AddWorkoutPicker classId={cls.id} workouts={libraryOptions} />

          <div className="flex flex-col gap-1.5 md:border-l md:border-border md:pl-4">
            <label className="text-xs font-medium text-muted uppercase tracking-wide">Or create a new workout</label>
            <WorkoutCreateDrawer classId={cls.id} />
            <span className="text-[11px] text-muted">Build its exercises in the panel, then save — added here and to your workout library.</span>
          </div>
        </div>

        {cls.workouts.length === 0 ? (
          <div className="bg-card border border-border border-dashed rounded-xl p-6 text-center text-sm text-muted">
            No workout assigned yet — add an existing one or create a new one above.
          </div>
        ) : (
          <ClassWorkoutList
            classId={cls.id}
            items={cls.workouts.map((cw) => {
              return {
                workoutId: cw.workoutId,
                rounds: cw.rounds,
                card: (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
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
                        tag: it.tag,
                        groupKey: it.groupKey,
                        groupTimeSec: it.groupTimeSec,
                      }))}
                    />
                  </div>
                ),
              };
            })}
          />
        )}
      </section>

      {/* Mock test results — coach can record/edit each athlete's times */}
      {cls.isMockTest && (
        <section className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-1">Mock test results</h2>
          <p className="text-xs text-muted mb-4">Record each athlete&apos;s time per exercise (mm:ss) <span className="font-medium text-foreground">and their total time</span> — athletes can also enter their own from this page. Athletes still to record open ready to fill in.</p>
          {cls.roster.length === 0 ? (
            <div className="text-sm text-muted">No athletes on the roster yet.</div>
          ) : (
            <div className="space-y-2">
              {cls.roster.map((r) => {
                const mr = mockByCustomer.get(r.customerId);
                let splits = 0;
                try { splits = mr?.timesJson ? Object.keys(JSON.parse(mr.timesJson) as Record<string, number>).length : 0; } catch {}
                const summary = mr
                  ? `${mr.totalSec != null ? `Total ${fmtTotal(mr.totalSec)}` : "no total"}${splits ? ` · ${splits} split${splits === 1 ? "" : "s"}` : ""}`
                  : "not recorded yet";
                return (
                  <details key={r.id} open={!mr} className="border border-border rounded-lg px-3 py-2">
                    <summary className="flex items-center justify-between cursor-pointer text-sm">
                      <span className="font-medium">{r.customer.name}</span>
                      <span className={`text-xs tabular-nums ${mr ? "text-foreground" : "text-muted"}`}>{summary}</span>
                    </summary>
                    <div className="mt-3">{mockFormFor(r.customerId)}</div>
                  </details>
                );
              })}
            </div>
          )}
        </section>
      )}

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
