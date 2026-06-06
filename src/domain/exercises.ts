/**
 * Hyrox-aware exercise categories. Single source of truth for:
 *  - what categories exist
 *  - their default labels
 *  - which fields are relevant for each (drives the UI editor)
 *  - how to format an item as a human-readable string
 */

export type FieldKey =
  | "distanceM"
  | "timeSec"
  | "weightKg"
  | "reps"
  | "sets"
  | "paceSecPerKm"
  | "heightM"
  | "notes";

export type Category =
  | "ski"
  | "sled_push"
  | "sled_pull"
  | "burpee"
  | "row"
  | "farmers"
  | "lunges"
  | "wallball"
  | "run"
  | "rest"
  | "strength"
  | "other";

export type CategoryDef = { label: string; fields: FieldKey[]; icon?: string };

// Every category exposes `timeSec` (duration) — the coach can set a time cap /
// target time for any exercise. Category-specific fields come first.
export const CATEGORIES: Record<Category, CategoryDef> = {
  ski:       { label: "SkiErg",             fields: ["distanceM", "paceSecPerKm", "timeSec", "notes"] },
  sled_push: { label: "Sled push",          fields: ["distanceM", "weightKg", "timeSec", "notes"] },
  sled_pull: { label: "Sled pull",          fields: ["distanceM", "weightKg", "timeSec", "notes"] },
  burpee:    { label: "Burpee broad jumps", fields: ["distanceM", "reps", "timeSec", "notes"] },
  row:       { label: "Row",                fields: ["distanceM", "paceSecPerKm", "timeSec", "notes"] },
  farmers:   { label: "Farmers carry",      fields: ["distanceM", "weightKg", "timeSec", "notes"] },
  lunges:    { label: "Sandbag lunges",     fields: ["distanceM", "reps", "weightKg", "timeSec", "notes"] },
  wallball:  { label: "Wall balls",         fields: ["reps", "weightKg", "heightM", "timeSec", "notes"] },
  run:       { label: "Run",                fields: ["distanceM", "paceSecPerKm", "timeSec", "notes"] },
  rest:      { label: "Rest",               fields: ["timeSec", "notes"] },
  strength:  { label: "Strength",           fields: ["reps", "sets", "weightKg", "timeSec", "notes"] },
  other:     { label: "Other",              fields: ["reps", "sets", "weightKg", "distanceM", "timeSec", "notes"] },
};

export const FIELD_META: Record<FieldKey, { label: string; suffix?: string; type: "number" | "text" }> = {
  distanceM:    { label: "Distance",   suffix: "m",      type: "number" },
  timeSec:      { label: "Duration",   suffix: "sec",    type: "number" },
  weightKg:     { label: "Weight",     suffix: "kg",     type: "number" },
  reps:         { label: "Reps",                          type: "number" },
  sets:         { label: "Sets",                          type: "number" },
  paceSecPerKm: { label: "Pace",       suffix: "sec/km", type: "number" },
  heightM:      { label: "Target",     suffix: "m",      type: "number" },
  notes:        { label: "Notes",                        type: "text" },
};

export function categoryLabel(category: string): string {
  return CATEGORIES[category as Category]?.label ?? category;
}

// Training tags an exercise can carry (warm-up, strength, …) — drive a colored
// badge in the UI and let athletes see the shape of a session at a glance.
export type ExerciseTag = "warmup" | "strength" | "cardio" | "core" | "mobility" | "cooldown";
export const EXERCISE_TAGS: { key: ExerciseTag; label: string; badge: string }[] = [
  { key: "warmup",   label: "Warm-up",   badge: "bg-amber-100 text-amber-800" },
  { key: "strength", label: "Strength",  badge: "bg-violet-100 text-violet-800" },
  { key: "cardio",   label: "Cardio",    badge: "bg-sky-100 text-sky-800" },
  { key: "core",     label: "Core",      badge: "bg-rose-100 text-rose-800" },
  { key: "mobility", label: "Mobility",  badge: "bg-teal-100 text-teal-800" },
  { key: "cooldown", label: "Cool-down", badge: "bg-emerald-100 text-emerald-800" },
];
export function tagMeta(tag?: string | null) {
  return EXERCISE_TAGS.find((t) => t.key === tag) ?? null;
}

export type WorkoutItemInput = {
  id?: string;
  category: Category;
  label?: string | null;
  distanceM?: number | null;
  timeSec?: number | null;
  weightKg?: number | null;
  reps?: number | null;
  sets?: number | null;
  paceSecPerKm?: number | null;
  heightM?: number | null;
  notes?: string | null;
  tag?: string | null;
  order?: number;
};

// Pace etc. — always mm:ss.
function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// A duration the way a coach reads it: "20s" under a minute, "30 min" for whole
// minutes, "1:30" otherwise — so a 60-minute run isn't shown as "60:00".
export function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`;
  if (s % 60 === 0) return `${s / 60} min`;
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

/** The display title for an item — its custom label, else the category name. */
export function itemTitle(item: WorkoutItemInput): string {
  return item.label?.trim() || categoryLabel(item.category);
}

/**
 * The measurable targets of an item as separate chips (no title, no notes) —
 * e.g. ["4 × 12", "1000 m", "102 kg", "4:00/km", "4:00"]. Lets the UI render
 * each metric as its own pill instead of one run-on string.
 */
export function itemChips(item: WorkoutItemInput): string[] {
  const bits: string[] = [];
  // Reps and sets/rounds, spelled out so "8 reps × 4 sets" can't be misread.
  if (item.reps != null && item.sets != null) bits.push(`${item.reps} reps × ${item.sets} ${item.sets === 1 ? "set" : "sets"}`);
  else if (item.reps != null) bits.push(`${item.reps} reps`);
  else if (item.sets != null) bits.push(`${item.sets} ${item.sets === 1 ? "set" : "sets"}`);
  if (item.distanceM != null) bits.push(`${item.distanceM} m`);
  if (item.weightKg != null) bits.push(`${item.weightKg} kg`);
  if (item.heightM != null) bits.push(`target ${item.heightM} m`);
  if (item.paceSecPerKm != null) bits.push(`${fmtSec(item.paceSecPerKm)}/km`);
  if (item.timeSec != null) bits.push(fmtDuration(item.timeSec));
  return bits;
}

/** Pretty-print an item for display, e.g. "SkiErg — 1000 m · 4:00/km · 4:00" */
export function formatItem(item: WorkoutItemInput): { title: string; details: string } {
  const bits = itemChips(item);
  if (item.notes) bits.push(item.notes);
  return { title: itemTitle(item), details: bits.join(" · ") };
}
