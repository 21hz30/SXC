import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatDate, formatTime, formatSec } from "@/lib/utils";
import Sparkline from "@/components/Sparkline";
import { createSession } from "@/domain/chat";
import { requireUser, requireCoach } from "@/lib/auth";
import { Sparkles, Pencil } from "lucide-react";
import BackButton from "@/components/BackButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { benchmarkLabel, benchmarkDef, benchmarksByGroup, benchmarkOrder, genderLabel, divisionLabel, GENDERS, DIVISIONS } from "@/domain/benchmarks";
import { canAccessCustomer } from "@/lib/access";
import RaceTab, { type RaceDTO, type GoalDTO } from "@/components/RaceTab";
import { STATION_KEYS, STATION_LABELS, RUN_KEYS } from "@/domain/races";

export const dynamic = "force-dynamic";

type View = "training" | "race";
type EditSection = "identity" | "hyrox" | "body" | "notes";

// Parse "mm:ss" or plain seconds → integer seconds. Empty input → null.
// Kept at module scope so the "use server" actions below can reference it
// without capturing it in their closure (which Next.js can't serialize).
function parseSec(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.includes(":")) {
    const [m, ss] = s.split(":");
    return Number(m) * 60 + Number(ss || 0);
  }
  return Number(s) || null;
}

