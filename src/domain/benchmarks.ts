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

export type BenchmarkDef = {
  /** stored Benchmark.metric value */
  key: string;
  label: string;
  unit: BenchmarkUnit;
  /** lower is better (times) vs higher is better (loads/reps) — guides trend coloring */
  lowerIsBetter: boolean;
};

// The standard set of Hyrox benchmarks. metric.endsWith("_sec") still renders
// as mm:ss elsewhere; unit here is the canonical unit for that metric.
export const BENCHMARKS: BenchmarkDef[] = [
  { key: "1km_run_sec", label: "1km Run", unit: "sec", lowerIsBetter: true },
  { key: "row_500m_sec", label: "500m Row", unit: "sec", lowerIsBetter: true },
  { key: "ski_500m_sec", label: "500m SkiErg", unit: "sec", lowerIsBetter: true },
  { key: "wall_ball_unbroken", label: "Wall Ball (unbroken)", unit: "reps", lowerIsBetter: false },
  { key: "sled_push_kg", label: "Sled Push (max)", unit: "kg", lowerIsBetter: false },
  { key: "deadlift_1rm_kg", label: "Deadlift 1RM", unit: "kg", lowerIsBetter: false },
];

const BY_KEY: Record<string, BenchmarkDef> = Object.fromEntries(BENCHMARKS.map((b) => [b.key, b]));

export function benchmarkLabel(metric: string): string {
  return BY_KEY[metric]?.label ?? metric;
}

export function benchmarkDef(metric: string): BenchmarkDef | undefined {
  return BY_KEY[metric];
}

export function genderLabel(g: string | null | undefined): string {
  return GENDERS.find((x) => x.value === g)?.label ?? "—";
}

export function divisionLabel(d: string | null | undefined): string {
  return DIVISIONS.find((x) => x.value === d)?.label ?? "—";
}
