// A workout's library category — drives the filter on the workouts page and a
// colored badge. Semantics (for future behavior): "relax" = no feedback needed,
// "mock" = record a time per exercise (or just a total), "weekly"/"class" =
// regular training. Be lenient — mock results may have only a total time.
export type WorkoutType = "relax" | "weekly" | "class" | "mock";

export const WORKOUT_TYPES: { key: WorkoutType; label: string; badge: string }[] = [
  { key: "weekly", label: "Weekly Training", badge: "bg-violet-100 text-violet-700" },
  { key: "class",  label: "Class",           badge: "bg-sky-100 text-sky-700" },
  { key: "mock",   label: "Mock",            badge: "bg-amber-100 text-amber-700" },
  { key: "relax",  label: "Relax",           badge: "bg-emerald-100 text-emerald-700" },
];

export function workoutTypeMeta(type?: string | null) {
  return WORKOUT_TYPES.find((t) => t.key === type) ?? null;
}
