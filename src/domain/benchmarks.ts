/**
 * Hyrox athlete attributes & benchmark types. Single source of truth for:
 *  - the genders and competition divisions an athlete can have
 *  - the standard benchmark metrics coaches track, with labels & units
 *  - how to format a stored benchmark value for display
 *
 * Mirrors the pattern in exercises.ts. Keep UI, seed, and AI context in sync
 * by importing from here rather than re-declaring labels locally.
 */

export type Gender = "male" | "female";
export const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

// Hyrox competition divisions. Weights & standards differ across these.
export type Division = "open" | "pro" | "doubles" | "relay";
export const DIVISIONS: { value: Division; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "pro", label: "Pro" },
  { value: "doubles", label: "Doubles" },
  { value: "relay", label: "Relay" },
];

export type BenchmarkUnit = "sec" | "reps" | "kg" | "m";

/** Groups for organizing the benchmark catalog in the UI. Hyrox comes first. */
export type BenchmarkGroup = "hyrox" | "engine" | "strength";
export const BENCHMARK_GROUPS: { value: BenchmarkGroup; label: string }[] = [
  { value: "hyrox", label: "Hyrox race (run + 8 stations)" },
  { value: "engine", label: "Engine / cardio" },
  { value: "strength", label: "Strength" },
];

export type BenchmarkDef = {
  /** stored Benchmark.metric value */
  key: string;
  label: string;
  unit: BenchmarkUnit;
  /** lower is better (times) vs higher is better (loads/reps) — guides trend coloring */
  lowerIsBetter: boolean;
  /** which section of the catalog this belongs to */
  group: BenchmarkGroup;
};

// FOCUS: the Hyrox race itself — the 1km run plus the 8 stations, in race
// order. Each is a timed effort at race distance/reps (lower is better), so
// these map 1:1 to the split fields stored on RaceResult.
//
// Other performance metrics (engine tests, strength lifts) can be appended
// here later under their own group without touching the UI. metric.endsWith
// ("_sec") still renders as mm:ss elsewhere.
export const BENCHMARKS: BenchmarkDef[] = [
  { key: "1km_run_sec", label: "1km Run", unit: "sec", lowerIsBetter: true, group: "hyrox" },
  { key: "ski_1000m_sec", label: "SkiErg (1000m)", unit: "sec", lowerIsBetter: true, group: "hyrox" },
  { key: "sled_push_50m_sec", label: "Sled Push (50m)", unit: "sec", lowerIsBetter: true, group: "hyrox" },
  { key: "sled_pull_50m_sec", label: "Sled Pull (50m)", unit: "sec", lowerIsBetter: true, group: "hyrox" },
  { key: "burpee_broad_jump_80m_sec", label: "Burpee Broad Jumps (80m)", unit: "sec", lowerIsBetter: true, group: "hyrox" },
  { key: "row_1000m_sec", label: "Row (1000m)", unit: "sec", lowerIsBetter: true, group: "hyrox" },
  { key: "farmers_carry_200m_sec", label: "Farmers Carry (200m)", unit: "sec", lowerIsBetter: true, group: "hyrox" },
  { key: "sandbag_lunges_100m_sec", label: "Sandbag Lunges (100m)", unit: "sec", lowerIsBetter: true, group: "hyrox" },
  { key: "wall_balls_100_sec", label: "Wall Balls (100 reps)", unit: "sec", lowerIsBetter: true, group: "hyrox" },
];

const BY_KEY: Record<string, BenchmarkDef> = Object.fromEntries(BENCHMARKS.map((b) => [b.key, b]));

/** Benchmarks bucketed by group, preserving catalog order. Empty groups omitted. */
export function benchmarksByGroup(): { group: BenchmarkGroup; label: string; items: BenchmarkDef[] }[] {
  return BENCHMARK_GROUPS.map((g) => ({
    group: g.value,
    label: g.label,
    items: BENCHMARKS.filter((b) => b.group === g.value),
  })).filter((g) => g.items.length > 0);
}

export function benchmarkLabel(metric: string): string {
  return BY_KEY[metric]?.label ?? metric;
}

export function benchmarkDef(metric: string): BenchmarkDef | undefined {
  return BY_KEY[metric];
}

/** Catalog (race) order index for a metric; unknown metrics sort to the end. */
export function benchmarkOrder(metric: string): number {
  const i = BENCHMARKS.findIndex((b) => b.key === metric);
  return i === -1 ? BENCHMARKS.length : i;
}

export function genderLabel(g: string | null | undefined): string {
  return GENDERS.find((x) => x.value === g)?.label ?? "—";
}

export function divisionLabel(d: string | null | undefined): string {
  return DIVISIONS.find((x) => x.value === d)?.label ?? "—";
}
