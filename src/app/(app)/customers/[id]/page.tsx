import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatDate, formatTime, formatSec } from "@/lib/utils";
import Sparkline from "@/components/Sparkline";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { createSession } from "@/domain/chat";
import { requireUser } from "@/lib/auth";
import { Sparkles } from "lucide-react";
import BackButton from "@/components/BackButton";
import { benchmarkLabel, genderLabel, divisionLabel, GENDERS, DIVISIONS } from "@/domain/benchmarks";

export const dynamic = "force-dynamic";

export default async function CustomerDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const { edit } = await searchParams;
  const c = await db.customer.findUnique({
    where: { id },
    include: {
      benchmarks: { orderBy: { testedAt: "desc" } },
      activities: { orderBy: { date: "asc" } },
      videos: { orderBy: { uploadedAt: "desc" } },
      campMembers: { include: { camp: true } },
      rosterEntries: { include: { class: true }, orderBy: { class: { startsAt: "desc" } } },
      performances: {
        include: { class: { select: { id: true, title: true, startsAt: true } } },
        orderBy: { class: { startsAt: "asc" } },
      },
    },
  });
  if (!c) notFound();

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
    await db.customer.update({
      where: { id },
      data: {
        name: String(formData.get("name") ?? c!.name).trim(),
        email: String(formData.get("email") ?? "").trim() || null,
        phone: String(formData.get("phone") ?? "").trim() || null,
        gender: String(formData.get("gender") ?? "").trim() || null,
        division: String(formData.get("division") ?? "").trim() || null,
        age: Number(formData.get("age")) || null,
        weightKg: Number(formData.get("weightKg")) || null,
        heightCm: Number(formData.get("heightCm")) || null,
        tags: String(formData.get("tags") ?? "").trim() || null,
        notes: String(formData.get("notes") ?? "").trim() || null,
      },
    });
    revalidatePath(`/customers/${id}`);
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

  async function uploadVideo(formData: FormData) {
    "use server";
    const file = formData.get("file") as File;
    if (!file || file.size === 0) return;
    const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase();
    const filename = `${id}_${randomUUID()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), buf);
    await db.video.create({
      data: {
        customerId: id,
        title: String(formData.get("title") ?? file.name),
        filePath: `/uploads/${filename}`,
        exercise: String(formData.get("exercise") ?? "").trim() || null,
        notes: String(formData.get("notes") ?? "").trim() || null,
      },
    });
    revalidatePath(`/customers/${id}`);
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
          <form action={chatAboutCustomer}>
            <button type="submit" className="flex items-center gap-1.5 rounded-lg bg-foreground text-white px-3 py-2 text-sm font-medium hover:opacity-90">
              <Sparkles size={14} /> Chat about {c.name.split(" ")[0]}
            </button>
          </form>
          <div>
            <div className="text-xs text-muted uppercase tracking-wide">Attendance</div>
            <div className="text-2xl font-semibold tabular-nums">{rate}%</div>
            <Link href={edit ? `/customers/${id}` : `/customers/${id}?edit=1`} className="text-xs text-accent hover:underline mt-1 inline-block">{edit ? "Cancel" : "Edit profile"}</Link>
          </div>
        </div>
      </header>

      {edit ? (
        <form action={updateCustomer} className="bg-card border border-border rounded-xl p-6 mb-6 grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="block text-sm font-medium mb-1.5">Name</label><input name="name" defaultValue={c.name} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Email</label><input name="email" defaultValue={c.email ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Phone</label><input name="phone" defaultValue={c.phone ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Gender</label><select name="gender" defaultValue={c.gender ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm"><option value="">—</option>{GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1.5">Division</label><select name="division" defaultValue={c.division ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm"><option value="">—</option>{DIVISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1.5">Age</label><input name="age" type="number" defaultValue={c.age ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Weight (kg)</label><input name="weightKg" type="number" step="0.1" defaultValue={c.weightKg ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Height (cm)</label><input name="heightCm" type="number" step="0.1" defaultValue={c.heightCm ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Tags</label><input name="tags" defaultValue={c.tags ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div className="col-span-2"><label className="block text-sm font-medium mb-1.5">Notes</label><textarea name="notes" rows={3} defaultValue={c.notes ?? ""} className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></div>
          <div className="col-span-2 flex justify-end"><button type="submit" className="px-4 py-2 text-sm rounded-lg bg-foreground text-white">Save</button></div>
        </form>
      ) : (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <Info label="Gender" value={genderLabel(c.gender)} />
          <Info label="Division" value={divisionLabel(c.division)} />
          <Info label="Age" value={c.age?.toString() ?? "—"} />
          <Info label="Weight" value={c.weightKg ? `${c.weightKg} kg` : "—"} />
          <Info label="Height" value={c.heightCm ? `${c.heightCm} cm` : "—"} />
          <Info label="Hyrox PB" value={formatSec(c.hyroxPbSec)} />
        </div>
      )}

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
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Benchmarks</h2>
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            {c.benchmarks.map((b) => (
              <div key={b.id} className="flex justify-between items-center px-4 py-2.5">
                <div className="text-sm">{benchmarkLabel(b.metric)}</div>
                <div className="font-semibold tabular-nums text-sm">{b.metric.endsWith("_sec") ? formatSec(b.value) : `${b.value} ${b.unit}`}</div>
              </div>
            ))}
          </div>
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
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Videos ({c.videos.length})</h2>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {c.videos.map((v) => (
            <div key={v.id} className="bg-card border border-border rounded-xl p-3">
              <video src={v.filePath} controls className="w-full rounded-lg bg-black mb-2" />
              <div className="text-sm font-medium">{v.title}</div>
              <div className="text-xs text-muted">{v.exercise ?? ""} · {formatDate(v.uploadedAt)}</div>
            </div>
          ))}
        </div>
        <form action={uploadVideo} encType="multipart/form-data" className="bg-card border border-border rounded-xl p-4 grid grid-cols-3 gap-3">
          <input name="title" placeholder="Title" required className="rounded-lg border border-border px-3 py-2 text-sm" />
          <input name="exercise" placeholder="Exercise (e.g. wall_ball)" className="rounded-lg border border-border px-3 py-2 text-sm" />
          <input name="file" type="file" accept="video/*" required className="rounded-lg border border-border px-3 py-2 text-sm" />
          <input name="notes" placeholder="Notes" className="col-span-2 rounded-lg border border-border px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-foreground text-white px-4 py-2 text-sm">Upload</button>
        </form>
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
                          <div className="text-xs text-muted">{formatDate(p.class.startsAt)}</div>
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
    </div>
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
