/**
 * Hyrox race-result domain helpers. Single source of truth for:
 *  - station / run keys and labels
 *  - division-standard reference times for the radar's "vs standard" mode
 *  - helpers to derive PBs per division and per station
 *  - radar normalization (% of benchmark)
 *
 * Mirrors the pattern in exercises.ts and benchmarks.ts. UI and AI tools
 * should import from here rather than re-declare keys.
 */

// ----- Upcoming race schedule -------------------------------------------------

/**
 * The published Hyrox China season. Athletes pick from these during onboarding
 * (and later) to declare which races + divisions they plan to attend. Edit
 * this list as the calendar changes — it's the single source of truth for the
 * race picker. `start` doubles as the athlete's next-race date.
 */
export type UpcomingRace = { id: string; city: string; dates: string; start: string; end: string };
export const UPCOMING_RACES: UpcomingRace[] = [
  { id: "hangzhou",  city: "Hangzhou",  dates: "Jul 4–5",        start: "2026-07-04", end: "2026-07-05" },
  { id: "chengdu",   city: "Chengdu",   dates: "Aug 1–2",        start: "2026-08-01", end: "2026-08-02" },
  { id: "shenzhen",  city: "Shenzhen",  dates: "Aug 15–16",      start: "2026-08-15", end: "2026-08-16" },
  { id: "beijing",   city: "Beijing",   dates: "Sep 12–13",      start: "2026-09-12", end: "2026-09-13" },
  { id: "shanghai",  city: "Shanghai",  dates: "Oct 31 – Nov 1", start: "2026-10-31", end: "2026-11-01" },
  { id: "guangzhou", city: "Guangzhou", dates: "Nov 21–22",      start: "2026-11-21", end: "2026-11-22" },
  { id: "sanya",     city: "Sanya",     dates: "Dec 5–6",        start: "2026-12-05", end: "2026-12-06" },
];

export function findRace(id: string): UpcomingRace | undefined {
  return UPCOMING_RACES.find((r) => r.id === id);
}

// ----- Station & run keys -----------------------------------------------------

/**
 * The 8 stations in Hyrox race order. Keys map to RaceResult column names
 * (`${key}Sec`) and to the station labels we already use elsewhere.
 */
export const STATION_KEYS = [
  "ski",
  "sledPush",
  "sledPull",
  "burpee",
  "row",
  "farmers",
  "lunges",
  "wallballs",
] as const;
export type StationKey = (typeof STATION_KEYS)[number];

export const STATION_LABELS: Record<StationKey, string> = {
  ski: "SkiErg",
  sledPush: "Sled Push",
  sledPull: "Sled Pull",
  burpee: "Burpees",
  row: "Row",
  farmers: "Farmers Carry",
  lunges: "Lunges",
  wallballs: "Wall Balls",
};

/** Column name on RaceResult for a given station key. */
export function stationCol(k: StationKey): keyof RaceSplitFields {
  return `${k}Sec` as keyof RaceSplitFields;
}

export const RUN_KEYS = ["run1", "run2", "run3", "run4", "run5", "run6", "run7", "run8"] as const;
export type RunKey = (typeof RUN_KEYS)[number];

// ----- Race split shape (subset of RaceResult fields) -------------------------

export type RaceSplitFields = {
  skiSec: number | null;
  sledPushSec: number | null;
  sledPullSec: number | null;
  burpeeSec: number | null;
  rowSec: number | null;
  farmersSec: number | null;
  lungesSec: number | null;
  wallballsSec: number | null;
  run1Sec: number | null;
  run2Sec: number | null;
  run3Sec: number | null;
  run4Sec: number | null;
  run5Sec: number | null;
  run6Sec: number | null;
  run7Sec: number | null;
  run8Sec: number | null;
  roxzoneSec: number | null;
  totalSec: number;
};

// ----- Division standards -----------------------------------------------------

