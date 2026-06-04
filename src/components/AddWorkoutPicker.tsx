"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";

export type WorkoutOption = { id: string; name: string; tags: string[]; assigned: boolean };

/**
 * "Add an existing workout" to a class, with a tag filter for quick selection
 * (tags are independent of camps). Shows the whole library; workouts already on
 * the class are disabled. Links the chosen workout via POST /api/class/[id]/workouts.
 */
export default function AddWorkoutPicker({ classId, workouts }: { classId: string; workouts: WorkoutOption[] }) {
  const router = useRouter();
  const allTags = Array.from(new Set(workouts.flatMap((w) => w.tags))).sort((a, b) => a.localeCompare(b));
  const [tag, setTag] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = tag ? workouts.filter((w) => w.tags.includes(tag)) : workouts;
  const anyAddable = filtered.some((w) => !w.assigned);

  async function add() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/class/${classId}/workouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutId: selected }),
      });
      if (!res.ok) throw new Error("failed");
      toast("Workout added");
      setSelected("");
      router.refresh();
    } catch {
      toast("Could not add the workout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted uppercase tracking-wide">Add an existing workout</label>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setTag(null)} className={`text-[11px] rounded-full px-2 py-0.5 border ${tag === null ? "bg-foreground text-white border-foreground" : "border-border text-muted hover:bg-background"}`}>All</button>
          {allTags.map((t) => (
            <button key={t} type="button" onClick={() => setTag(t === tag ? null : t)} className={`text-[11px] rounded-full px-2 py-0.5 border ${tag === t ? "bg-accent text-white border-accent" : "border-border text-muted hover:bg-background"}`}>{t}</button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1 rounded-lg border border-border bg-white px-2 py-1.5 text-sm">
          <option value="">Pick a workout…</option>
          {filtered.map((w) => (
            <option key={w.id} value={w.id} disabled={w.assigned}>{w.name}{w.assigned ? " — already on this class" : ""}</option>
          ))}
        </select>
        <button type="button" onClick={add} disabled={busy || !selected} className="rounded-lg bg-foreground text-white px-3 text-sm disabled:opacity-40">Add</button>
      </div>

      {!anyAddable && (
        <span className="text-[11px] text-muted">
          {workouts.length === 0
            ? "No workouts in your library yet — create one on the right."
            : tag
              ? `No “${tag}” workouts left to add.`
              : "All your workouts are already on this class. To repeat one, raise its “Rounds” on its card below."}
        </span>
      )}
    </div>
  );
}