export default async function CustomerDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editSection?: EditSection; view?: View; logRace?: string; editGoal?: string; logBenchmark?: string; editBenchmark?: string }> }) {
  const user = await requireCoach();
  const { id } = await params;
  const { editSection: editSectionParam, view: viewParam, logRace, editGoal, logBenchmark, editBenchmark } = await searchParams;
  const view: View = viewParam === "race" ? "race" : "training";
  const editSection: EditSection | null = (["identity", "hyrox", "body", "notes"] as const).find((s) => s === editSectionParam) ?? null;
  const c = await db.customer.findUnique({
    where: { id },
    include: {
      benchmarks: { orderBy: { testedAt: "desc" } },
      activities: { orderBy: { date: "asc" } },
      campMembers: { include: { camp: true } },
      userAccount: { select: { id: true } },
      rosterEntries: { include: { class: true }, orderBy: { class: { startsAt: "desc" } } },
      performances: {
        include: {
          class: { select: { id: true, title: true, startsAt: true } },
          workout: { select: { name: true } },
        },
        orderBy: { class: { startsAt: "asc" } },
      },
      raceResults: { orderBy: { eventDate: "desc" } },
      raceGoals: true,
    },
  });
  if (!c) notFound();
  if (!canAccessCustomer(user, c)) redirect("/customers");

  const attended = c.rosterEntries.filter((r) => r.attendance === "attended").length;
  const totalMarked = c.rosterEntries.filter((r) => r.attendance !== "pending").length;
  const rate = totalMarked > 0 ? Math.round((attended / totalMarked) * 100) : 0;

  async function chatAboutCustomer() {
    "use server";
    const user = await requireUser();
    const session = await createSession({ user }, { customerId: id });
    redirect(`/customers/${id}?chat=${session.id}`);
  }

  async function updateCustomer(formData: FormData) {
    "use server";
    // Partial update — only the fields present in the submitted form get
    // touched. Each section's form posts a different subset of fields.
    const data: Record<string, unknown> = {};
    const strOrNull = (k: string) => {
      if (!formData.has(k)) return undefined;
      const v = String(formData.get(k) ?? "").trim();
      return v || null;
    };
    const numOrNull = (k: string) => {
      if (!formData.has(k)) return undefined;
      const v = Number(formData.get(k));
      return Number.isFinite(v) && v !== 0 ? v : null;
    };
    if (formData.has("name")) data.name = String(formData.get("name") ?? c!.name).trim() || c!.name;
    const e = strOrNull("email"); if (e !== undefined) data.email = e;
    const ph = strOrNull("phone"); if (ph !== undefined) data.phone = ph;
    const ag = numOrNull("age"); if (ag !== undefined) data.age = ag;
    const g = strOrNull("gender"); if (g !== undefined) data.gender = g;
    const d = strOrNull("division"); if (d !== undefined) data.division = d;
    const wk = numOrNull("weightKg"); if (wk !== undefined) data.weightKg = wk;
    const hc = numOrNull("heightCm"); if (hc !== undefined) data.heightCm = hc;
    const tg = strOrNull("tags"); if (tg !== undefined) data.tags = tg;
    const nt = strOrNull("notes"); if (nt !== undefined) data.notes = nt;
    if (Object.keys(data).length > 0) {
      await db.customer.update({ where: { id }, data });
    }
    revalidatePath(`/customers/${id}`);
    redirect(`/customers/${id}`);
  }

  async function deleteCustomer() {
    "use server";
    await requireCoach();
    // Related benchmarks, races, goals, activity, videos, roster, camp
    // memberships, performances and logs cascade via the schema. Any linked
    // user account is detached (User.customerId → null).
    await db.customer.delete({ where: { id } });
    revalidatePath("/customers");
    redirect("/customers");
  }

  // Benchmark add / delete actions
  async function addBenchmark(formData: FormData) {
    "use server";
    const metric = String(formData.get("metric") ?? "").trim();
    const valueRaw = String(formData.get("value") ?? "").trim();
    if (!metric || !valueRaw) return;
    const def = benchmarkDef(metric);
    const value = valueRaw.includes(":")
      ? (() => { const [m, ss] = valueRaw.split(":"); return Number(m) * 60 + Number(ss || 0); })()
      : Number(valueRaw);
    if (!Number.isFinite(value)) return;
    const unit = def?.unit ?? String(formData.get("unit") ?? "").trim() ?? "value";
    const testedAtRaw = String(formData.get("testedAt") ?? "").trim();
    await db.benchmark.create({
      data: {
        customerId: id,
        metric,
        value,
        unit,
        testedAt: testedAtRaw ? new Date(testedAtRaw) : new Date(),
      },
    });
    revalidatePath(`/customers/${id}`);
    redirect(`/customers/${id}`);
  }
  async function deleteBenchmark(formData: FormData) {
    "use server";
    const bid = String(formData.get("benchmarkId") ?? "");
    if (!bid) return;
    await db.benchmark.delete({ where: { id: bid } });
    revalidatePath(`/customers/${id}`);
    redirect(`/customers/${id}`);
  }
  async function updateBenchmark(formData: FormData) {
    "use server";
    const bid = String(formData.get("benchmarkId") ?? "");
    const valueRaw = String(formData.get("value") ?? "").trim();
    if (!bid || !valueRaw) return;
    const value = valueRaw.includes(":")
      ? (() => { const [m, ss] = valueRaw.split(":"); return Number(m) * 60 + Number(ss || 0); })()
      : Number(valueRaw);
    if (!Number.isFinite(value)) return;
    const testedAtRaw = String(formData.get("testedAt") ?? "").trim();
    await db.benchmark.update({
      where: { id: bid },
      data: { value, ...(testedAtRaw ? { testedAt: new Date(testedAtRaw) } : {}) },
    });
    revalidatePath(`/customers/${id}`);
    redirect(`/customers/${id}`);
  }

  async function addActivity(formData: FormData) {
    "use server";
    await db.activityData.create({
      data: {
        customerId: id,
        date: new Date(String(formData.get("date"))),
        activityType: String(formData.get("activityType") ?? "run"),
        durationSec: Number(formData.get("durationSec")) || null,
        distanceM: Number(formData.get("distanceM")) || null,
        avgHr: Number(formData.get("avgHr")) || null,
        maxHr: Number(formData.get("maxHr")) || null,
        avgPaceSec: Number(formData.get("avgPaceSec")) || null,
        avgCadence: Number(formData.get("avgCadence")) || null,
        caloriesKcal: Number(formData.get("caloriesKcal")) || null,
        notes: String(formData.get("notes") ?? "").trim() || null,
      },
    });
    revalidatePath(`/customers/${id}`);
  }


  async function addRaceResult(formData: FormData) {
    "use server";
    const eventName = String(formData.get("eventName") ?? "").trim();
    const eventDate = String(formData.get("eventDate") ?? "");
    const division = String(formData.get("division") ?? "open");
    const totalSec = parseSec(formData.get("totalSec"));
    if (!eventName || !eventDate || !totalSec) return;
    const splitData: Record<string, number | null> = {};
    for (const k of RUN_KEYS) splitData[`${k}Sec`] = parseSec(formData.get(`${k}Sec`));
    for (const k of STATION_KEYS) splitData[`${k}Sec`] = parseSec(formData.get(`${k}Sec`));
    await db.raceResult.create({
      data: {
        customerId: id,
        eventName,
        eventDate: new Date(eventDate),
        division,
        totalSec,
        roxzoneSec: parseSec(formData.get("roxzoneSec")),
        notes: String(formData.get("notes") ?? "").trim() || null,
        ...splitData,
      },
    });
    revalidatePath(`/customers/${id}`);
    redirect(`/customers/${id}?view=race`);
  }

  async function deleteRaceResult(formData: FormData) {
    "use server";
    const raceId = String(formData.get("raceId") ?? "");
    if (!raceId) return;
    await db.raceResult.delete({ where: { id: raceId } });
    revalidatePath(`/customers/${id}`);
  }

  async function upsertRaceGoal(formData: FormData) {
    "use server";
    const division = String(formData.get("division") ?? "open");
    const targetDateRaw = String(formData.get("targetDate") ?? "").trim();
    const data = {
      targetTotalSec: parseSec(formData.get("targetTotalSec")),
      targetDate: targetDateRaw ? new Date(targetDateRaw) : null,
      targetSkiSec: parseSec(formData.get("targetSkiSec")),
      targetSledPushSec: parseSec(formData.get("targetSledPushSec")),
      targetSledPullSec: parseSec(formData.get("targetSledPullSec")),
      targetBurpeeSec: parseSec(formData.get("targetBurpeeSec")),
      targetRowSec: parseSec(formData.get("targetRowSec")),
      targetFarmersSec: parseSec(formData.get("targetFarmersSec")),
      targetLungesSec: parseSec(formData.get("targetLungesSec")),
      targetWallballsSec: parseSec(formData.get("targetWallballsSec")),
      targetRunSec: parseSec(formData.get("targetRunSec")),
    };
    await db.raceGoal.upsert({
      where: { customerId_division: { customerId: id, division } },
      create: { customerId: id, division, ...data },
      update: data,
    });
    revalidatePath(`/customers/${id}`);
    redirect(`/customers/${id}?view=race`);
  }

  const hrPoints = c.activities
    .filter((a) => a.avgHr != null)
    .map((a) => ({ x: a.date.getTime(), y: a.avgHr!, label: formatDate(a.date) }));
  const pacePoints = c.activities
    .filter((a) => a.avgPaceSec != null)
    .map((a) => ({ x: a.date.getTime(), y: a.avgPaceSec!, label: formatDate(a.date) }));
  const distPoints = c.activities
    .filter((a) => a.distanceM != null)
    .map((a) => ({ x: a.date.getTime(), y: a.distanceM! / 1000, label: formatDate(a.date) }));

  // Performance / recovery history (chronological for the trend charts).
  const perfRpePoints = c.performances
    .filter((p) => p.rpe != null)
    .map((p) => ({ x: p.class.startsAt.getTime(), y: p.rpe!, label: formatDate(p.class.startsAt) }));
  const perfFatiguePoints = c.performances
    .filter((p) => p.fatiguePct != null)
    .map((p) => ({ x: p.class.startsAt.getTime(), y: p.fatiguePct!, label: formatDate(p.class.startsAt) }));
  // Most-recent-first for the table.
  const perfHistory = [...c.performances].reverse();
  const latestPerf = perfHistory[0];

  // Race DTOs for the client tab component.
  const races: RaceDTO[] = c.raceResults.map((r) => ({
    id: r.id,
    eventName: r.eventName,
    eventDate: r.eventDate.toISOString(),
    division: r.division,
    notes: r.notes,
    totalSec: r.totalSec,
    roxzoneSec: r.roxzoneSec,
    run1Sec: r.run1Sec, run2Sec: r.run2Sec, run3Sec: r.run3Sec, run4Sec: r.run4Sec,
    run5Sec: r.run5Sec, run6Sec: r.run6Sec, run7Sec: r.run7Sec, run8Sec: r.run8Sec,
    skiSec: r.skiSec, sledPushSec: r.sledPushSec, sledPullSec: r.sledPullSec,
    burpeeSec: r.burpeeSec, rowSec: r.rowSec, farmersSec: r.farmersSec,
    lungesSec: r.lungesSec, wallballsSec: r.wallballsSec,
  }));
  const goals: GoalDTO[] = c.raceGoals.map((g) => ({
    division: g.division,
    targetTotalSec: g.targetTotalSec,
    targetDate: g.targetDate ? g.targetDate.toISOString() : null,
    targetSkiSec: g.targetSkiSec, targetSledPushSec: g.targetSledPushSec,
    targetSledPullSec: g.targetSledPullSec, targetBurpeeSec: g.targetBurpeeSec,
    targetRowSec: g.targetRowSec, targetFarmersSec: g.targetFarmersSec,
    targetLungesSec: g.targetLungesSec, targetWallballsSec: g.targetWallballsSec,
    targetRunSec: g.targetRunSec,
  }));
  const editingGoalDivision = editGoal && DIVISIONS.some((d) => d.value === editGoal) ? editGoal : null;
  const goalToEdit = editingGoalDivision ? goals.find((g) => g.division === editingGoalDivision) : null;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <BackButton fallback="/customers" label="Back" />
      <header className="mt-3 mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{c.name}</h1>
          <div className="text-sm text-muted mt-1">{c.tags}</div>
          <div className="text-sm text-muted mt-1">
            {c.campMembers.length > 0 && (
              <>Camps: {c.campMembers.map((m) => <Link key={m.id} href={`/camps/${m.campId}`} className="text-accent hover:underline mr-2">{m.camp.name}</Link>)}</>
            )}
          </div>
        </div>
        <div className="text-right flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <form action={chatAboutCustomer}>
              <button type="submit" className="flex items-center gap-1.5 rounded-lg bg-foreground text-white px-3 py-2 text-sm font-medium hover:opacity-90">
                <Sparkles size={14} /> Chat about {c.name.split(" ")[0]}
              </button>
            </form>
            <form action={deleteCustomer}>
              <ConfirmSubmit
                message={`Delete ${c.name}? This permanently removes their benchmarks, race results, activity and roster history. This cannot be undone.`}
                className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:border-red-300 hover:text-red-600"
              >
                Delete
              </ConfirmSubmit>
            </form>
          </div>
          <div>
            <div className="text-xs text-muted uppercase tracking-wide">Attendance</div>
            <div className="text-2xl font-semibold tabular-nums">{rate}%</div>
          </div>
        </div>
      </header>

      {/* Tab toggle */}
      <div className="mb-6 inline-flex rounded-lg border border-border overflow-hidden text-sm">
        <Link href={`/customers/${id}`} className={`px-4 py-2 ${view === "training" ? "bg-foreground text-white" : "bg-background text-muted hover:bg-card"}`}>Training</Link>
        <Link href={`/customers/${id}?view=race`} className={`px-4 py-2 ${view === "race" ? "bg-foreground text-white" : "bg-background text-muted hover:bg-card"}`}>Race</Link>
      </div>

      {/* Sectioned profile cards — each has its own Edit/Save toggle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* IDENTITY: name / email / phone / age */}
        <SectionCard
          title="Identity"
          isEditing={editSection === "identity"}
          editHref={`/customers/${id}?editSection=identity`}
          cancelHref={`/customers/${id}`}
        >
          {editSection === "identity" ? (
            <form action={updateCustomer} className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="block text-xs text-muted mb-1">Name</label><input name="name" defaultValue={c.name} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-muted mb-1">Email</label><input name="email" type="email" defaultValue={c.email ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-muted mb-1">Phone</label><input name="phone" defaultValue={c.phone ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-muted mb-1">Age</label><input name="age" type="number" defaultValue={c.age ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div className="col-span-2 flex justify-end gap-2 pt-1">
                <Link href={`/customers/${id}`} className="px-3 py-1.5 text-xs rounded-lg border border-border">Cancel</Link>
                <button type="submit" className="px-4 py-1.5 text-xs rounded-lg bg-foreground text-white">Save</button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <KV k="Email" v={c.email ?? "—"} />
              <KV k="Phone" v={c.phone ?? "—"} />
              <KV k="Age" v={c.age?.toString() ?? "—"} />
            </dl>
          )}
        </SectionCard>

        {/* HYROX: gender / division / tags */}
        <SectionCard
          title="Hyrox"
          isEditing={editSection === "hyrox"}
          editHref={`/customers/${id}?editSection=hyrox`}
          cancelHref={`/customers/${id}`}
        >
          {editSection === "hyrox" ? (
            <form action={updateCustomer} className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-muted mb-1">Gender</label><select name="gender" defaultValue={c.gender ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm"><option value="">—</option>{GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
              <div><label className="block text-xs text-muted mb-1">Division</label><select name="division" defaultValue={c.division ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm"><option value="">—</option>{DIVISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></div>
              <div className="col-span-2"><label className="block text-xs text-muted mb-1">Tags (comma-separated)</label><input name="tags" defaultValue={c.tags ?? ""} placeholder="competing,Oct" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div className="col-span-2 flex justify-end gap-2 pt-1">
                <Link href={`/customers/${id}`} className="px-3 py-1.5 text-xs rounded-lg border border-border">Cancel</Link>
                <button type="submit" className="px-4 py-1.5 text-xs rounded-lg bg-foreground text-white">Save</button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <KV k="Gender" v={genderLabel(c.gender)} />
              <KV k="Division" v={divisionLabel(c.division)} />
              <KV k="Tags" v={c.tags ?? "—"} />
              <KV k="Hyrox PB" v={formatSec(c.hyroxPbSec)} />
            </dl>
          )}
        </SectionCard>

        {/* BODY: weight / height */}
        <SectionCard
          title="Body"
          isEditing={editSection === "body"}
          editHref={`/customers/${id}?editSection=body`}
          cancelHref={`/customers/${id}`}
        >
          {editSection === "body" ? (
            <form action={updateCustomer} className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-muted mb-1">Weight (kg)</label><input name="weightKg" type="number" step="0.1" defaultValue={c.weightKg ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-muted mb-1">Height (cm)</label><input name="heightCm" type="number" step="0.1" defaultValue={c.heightCm ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div className="col-span-2 flex justify-end gap-2 pt-1">
                <Link href={`/customers/${id}`} className="px-3 py-1.5 text-xs rounded-lg border border-border">Cancel</Link>
                <button type="submit" className="px-4 py-1.5 text-xs rounded-lg bg-foreground text-white">Save</button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <KV k="Weight" v={c.weightKg ? `${c.weightKg} kg` : "—"} />
              <KV k="Height" v={c.heightCm ? `${c.heightCm} cm` : "—"} />
            </dl>
          )}
        </SectionCard>

        {/* NOTES */}
        <SectionCard
          title="Notes"
          isEditing={editSection === "notes"}
          editHref={`/customers/${id}?editSection=notes`}
          cancelHref={`/customers/${id}`}
        >
          {editSection === "notes" ? (
            <form action={updateCustomer} className="space-y-2">
              <textarea name="notes" rows={4} defaultValue={c.notes ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2 pt-1">
                <Link href={`/customers/${id}`} className="px-3 py-1.5 text-xs rounded-lg border border-border">Cancel</Link>
                <button type="submit" className="px-4 py-1.5 text-xs rounded-lg bg-foreground text-white">Save</button>
              </div>
            </form>
          ) : (
            <div className="text-sm whitespace-pre-wrap min-h-[3rem]">{c.notes || <span className="text-muted">No notes yet.</span>}</div>
          )}
        </SectionCard>
      </div>

      {view === "training" && (
      <>
      <section className="mb-6">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Activity trends ({c.activities.length} sessions)</h2>
        <div className="grid grid-cols-3 gap-4">
          <ChartCard title="Avg HR (bpm)" points={hrPoints} unit="bpm" />
          <ChartCard title="Avg pace (min/km)" points={pacePoints} unit="/km" format={(v) => formatSec(v)} />
          <ChartCard title="Distance (km)" points={distPoints} unit="km" format={(v) => v.toFixed(1)} />
        </div>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-6">
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Benchmarks</h2>
            <Link href={logBenchmark ? `/customers/${id}` : `/customers/${id}?logBenchmark=1`} className="text-xs text-accent hover:underline">
              {logBenchmark ? "Cancel" : "+ Log benchmark"}
            </Link>
          </div>
          {logBenchmark && (
            <form action={addBenchmark} className="bg-card border border-accent/40 rounded-xl p-4 mb-3 grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="block text-xs text-muted mb-1">Metric</label>
                <select name="metric" required className="w-full rounded-lg border border-border px-2 py-1.5 text-sm">
                  <option value="">Pick a benchmark…</option>
                  {benchmarksByGroup().map((g) => (
                    <optgroup key={g.group} label={g.label}>
                      {g.items.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Value</label>
                <input name="value" required placeholder="mm:ss or number" className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Tested on</label>
                <input name="testedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-full rounded-lg border border-border px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="col-span-2 rounded-lg bg-foreground text-white py-1.5 text-xs">Save benchmark</button>
            </form>
          )}
          {c.benchmarks.length === 0 ? (
            <div className="bg-card border border-border border-dashed rounded-xl p-4 text-center text-xs text-muted">No benchmarks logged yet.</div>
          ) : (
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {[...c.benchmarks].sort((a, b) => benchmarkOrder(a.metric) - benchmarkOrder(b.metric) || +new Date(b.testedAt) - +new Date(a.testedAt)).map((b) => (
                editBenchmark === b.id ? (
                  <form key={b.id} action={updateBenchmark} className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-accent/5">
                    <input type="hidden" name="benchmarkId" value={b.id} />
                    <div className="text-sm font-medium min-w-[8rem] flex-1">{benchmarkLabel(b.metric)}</div>
                    <input
                      name="value"
                      required
                      autoFocus
                      defaultValue={b.metric.endsWith("_sec") ? formatSec(b.value) : String(b.value)}
                      placeholder={b.metric.endsWith("_sec") ? "mm:ss" : "number"}
                      className="w-24 rounded-lg border border-border px-2 py-1 text-sm tabular-nums"
                    />
                    <button type="submit" className="rounded-lg bg-foreground text-white px-3 py-1 text-xs">Save</button>
                    <Link href={`/customers/${id}`} className="text-xs text-muted hover:text-foreground">Cancel</Link>
                  </form>
                ) : (
                  <div key={b.id} className="flex justify-between items-center px-4 py-2.5 group">
                    <div className="text-sm">{benchmarkLabel(b.metric)}</div>
                    <div className="flex items-center gap-3">
                      <div className="font-semibold tabular-nums text-sm">{b.metric.endsWith("_sec") ? formatSec(b.value) : `${b.value} ${b.unit}`}</div>
                      <Link
                        href={`/customers/${id}?editBenchmark=${b.id}`}
                        title="Edit"
                        className="text-muted hover:text-accent opacity-0 group-hover:opacity-100"
                      >
                        <Pencil size={12} />
                      </Link>
                      <form action={deleteBenchmark}>
                        <input type="hidden" name="benchmarkId" value={b.id} />
                        <button type="submit" className="text-[12px] leading-none text-muted hover:text-red-600 opacity-0 group-hover:opacity-100" title="Delete">×</button>
                      </form>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Add activity data</h2>
          <form action={addActivity} className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input name="date" type="date" required defaultValue={new Date().toISOString().split("T")[0]} className="rounded-lg border border-border px-2 py-1.5 text-sm" />
              <select name="activityType" className="rounded-lg border border-border px-2 py-1.5 text-sm">
                <option value="run">Run</option><option value="row">Row</option><option value="ski">Ski</option><option value="hyrox_sim">Hyrox sim</option>
              </select>
              <input name="durationSec" type="number" placeholder="Duration (sec)" className="rounded-lg border border-border px-2 py-1.5 text-sm" />
              <input name="distanceM" type="number" placeholder="Distance (m)" className="rounded-lg border border-border px-2 py-1.5 text-sm" />
              <input name="avgHr" type="number" placeholder="Avg HR" className="rounded-lg border border-border px-2 py-1.5 text-sm" />
              <input name="maxHr" type="number" placeholder="Max HR" className="rounded-lg border border-border px-2 py-1.5 text-sm" />
              <input name="avgPaceSec" type="number" placeholder="Pace sec/km" className="rounded-lg border border-border px-2 py-1.5 text-sm" />
              <input name="avgCadence" type="number" placeholder="Cadence" className="rounded-lg border border-border px-2 py-1.5 text-sm" />
            </div>
            <button type="submit" className="w-full rounded-lg bg-foreground text-white py-2 text-sm">Add activity</button>
          </form>
        </div>
      </section>

      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Performance &amp; recovery history</h2>
          {latestPerf && (
            <div className="text-xs text-muted">
              Last session: {latestPerf.fatiguePct != null ? `${latestPerf.fatiguePct}% fatigue` : "—"}
              {latestPerf.feeling ? ` · "${latestPerf.feeling}"` : ""}
              {latestPerf.injuryNote?.trim() ? ` · ⚠ ${latestPerf.injuryNote}` : ""}
            </div>
          )}
        </div>
        {c.performances.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted">
            No performance logged yet. Log it on a class page after the session.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <ChartCard title="RPE (effort 1–10)" points={perfRpePoints} unit="/10" />
              <ChartCard title="Fatigue (%)" points={perfFatiguePoints} unit="%" />
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-background text-muted text-xs uppercase tracking-wide">
                  <tr className="text-left">
                    <th className="px-4 py-2.5 font-medium">Session</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">RPE</th>
                    <th className="px-3 py-2.5 font-medium">Fatigue</th>
                    <th className="px-3 py-2.5 font-medium">Feeling</th>
                    <th className="px-3 py-2.5 font-medium">Injury</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {perfHistory.map((p) => {
                    const hasInjury = !!p.injuryNote?.trim();
                    const highFatigue = (p.fatiguePct ?? 0) >= 80;
                    return (
                      <tr key={p.id} className={hasInjury ? "bg-red-50" : highFatigue ? "bg-amber-50" : ""}>
                        <td className="px-4 py-2.5">
                          <Link href={`/classes/${p.class.id}`} className="font-medium hover:text-accent">{p.class.title}</Link>
                          <div className="text-xs text-muted">
                            {formatDate(p.class.startsAt)}
                            {p.workout?.name && <> · <span className="text-foreground/70">{p.workout.name}</span></>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 capitalize">{p.status}</td>
                        <td className="px-3 py-2.5 tabular-nums">{p.rpe ?? "—"}</td>
                        <td className="px-3 py-2.5 tabular-nums">{p.fatiguePct != null ? `${p.fatiguePct}%` : "—"}</td>
                        <td className="px-3 py-2.5 text-muted">{p.feeling ?? "—"}</td>
                        <td className="px-3 py-2.5">{hasInjury ? <span className="text-red-600">{p.injuryNote}</span> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Class history</h2>
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {c.rosterEntries.slice(0, 20).map((r) => (
            <Link key={r.id} href={`/classes/${r.classId}`} className="flex justify-between items-center px-5 py-3 hover:bg-background">
              <div>
                <div className="font-medium text-sm">{r.class.title}</div>
                <div className="text-xs text-muted">{formatDate(r.class.startsAt)} · {formatTime(r.class.startsAt)}</div>
              </div>
              <AttendancePill status={r.attendance} />
            </Link>
          ))}
        </div>
      </section>
      </>
      )}

      {view === "race" && (
      <>
        <RaceTab races={races} goals={goals} gender={c.gender} />

        {/* Goal editor (per division) */}
        <section className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Edit goal</h2>
            <div className="flex gap-1">
              {DIVISIONS.map((d) => (
                <Link key={d.value} href={`/customers/${id}?view=race&editGoal=${d.value}`} className={`text-xs rounded-md border px-2 py-1 ${editingGoalDivision === d.value ? "border-accent bg-accent/5" : "border-border hover:bg-card"}`}>
                  {d.label}
                </Link>
              ))}
            </div>
          </div>
          {editingGoalDivision ? (
            <form action={upsertRaceGoal} className="bg-card border border-border rounded-xl p-5 grid grid-cols-3 gap-3">
              <input type="hidden" name="division" value={editingGoalDivision} />
              <div className="col-span-3 text-xs text-muted">Setting goals for <strong>{divisionLabel(editingGoalDivision)}</strong>. Time format: <code>mm:ss</code> or plain seconds. Leave blank to skip.</div>
              <div><label className="block text-xs text-muted mb-1">Target total</label><input name="targetTotalSec" defaultValue={goalToEdit?.targetTotalSec ? formatSec(goalToEdit.targetTotalSec) : ""} placeholder="e.g. 65:00" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-muted mb-1">Target date</label><input name="targetDate" type="date" defaultValue={goalToEdit?.targetDate ? goalToEdit.targetDate.slice(0, 10) : ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-muted mb-1">Avg run / km</label><input name="targetRunSec" defaultValue={goalToEdit?.targetRunSec ? formatSec(goalToEdit.targetRunSec) : ""} placeholder="e.g. 4:30" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              {STATION_KEYS.map((k) => {
                const fieldName = `target${k[0].toUpperCase()}${k.slice(1)}Sec`;
                const v = goalToEdit?.[fieldName as keyof GoalDTO] as number | null | undefined;
                return (
                  <div key={k}>
                    <label className="block text-xs text-muted mb-1">{STATION_LABELS[k]}</label>
                    <input name={fieldName} defaultValue={v != null ? formatSec(v) : ""} placeholder="mm:ss" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
                  </div>
                );
              })}
              <div className="col-span-3 flex justify-end gap-2">
                <Link href={`/customers/${id}?view=race`} className="px-3 py-2 text-sm rounded-lg border border-border">Cancel</Link>
                <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-foreground text-white">Save goal</button>
              </div>
            </form>
          ) : (
            <div className="bg-card border border-border border-dashed rounded-xl p-3 text-xs text-muted text-center">Pick a division above to edit its goal.</div>
          )}
        </section>

        {/* Log race result */}
        <section className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Log race result</h2>
            <Link href={logRace ? `/customers/${id}?view=race` : `/customers/${id}?view=race&logRace=1`} className="text-xs text-accent hover:underline">{logRace ? "Cancel" : "+ Log race"}</Link>
          </div>
          {logRace && (
            <form action={addRaceResult} className="bg-card border border-border rounded-xl p-5 grid grid-cols-3 gap-3">
              <div className="col-span-3 text-xs text-muted">Times accept <code>mm:ss</code> or plain seconds. Required: event name, date, division, total.</div>
              <div className="col-span-2"><label className="block text-xs text-muted mb-1">Event *</label><input name="eventName" required placeholder="Hyrox London 2026" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-muted mb-1">Date *</label><input name="eventDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-muted mb-1">Division *</label><select name="division" defaultValue={c.division ?? "open"} className="w-full rounded-lg border border-border px-3 py-2 text-sm">{DIVISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></div>
              <div><label className="block text-xs text-muted mb-1">Total *</label><input name="totalSec" required placeholder="e.g. 70:12" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-muted mb-1">Roxzone</label><input name="roxzoneSec" placeholder="mm:ss" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div className="col-span-3 text-xs font-medium text-muted uppercase mt-1">Run splits (1 km each)</div>
              {RUN_KEYS.map((k, i) => (
                <div key={k}>
                  <label className="block text-xs text-muted mb-1">Run {i + 1}</label>
                  <input name={`${k}Sec`} placeholder="mm:ss" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
                </div>
              ))}
              <div className="col-span-3 text-xs font-medium text-muted uppercase mt-1">Station splits</div>
              {STATION_KEYS.map((k) => (
                <div key={k}>
                  <label className="block text-xs text-muted mb-1">{STATION_LABELS[k]}</label>
                  <input name={`${k}Sec`} placeholder="mm:ss" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
                </div>
              ))}
              <div className="col-span-3"><label className="block text-xs text-muted mb-1">Notes</label><input name="notes" placeholder="optional" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
              <div className="col-span-3 flex justify-end gap-2">
                <Link href={`/customers/${id}?view=race`} className="px-3 py-2 text-sm rounded-lg border border-border">Cancel</Link>
                <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-foreground text-white">Save race</button>
              </div>
            </form>
          )}
        </section>

        {/* Quick delete of races */}
        {races.length > 0 && (
          <section className="mt-3 text-right">
            <details className="inline-block text-xs text-muted">
              <summary className="cursor-pointer hover:text-foreground">Manage races…</summary>
              <div className="mt-2 bg-card border border-border rounded-lg p-3 text-left space-y-1">
                {races.map((r) => (
                  <form key={r.id} action={deleteRaceResult} className="flex justify-between items-center text-xs">
                    <span>{r.eventName} · {new Date(r.eventDate).toLocaleDateString()} · {divisionLabel(r.division)}</span>
                    <input type="hidden" name="raceId" value={r.id} />
                    <button type="submit" className="text-red-600 hover:underline">Delete</button>
                  </form>
                ))}
              </div>
            </details>
          </section>
        )}
      </>
      )}
    </div>
  );
}

function SectionCard({
  title,
  isEditing,
  editHref,
  cancelHref: _cancelHref,
  children,
}: {
  title: string;
  isEditing: boolean;
  editHref: string;
  cancelHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-card border rounded-xl p-5 ${isEditing ? "border-accent" : "border-border"}`}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs font-medium text-muted uppercase tracking-wide">{title}</h2>
        {!isEditing && (
          <Link href={editHref} className="text-xs text-accent hover:underline">Edit</Link>
        )}
      </div>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function ChartCard({ title, points, unit, format }: { title: string; points: { x: number; y: number }[]; unit: string; format?: (v: number) => string }) {
  const latest = points[points.length - 1]?.y;
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-xs text-muted uppercase tracking-wide">{title}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1 mb-2">
        {latest != null ? (format ? format(latest) : latest.toString()) : "—"}
        <span className="text-xs text-muted font-normal ml-1">{unit}</span>
      </div>
      <Sparkline points={points} height={70} />
    </div>
  );
}

function AttendancePill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    attended: { label: "Attended", cls: "bg-emerald-100 text-emerald-700" },
    no_show: { label: "No show", cls: "bg-red-100 text-red-700" },
    late_cancel: { label: "Late cancel", cls: "bg-amber-100 text-amber-700" },
    pending: { label: "Upcoming", cls: "bg-zinc-100 text-zinc-600" },
  };
  const s = map[status] ?? map.pending;
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span>;
}
