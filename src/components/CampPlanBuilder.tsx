"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { mondayOf } from "@/lib/utils";

type WorkoutOpt = { id: string; name: string };
type ClassSession = { id: string; title: string; date: string; time: string };
type WRow = { key: number; workoutId: string; note: string };
type Day = { workouts: WRow[] };

function emptyWeek(): Day[] {
  return Array.from({ length: 7 }, () => ({ workouts: [] }));
}

/**
 * Weekly camp-plan builder. The coach lays out each day of a Mon–Sun week with
 * any number of workouts, assigned to every active member. The whole week is
 * serialized into a single hidden `plan` field and handed to the server action.
 * Existing camp classes are displayed read-only in their matching day column.
 */
export default function CampPlanBuilder({
  workouts,
  classes,
  weekStart,
  initialDays,
  memberCount,
  action,
}: {
  workouts: WorkoutOpt[];
  classes: ClassSession[];
  weekStart: string;
  initialDays: { workouts: { workoutId: string; note: string }[] }[];
  memberCount: number;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // New rows added by the user get keys well above the seeded ones (1..N below).
  const idRef = useRef(1_000_000);
  const nextId = () => (idRef.current += 1);
  // Seed from the week's already-saved plan (the component is re-keyed per week,
  // so this initializer re-runs whenever the selected week changes).
  const [days, setDays] = useState<Day[]>(() => {
    if (initialDays.length !== 7) return emptyWeek();
    let k = 0;
    return initialDays.map((d) => ({
      workouts: d.workouts.map((w) => ({ key: (k += 1), workoutId: w.workoutId, note: w.note })),
    }));
  });

  // Each column's weekday + date is derived from the real date (weekStart + d),
  // so the label always matches the calendar — never a hard-coded Mon→Sun list.
  const dayInfo = (d: number) => {
    const base = new Date(weekStart + "T00:00:00Z");
    if (isNaN(base.getTime())) return { weekday: "", date: "", key: "" };
    const dt = new Date(base.getTime() + d * 86_400_000);
    return {
      weekday: dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      date: dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      key: dt.toISOString().slice(0, 10),
    };
  };

  const update = (d: number, fn: (day: Day) => Day) =>
    setDays((prev) => prev.map((day, i) => (i === d ? fn(day) : day)));

  const addWorkout = (d: number) => update(d, (day) => ({ ...day, workouts: [...day.workouts, { key: nextId(), workoutId: "", note: "" }] }));
  const setWorkout = (d: number, key: number, patch: Partial<WRow>) => update(d, (day) => ({ ...day, workouts: day.workouts.map((w) => (w.key === key ? { ...w, ...patch } : w)) }));
  const removeWorkout = (d: number, key: number) => update(d, (day) => ({ ...day, workouts: day.workouts.filter((w) => w.key !== key) }));

  const totalWorkouts = days.reduce((n, day) => n + day.workouts.filter((w) => w.workoutId).length, 0);

  const payload = JSON.stringify({
    weekStart,
    days: days.map((day) => ({
      workouts: day.workouts.filter((w) => w.workoutId).map((w) => ({ workoutId: w.workoutId, note: w.note.trim() })),
    })),
  });

  const noWorkouts = workouts.length === 0;

  return (
    <form action={action} className="bg-card border border-border rounded-xl p-5">
      <input type="hidden" name="plan" value={payload} />

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-[11px] text-muted mb-1">Week (any day — snaps to its Mon)</label>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => { const v = e.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) router.push(`${pathname}?planWeek=${mondayOf(v)}`); }}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
        <p className="text-xs text-muted flex-1 min-w-[14rem]">
          Add any number of workouts to each day — they go to every active member&apos;s plan. Re-assigning updates the plan without wiping what members already completed.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from({ length: 7 }, (_, d) => {
          const info = dayInfo(d);
          const dayClasses = classes.filter((c) => c.date === info.key);
          return (
          <div key={d} className="border border-border rounded-lg p-3 flex flex-col">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs font-semibold">{info.weekday}</span>
              <span className="text-[10px] text-muted tabular-nums">{info.date}</span>
            </div>

            {dayClasses.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {dayClasses.map((c) => (
                  <Link key={c.id} href={`/classes/${c.id}`} className="block rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 hover:border-sky-300">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                      <Calendar size={11} /> Class · {c.time}
                    </div>
                    <div className="text-xs font-medium mt-0.5 truncate">{c.title}</div>
                  </Link>
                ))}
              </div>
            )}

            {/* Workouts */}
            <div className="space-y-2">
              {days[d].workouts.map((w) => (
                <div key={w.key} className="rounded-md bg-background border border-border p-1.5">
                  <div className="flex items-center gap-1">
                    <select
                      value={w.workoutId}
                      onChange={(e) => setWorkout(d, w.key, { workoutId: e.target.value })}
                      className="flex-1 min-w-0 rounded border border-border bg-white px-1.5 py-1 text-xs"
                    >
                      <option value="">Pick workout…</option>
                      {workouts.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => removeWorkout(d, w.key)} className="shrink-0 text-muted hover:text-red-600 leading-none px-1 text-sm" aria-label="Remove workout">×</button>
                  </div>
                  <input
                    value={w.note}
                    onChange={(e) => setWorkout(d, w.key, { note: e.target.value })}
                    placeholder="note (optional)"
                    className="mt-1 w-full rounded border border-border px-1.5 py-1 text-[11px]"
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => addWorkout(d)}
              disabled={noWorkouts}
              className="mt-1.5 self-start text-[11px] font-medium text-accent hover:underline disabled:text-muted disabled:no-underline disabled:cursor-not-allowed"
            >
              {noWorkouts ? "no workouts in library" : "+ workout"}
            </button>
          </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
        <span className="text-xs text-muted">
          {totalWorkouts} workout{totalWorkouts === 1 ? "" : "s"} · {classes.length} class{classes.length === 1 ? "" : "es"} → {memberCount} member{memberCount === 1 ? "" : "s"}
        </span>
        <AssignButton disabled={!(totalWorkouts > 0 && memberCount > 0)} />
      </div>
    </form>
  );
}

// Submit button that shows an immediate "Assigning…" state while the server
// action runs (a clear acknowledgement before the success toast appears).
function AssignButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium disabled:opacity-40 inline-flex items-center gap-2"
    >
      {pending && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
      {pending ? "Assigning…" : "Assign week"}
    </button>
  );
}