// Sensible defaults for "typical finisher" station times per division × gender.
// Editable here as we tune to real data. Doubles/Relay omitted for v1 — fall
// back to Open standards in the radar if the athlete races those divisions.
type StandardSet = Record<StationKey, number> & { runSec: number; roxzoneSec: number };

export const DIVISION_STANDARDS: Record<string, StandardSet> = {
  open_male: {
    ski: 240, sledPush: 150, sledPull: 150, burpee: 270,
    row: 240, farmers: 120, lunges: 300, wallballs: 360,
    runSec: 300,   // per 1km
    roxzoneSec: 180,
  },
  open_female: {
    ski: 270, sledPush: 180, sledPull: 180, burpee: 300,
    row: 270, farmers: 135, lunges: 330, wallballs: 420,
    runSec: 330,
    roxzoneSec: 180,
  },
  pro_male: {
    ski: 210, sledPush: 120, sledPull: 120, burpee: 240,
    row: 210, farmers: 105, lunges: 270, wallballs: 330,
    runSec: 270,
    roxzoneSec: 150,
  },
  pro_female: {
    ski: 240, sledPush: 150, sledPull: 150, burpee: 270,
    row: 240, farmers: 120, lunges: 300, wallballs: 390,
    runSec: 300,
    roxzoneSec: 150,
  },
};

export function getStandardSet(division: string | null | undefined, gender: string | null | undefined): StandardSet {
  const div = division === "pro" ? "pro" : "open"; // doubles/relay → open baseline
  const g = gender === "female" ? "female" : "male";
  return DIVISION_STANDARDS[`${div}_${g}`] ?? DIVISION_STANDARDS.open_male;
}

// ----- Derived: PBs -----------------------------------------------------------

/** Fastest total time per division across an athlete's races. */
export function pbByDivision(races: { division: string; totalSec: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of races) {
    if (out[r.division] === undefined || r.totalSec < out[r.division]) out[r.division] = r.totalSec;
  }
  return out;
}

/** Best (fastest) time per station across ALL of an athlete's races. */
export function pbByStation(races: RaceSplitFields[]): Record<StationKey, number | null> {
  const out: Record<StationKey, number | null> = {
    ski: null, sledPush: null, sledPull: null, burpee: null,
    row: null, farmers: null, lunges: null, wallballs: null,
  };
  for (const r of races) {
    for (const k of STATION_KEYS) {
      const v = r[stationCol(k)] as number | null;
      if (v != null && (out[k] == null || v < out[k]!)) out[k] = v;
    }
  }
  return out;
}

/** Best (fastest) average run pace across the athlete's races (sec / km). */
export function pbRunPace(races: RaceSplitFields[]): number | null {
  let best: number | null = null;
  for (const r of races) {
    const runs = RUN_KEYS.map((k) => r[`${k}Sec` as keyof RaceSplitFields] as number | null).filter((x): x is number => x != null);
    if (runs.length === 0) continue;
    const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
    if (best == null || avg < best) best = avg;
  }
  return best;
}

/** Average run time for a single race (sec / km), or null. */
export function avgRunSec(r: RaceSplitFields): number | null {
  const runs = RUN_KEYS.map((k) => r[`${k}Sec` as keyof RaceSplitFields] as number | null).filter((x): x is number => x != null);
  if (runs.length === 0) return null;
  return runs.reduce((a, b) => a + b, 0) / runs.length;
}

// ----- Radar normalization ---------------------------------------------------

export type RadarMode = "pb" | "standard" | "goal";

/**
 * Given a station time and a benchmark time, return a 0..1.5+ ratio where 1.0
 * means "equal to benchmark", >1 is faster than benchmark (better), <1 is
 * slower. UIs typically clamp display to a sensible window, e.g. 0.4..1.4.
 * Returns null if either input is missing.
 */
export function ratio(actualSec: number | null, benchmarkSec: number | null | undefined): number | null {
  if (actualSec == null || benchmarkSec == null) return null;
  if (actualSec <= 0) return null;
  return benchmarkSec / actualSec;
}
