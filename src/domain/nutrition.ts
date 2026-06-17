/**
 * Pure nutrition math — no DB, no IO. Used by the dashboard "Today's nutrition"
 * card and by future log forms / coach views. All inputs are stored as the
 * athlete already enters them on their profile (cm, kg, years, male/female).
 *
 * Formulas:
 *   - BMR        — Mifflin-St Jeor (the modern standard)
 *   - TDEE       — BMR × activity multiplier (we lock at 1.55 "moderate" for
 *                  Hyrox athletes; their training load adds on top via the
 *                  exercise-burn total summed for the day)
 *   - Protein    — 1.8 g/kg/day (mid of the 1.6–2.2 athlete range)
 *   - Carbs      — 5 g/kg/day (moderate-to-high training)
 *   - Fat        — fills the remainder after protein + carbs in calories
 *   - Water      — 35 ml/kg/day baseline + 500 ml per hour of exercise
 *
 * Each calculation returns `null` when its inputs are insufficient (e.g. no
 * weight on file), so callers can show "Add your body stats" rather than
 * fake numbers.
 */

const ACTIVITY_MULTIPLIER = 1.55; // moderate (Hyrox-appropriate)
// Macro ranges per kg body weight — coach's standing recommendation:
//   Protein 1.2–1.6 g/kg, Carbs 4–6 g/kg, Fat 0.8–1.0 g/kg.
// Water at 40 ml/kg (no range — single target).
const PROTEIN_G_PER_KG_MIN = 1.2;
const PROTEIN_G_PER_KG_MAX = 1.6;
const CARBS_G_PER_KG_MIN = 4;
const CARBS_G_PER_KG_MAX = 6;
const FAT_G_PER_KG_MIN = 0.8;
const FAT_G_PER_KG_MAX = 1.0;
const WATER_ML_PER_KG = 40;
const WATER_ML_PER_HOUR_EXERCISE = 500;
// Fiber scales with calorie intake — IOM/ADA guidance is ~14 g per 1,000 kcal.
const FIBER_G_PER_1000_KCAL = 14;

/**
 * Surface the default per-kg / per-1000-kcal coefficients so the dashboard's
 * "How are these targets calculated?" popup shows whatever the back-end is
 * actually using. When per-coach formula configs land, the resolver replaces
 * these defaults but the popup keeps the same shape.
 */
export const FORMULA_DEFAULTS = {
  proteinGPerKg: PROTEIN_G_PER_KG_MIN,
  carbsGPerKg: CARBS_G_PER_KG_MIN,
  fatGPerKg: FAT_G_PER_KG_MIN,
  waterMlPerKg: WATER_ML_PER_KG,
  activityMultiplier: ACTIVITY_MULTIPLIER,
  fiberGPer1000Kcal: FIBER_G_PER_1000_KCAL,
} as const;

export type Stats = {
  gender: string | null;
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
};

/**
 * Basal Metabolic Rate (kcal/day) — calories the body burns at rest, used to
 * derive total daily targets. Mifflin-St Jeor; returns null if any required
 * stat (weight, height, age, gender) is missing.
 */
export function bmrKcal(s: Stats): number | null {
  if (s.weightKg == null || s.heightCm == null || s.age == null || (s.gender !== "male" && s.gender !== "female")) return null;
  const base = 10 * s.weightKg + 6.25 * s.heightCm - 5 * s.age;
  return Math.round(base + (s.gender === "male" ? 5 : -161));
}

/**
 * Total Daily Energy Expenditure (kcal/day) — BMR scaled by a fixed
 * activity multiplier (no per-athlete knob in MVP). Exercise the athlete
 * logged TODAY is summed separately on the dashboard and shown next to it.
 */
export function tdeeKcal(s: Stats): number | null {
  const bmr = bmrKcal(s);
  return bmr == null ? null : Math.round(bmr * ACTIVITY_MULTIPLIER);
}

/** A macro range — { min, max } in grams. Null when body stats are missing. */
export type MacroRange = { min: number; max: number } | null;

export type Targets = {
  caloriesKcal: number | null;
  protein: MacroRange;
  carbs: MacroRange;
  fat: MacroRange;
  fiberG: number | null;
  waterMl: number | null;
};

/**
 * Daily targets for an athlete. Calories = TDEE; protein/carbs from per-kg
 * rules; fat fills the rest; water is the baseline (without exercise — the
 * dashboard tops it up by the actual minutes of exercise logged today).
 */
