"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, ArrowRight } from "lucide-react";

type Workout = { id: string; name: string; description: string | null; itemCount: number };
type AssignedWorkout = { id: string; name: string };
type Klass = {
  id: string;
  title: string;
  startsAtLabel: string;
  workouts: AssignedWorkout[];
  rosterCount: number;
  capacity: number;
  dropInAllowed?: boolean;
  createdByName?: string | null;
};

export default function CampSchedule({
  workouts,
  classes: initialClasses,
}: {
  workouts: Workout[];
  classes: Klass[];
}) {
  const [classes, setClasses] = useState<Klass[]>(initialClasses);

  // Re-sync from the server when the set of classes changes (e.g. a class was
  // added/removed on the camp page). Keyed on class IDs so optimistic workout
  // assignments within existing classes aren't clobbered on every re-render.
  const classIdsKey = initialClasses.map((c) => c.id).join(",");
  useEffect(() => {
    setClasses(initialClasses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classIdsKey]);

  async function addWorkout(classId: string, workout: Workout) {
    // optimistic
    setClasses((cs) =>
      cs.map((c) =>
        c.id === classId && !c.workouts.some((w) => w.id === workout.id)
          ? { ...c, workouts: [...c.workouts, { id: workout.id, name: workout.name }] }
          : c
      )
    );
    try {
      const res = await fetch(`/api/class/${classId}/workouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutId: workout.id }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      location.reload();
    }
  }

  async function removeWorkout(classId: string, workoutId: string) {
    setClasses((cs) =>
      cs.map((c) => (c.id === classId ? { ...c, workouts: c.workouts.filter((w) => w.id !== workoutId) } : c))
    );
    try {
      const res = await fetch(`/api/class/${classId}/workouts/${workoutId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
    } catch {
      location.reload();
    }
  }

  return (
    <div>
      <section>
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Classes</h2>
        {classes.length === 0 ? (
          <div className="bg-card border border-border rounded-xl px-5 py-6 text-sm text-muted text-center">
            No classes scheduled.
          </div>
        ) : (
          <ul className="space-y-2">
            {classes.map((c) => {
              return (
                <li
                  key={c.id}
                  className="bg-card border border-border rounded-xl px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/classes/${c.id}`} className="text-sm font-semibold hover:text-accent">{c.title}</Link>
                        {c.dropInAllowed && <span className="text-[9px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700">Drop-in</span>}
                      </div>
                      <div className="text-xs text-muted mt-0.5">{c.startsAtLabel} · {c.rosterCount}/{c.capacity}{c.createdByName ? ` · by ${c.createdByName}` : ""}</div>
                    </div>
                    <Link
                      href={`/classes/${c.id}`}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:border-accent hover:text-accent"
                    >
                      Detail <ArrowRight size={12} />
                    </Link>
                  </div>
                  {c.workouts.length === 0 ? (
                    <div className="text-xs text-muted italic mb-2">No workouts yet — add one below.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {c.workouts.map((w) => (
                        <span key={w.id} className="inline-flex items-center gap-1 text-xs bg-accent/10 text-accent rounded-full pl-2.5 pr-1 py-0.5">
                          {w.name}
                          <button onClick={() => removeWorkout(c.id, w.id)} className="hover:bg-accent/20 rounded-full p-0.5" title="Remove">
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {(() => {
                    const assigned = new Set(c.workouts.map((w) => w.id));
                    const available = workouts.filter((w) => !assigned.has(w.id));
                    if (available.length === 0) {
                      return <div className="text-[11px] text-muted">All workouts are already on this class.</div>;
                    }
                    return (
                      <select
                        value=""
                        onChange={(e) => {
                          const w = workouts.find((x) => x.id === e.target.value);
                          if (w) addWorkout(c.id, w);
                          e.target.value = "";
                        }}
                        className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs"
                      >
                        <option value="">+ Add workout to this class…</option>
                        {available.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    );
                  })()}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
