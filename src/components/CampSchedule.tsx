"use client";

import { useState } from "react";
import Link from "next/link";
import { GripVertical, X } from "lucide-react";

type Workout = { id: string; name: string; description: string | null; itemCount: number };
type AssignedWorkout = { id: string; name: string };
type Klass = {
  id: string;
  title: string;
  startsAtLabel: string;
  workouts: AssignedWorkout[];
  rosterCount: number;
  capacity: number;
};

export default function CampSchedule({
  workouts,
  classes: initialClasses,
}: {
  workouts: Workout[];
  classes: Klass[];
}) {
  const [classes, setClasses] = useState<Klass[]>(initialClasses);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overClassId, setOverClassId] = useState<string | null>(null);

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

  function onDragStart(e: React.DragEvent, workoutId: string) {
    e.dataTransfer.setData("text/sxc-workout", workoutId);
    e.dataTransfer.effectAllowed = "copy";
    setDragId(workoutId);
  }
  function onDragEnd() { setDragId(null); setOverClassId(null); }
  function onDragOverClass(e: React.DragEvent, classId: string) {
    if (e.dataTransfer.types.includes("text/sxc-workout")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setOverClassId(classId);
    }
  }
  function onDropClass(e: React.DragEvent, classId: string) {
    e.preventDefault();
    const workoutId = e.dataTransfer.getData("text/sxc-workout");
    const w = workouts.find((x) => x.id === workoutId);
    if (w) addWorkout(classId, w);
    setDragId(null);
    setOverClassId(null);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-1">Workouts</h2>
        <div className="text-xs text-muted mb-3">Drag a workout onto a class to assign it. Drop multiple to stack.</div>
        {workouts.length === 0 ? (
          <div className="text-sm text-muted py-4 text-center">No workouts linked to this camp yet.</div>
        ) : (
          <ul className="space-y-2">
            {workouts.map((w) => (
              <li
                key={w.id}
                draggable
                onDragStart={(e) => onDragStart(e, w.id)}
                onDragEnd={onDragEnd}
                className={`flex items-start gap-2 bg-background border border-border rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing select-none transition ${
                  dragId === w.id ? "opacity-50" : "hover:border-accent"
                }`}
              >
                <GripVertical size={14} className="text-muted mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <Link href={`/workouts/${w.id}`} draggable={false} className="text-sm font-medium hover:text-accent block truncate" onMouseDown={(e) => e.stopPropagation()}>
                    {w.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {w.itemCount} exercises{w.description ? ` · ${w.description}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="lg:col-span-3">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Classes</h2>
        {classes.length === 0 ? (
          <div className="bg-card border border-border rounded-xl px-5 py-6 text-sm text-muted text-center">
            No classes scheduled.
          </div>
        ) : (
          <ul className="space-y-2">
            {classes.map((c) => {
              const isOver = overClassId === c.id;
              return (
                <li
                  key={c.id}
                  onDragOver={(e) => onDragOverClass(e, c.id)}
                  onDragLeave={() => setOverClassId(null)}
                  onDrop={(e) => onDropClass(e, c.id)}
                  className={`bg-card border-2 rounded-xl px-4 py-3 transition ${isOver ? "border-accent bg-accent/5" : "border-border"}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <Link href={`/classes/${c.id}`} className="text-sm font-semibold hover:text-accent">{c.title}</Link>
                      <div className="text-xs text-muted mt-0.5">{c.startsAtLabel} · {c.rosterCount}/{c.capacity}</div>
                    </div>
                  </div>
                  {c.workouts.length === 0 ? (
                    <div className="text-xs text-muted italic">
                      {isOver ? "Drop to assign" : "No workouts — drop one here"}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
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
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
