/**
 * The standard Hyrox race, in competition order: eight 1 km runs interleaved
 * with the eight functional stations.
 *
 * Used as the default per-exercise breakdown for a mock test when the class has
 * no workout of its own — so an athlete is always asked for a split per exercise,
 * not just a single total time. `key` is the stable id stored in
 * MockResult.timesJson; `title` is what the form shows.
 */
export const HYROX_MOCK_STATIONS: { key: string; title: string }[] = [
  { key: "run1", title: "Run 1 · 1 km" },
  { key: "ski_erg", title: "SkiErg · 1000 m" },
  { key: "run2", title: "Run 2 · 1 km" },
  { key: "sled_push", title: "Sled Push · 50 m" },
  { key: "run3", title: "Run 3 · 1 km" },
  { key: "sled_pull", title: "Sled Pull · 50 m" },
  { key: "run4", title: "Run 4 · 1 km" },
  { key: "burpee_broad_jumps", title: "Burpee Broad Jumps · 80 m" },
  { key: "run5", title: "Run 5 · 1 km" },
  { key: "row", title: "Row · 1000 m" },
  { key: "run6", title: "Run 6 · 1 km" },
  { key: "farmers_carry", title: "Farmers Carry · 200 m" },
  { key: "run7", title: "Run 7 · 1 km" },
  { key: "sandbag_lunges", title: "Sandbag Lunges · 100 m" },
  { key: "run8", title: "Run 8 · 1 km" },
  { key: "wall_balls", title: "Wall Balls · 100 reps" },
];