function rangeFromKg(weightKg: number | null, perKgMin: number, perKgMax: number): MacroRange {
  if (weightKg == null) return null;
  return { min: Math.round(weightKg * perKgMin), max: Math.round(weightKg * perKgMax) };
}

export function dailyTargets(s: Stats): Targets {
  const calories = tdeeKcal(s);
  const protein = rangeFromKg(s.weightKg, PROTEIN_G_PER_KG_MIN, PROTEIN_G_PER_KG_MAX);
  const carbs = rangeFromKg(s.weightKg, CARBS_G_PER_KG_MIN, CARBS_G_PER_KG_MAX);
  const fat = rangeFromKg(s.weightKg, FAT_G_PER_KG_MIN, FAT_G_PER_KG_MAX);
  const fiberG = calories != null ? Math.round((calories / 1000) * FIBER_G_PER_1000_KCAL) : null;
  const waterMl = s.weightKg != null ? Math.round(s.weightKg * WATER_ML_PER_KG) : null;
  return { caloriesKcal: calories, protein, carbs, fat, fiberG, waterMl };
}

/**
 * Body Mass Index (kg/m²) — quick health-class indicator. Returns null if
 * either weight or height is missing.
 */
export function bmi(s: Stats): number | null {
  if (s.weightKg == null || s.heightCm == null || s.heightCm <= 0) return null;
  const m = s.heightCm / 100;
  return Math.round((s.weightKg / (m * m)) * 10) / 10;
}

/** WHO BMI category for the supplied value. */
export function bmiCategory(value: number | null): { label: string; cls: string } | null {
  if (value == null) return null;
  if (value < 18.5) return { label: "Underweight", cls: "bg-sky-100 text-sky-800" };
  if (value < 25) return { label: "Normal", cls: "bg-emerald-100 text-emerald-800" };
  if (value < 30) return { label: "Overweight", cls: "bg-amber-100 text-amber-800" };
  return { label: "Obese", cls: "bg-rose-100 text-rose-800" };
}

/** Extra water target for `minutes` of exercise on top of the baseline. */
export function waterFromExerciseMl(minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.round((minutes / 60) * WATER_ML_PER_HOUR_EXERCISE);
}

export type DayIntake = {
  caloriesIn: number;       // sum of FoodLog.calories today
  proteinG: number;          // sum of FoodLog.proteinG today
  carbsG: number;            // sum of FoodLog.carbsG today
  fatG: number;              // sum of FoodLog.fatG today
  fiberG: number;            // sum of FoodLog.fiberG today
  waterMl: number;           // sum of WaterLog.amountMl today
  caloriesOut: number;       // sum of WorkoutAssignment.caloriesBurned today
  exerciseMinutes: number;   // sum of durations for today's workouts (for water bonus)
};

export type DayProgress = {
  intake: DayIntake;
  targets: Targets & { waterMl: number | null };
  /** Net energy balance today: caloriesIn - caloriesOut (positive = surplus). */
  netCaloriesKcal: number;
  /** caloriesIn / targets.caloriesKcal as %, null if no target. */
  caloriePct: number | null;
  proteinPct: number | null;
  carbsPct: number | null;
  fatPct: number | null;
  fiberPct: number | null;
  waterPct: number | null;
};

/**
 * Roll a day's logged intake against the athlete's targets, ready to render.
 * The water target factors in the actual exercise minutes logged today.
 * For ranges (protein/carbs/fat), the % is calculated against the LOW end
 * so the athlete sees "have I hit my daily minimum yet?".
 */
export function rollDay(s: Stats, intake: DayIntake): DayProgress {
  const targetsBase = dailyTargets(s);
  const waterTarget = targetsBase.waterMl != null ? targetsBase.waterMl + waterFromExerciseMl(intake.exerciseMinutes) : null;
  const targets = { ...targetsBase, waterMl: waterTarget };
  const pct = (n: number, t: number | null): number | null => (t == null || t <= 0 ? null : Math.min(999, Math.round((n / t) * 100)));
  const pctRange = (n: number, r: MacroRange): number | null => (r == null ? null : pct(n, r.min));
  return {
    intake,
    targets,
    netCaloriesKcal: intake.caloriesIn - intake.caloriesOut,
    caloriePct: pct(intake.caloriesIn, targets.caloriesKcal),
    proteinPct: pctRange(intake.proteinG, targets.protein),
    carbsPct: pctRange(intake.carbsG, targets.carbs),
    fatPct: pctRange(intake.fatG, targets.fat),
    fiberPct: pct(intake.fiberG, targets.fiberG),
    waterPct: pct(intake.waterMl, targets.waterMl),
  };
}
