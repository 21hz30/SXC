"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

type WorkoutOpt = { id: string; name: string };
type WRow = { key: number; workoutId: string; note: string };
type CRow = { key: number; title: string; time: string };
type Day = { workouts: WRow[]; classes: CRow[] };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function emptyWeek(): Day[] {
  return Array.from({ length: 7 }, () => ({ workouts: [], classes: [] }));
}

/**
 * Weekly camp-plan builder. The coach lays out each day of a Mon–Sun week with
 * any number of workouts (assigned to every active member) and/or classes
 * (group sessions scheduled for the whole camp). The whole week is serialized
 * into a single hidden `plan` field and handed to the server action.
 */
export default function CampPlanBuilder({
  workouts,
  weekStart,
  initialDays,
  memberCount,
  action,
}: {
  workouts: WorkoutOpt[];
  weekStart: string;
  initialDays: { workouts: { workoutId: string; note: string }[]; classes: { title: string; time: string }[] }[];
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
      classes: d.classes.map((c) => ({ key: (k += 1), title: c.title, time: c.time })),
    }));
  });

  const dayLabel = (d: number) => {
    const base = new Date(weekStart + "T00:00:00");
    if (isNaN(base.getTime())) return "";
    const dt = new Date(base.getTime() + d * 86_400_000);
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const update = (d: number, fn: (day: Day) => Day) =>
    setDays((prev) => prev.map((day, i) => (i === d ? fn(day) : day)));

  const addWorkout = (d: number) => update(d, (day) => ({ ...day, workouts: [...day.workouts, { key: nextId(), workoutId: "", note: "" }] }));
  const setWorkout = (d: number, key: number, patch: Partial<WRow>) => update(d, (day) => ({ ...day, workouts: day.workouts.map((w) => (w.key === key ? { ...w, ...patch } : w)) }));
  const removeWorkout = (d: number, key: number) => update(d, (day) => ({ ...day, workouts: day.workouts.filter((w) => w.key !== key) }));

  const addClass = (d: number) => update(d, (day) => ({ ...day, classes: [...day.classes, { key: nextId(), title: "", time: "07:00" }] }));
  const setClass = (d: number, key: number, patch: Partial<CRow>) => update(d, (day) => ({ ...day, classes: day.classes.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));
  const removeClass = (d: number, key: number) => update(d, (day) => ({ ...day, classes: day.classes.filter((c) => c.key !== key) }));

  const totalWorkouts = days.reduce((n, day) => n + day.workouts.filter((w) => w.workoutId).length, 0);
  const totalClasses = days.reduce((n, day) => n + day.classes.filter((c) => c.title.trim()).length, 0);

  const payload = JSON.stringify({
    weekStart,
    days: days.map((day) => ({
      workouts: day.workouts.filter((w) => w.workoutId).map((w) => ({ workoutId: w.workoutId, note: w.note.trim() })),
      classes: day.classes.filter((c) => c.title.trim()).map((c) => ({ title: c.title.trim(), time: c.time || "07:00" })),
    })),
  });

  const noWorkouts = workouts.length === 0;

  return (
    <form action={action} className="bg-card border border-border rounded-xl p-5">
      <input type="hidden" name="plan" value={payload} />

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-[11px] text-muted mb-1">Week starting (Mon)</label>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => { const v = e.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) router.push(`${pathname}?planWeek=${v}`); }}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
        <p className="text-xs text-muted flex-1 min-w-[14rem]">
          Add any number of workouts and classes to each day. Workouts go to every active member&apos;s plan; classes are scheduled for the whole camp. Re-assigning updates the plan without wiping what members already completed.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {WEEKDAYS.map((label, d) => (
          <div key={d} className="border border-border rounded-lg p-3 flex flex-col">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs font-semibold">{label}</span>
              <span className="text-[10px] text-muted tabular-nums">{dayLabel(d)}</span>
            </div>

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

            {/* Classes */}
            <div className="mt-2 pt-2 border-t border-border space-y-1.5">
              {days[d].classes.map((c) => (
                <div key={c.key} className="flex items-center gap-1">
                  <input
                    value={c.title}
                    onChange={(e) => setClass(d, c.key, { title: e.target.value })}
                    placeholder="Class title"
                    className="flex-1 min-w-0 rounded border border-border px-1.5 py-1 text-xs"
                  />
                  <input
                    type="time"
                    value={c.time}
                    onChange={(e) => setClass(d, c.key, { time: e.target.value })}
                    className="shrink-0 w-[5.25rem] rounded border border-border px-1 py-1 text-[11px]"
                  />
                  <button type="button" onClick={() => removeClass(d, c.key)} className="shrink-0 text-muted hover:text-red-600 leading-none px-1 text-sm" aria-label="Remove class">×</button>
                </div>
              ))}
              <button type="button" onClick={() => addClass(d)} className="self-start text-[11px] font-medium text-accent hover:underline">+ class</button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
        <span className="text-xs text-muted">
          {totalWorkouts} workout{totalWorkouts === 1 ? "" : "s"} → {memberCount} member{memberCount === 1 ? "" : "s"}
          {totalClasses > 0 && ` · ${totalClasses} class${totalClasses === 1 ? "" : "es"}`}
        </span>
        <AssignButton disabled={!((totalWorkouts > 0 && memberCount > 0) || totalClasses > 0)} />
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
