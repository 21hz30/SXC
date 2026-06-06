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
  strength:  { label: "Strength",           fields: ["sets", "reps", "weightKg", "timeSec", "notes"] },
  other:     { label: "Other",              fields: ["distanceM", "reps", "weightKg", "timeSec", "notes"] },
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
  order?: number;
};

function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
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
  if (item.sets != null && item.reps != null) bits.push(`${item.sets} × ${item.reps}`);
  else if (item.reps != null) bits.push(`${item.reps} reps`);
  else if (item.sets != null) bits.push(`${item.sets} sets`);
  if (item.distanceM != null) bits.push(`${item.distanceM} m`);
  if (item.weightKg != null) bits.push(`${item.weightKg} kg`);
  if (item.heightM != null) bits.push(`target ${item.heightM} m`);
  if (item.paceSecPerKm != null) bits.push(`${fmtSec(item.paceSecPerKm)}/km`);
  if (item.timeSec != null) bits.push(fmtSec(item.timeSec));
  return bits;
}

/** Pretty-print an item for display, e.g. "SkiErg — 1000 m · 4:00/km · 4:00" */
export function formatItem(item: WorkoutItemInput): { title: string; details: string } {
  const bits = itemChips(item);
  if (item.notes) bits.push(item.notes);
  return { title: itemTitle(item), details: bits.join(" · ") };
}
