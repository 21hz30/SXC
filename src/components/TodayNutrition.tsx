import Link from "next/link";
import { Cake, Coffee, Droplet, Moon, Pill, Scale, Soup } from "lucide-react";
import type { DayProgress, MacroRange } from "@/domain/nutrition";
import { FORMULA_DEFAULTS } from "@/domain/nutrition";
import FormulaInfoButton from "./FormulaInfoButton";

function fmt(n: number): string {
  return n.toLocaleString();
}
/** Show only the minimum of a range (the "hit your daily floor" number); the
 *  max is kept in the data model for over-target warnings later. */
function fmtTarget(r: MacroRange | number | null): string {
  if (r == null) return "—";
  if (typeof r === "number") return fmt(r);
  return fmt(r.min);
}

/**
 * One pastel tile in the macro strip (Protein / Carbs / Fat / Water).
 * Shows current/target plus a % so the athlete sees both absolute and
 * progress numbers at a glance.
 */
function MacroTile({ label, unit, value, target, pct, tile }: {
  label: string;
  unit: string;
  value: number;
  /** Single number or { min, max } range. */
  target: MacroRange | number | null;
  pct: number | null;
  tile: { bg: string; text: string; muted: string };
}) {
  const pctText = pct == null ? "—" : `${Math.min(999, Math.round(pct))}%`;
  return (
    <div className={`${tile.bg} rounded-lg px-2 py-2`}>
      <div className={`text-[9px] ${tile.muted} truncate leading-tight`}>{label} ({unit})</div>
      <div className={`text-base font-bold tabular-nums leading-tight mt-0.5 ${tile.text}`}>{fmt(value)}</div>
      <div className={`text-[9px] tabular-nums ${tile.muted} whitespace-nowrap`}>/ {fmtTarget(target)}</div>
      <div className={`text-[9px] tabular-nums ${tile.muted}`}>{pctText}</div>
    </div>
  );
}

/**
 * One quick-log entry point in the icon strip at the bottom of the card.
 * Tapping navigates to the detail page with a `type=` query so it opens
 * pre-scrolled to the right entry form.
 */
function QuickIcon({ icon: Icon, label, href }: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-0.5 py-0.5 text-foreground/80 hover:text-foreground transition rounded-md hover:bg-background"
    >
      <Icon size={18} strokeWidth={1.6} />
      <span className="text-[9px] leading-tight">{label}</span>
    </Link>
  );
}

/**
 * Dashboard "Today's nutrition" card. Three regions:
 *  1. Calorie summary line   — "Eaten 0 / 2,728 kcal"
 *  2. 4 pastel macro tiles   — Protein, Carbs, Fat, Water
 *  3. 6 quick-log icons      — Breakfast, Lunch, Dinner, Snack, Water, Weight
 *
 * When the athlete hasn't set their body stats yet, targets render as "—"
 * and a CTA points to the profile form so they know how to fix it.
 */
export default function TodayNutrition({ progress, hasStats, restingKcal }: { progress: DayProgress; hasStats: boolean; restingKcal: number | null }) {
  const { intake, targets } = progress;
  const dashTarget = (n: number | null) => (n == null ? "—" : fmt(n));

  return (
    <section className="bg-card border border-border rounded-2xl p-4">
      <header className="mb-2 flex items-baseline justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Today&apos;s nutrition</h2>
          <FormulaInfoButton
            proteinGPerKg={FORMULA_DEFAULTS.proteinGPerKg}
            carbsGPerKg={FORMULA_DEFAULTS.carbsGPerKg}
            fatGPerKg={FORMULA_DEFAULTS.fatGPerKg}
            waterMlPerKg={FORMULA_DEFAULTS.waterMlPerKg}
            activityMultiplier={FORMULA_DEFAULTS.activityMultiplier}
          />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-muted">Eaten</span>
          <span className="text-xl font-bold tabular-nums leading-none">{fmt(intake.caloriesIn)}</span>
          <span className="text-[11px] text-muted tabular-nums">/ {dashTarget(targets.caloriesKcal)} kcal</span>
        </div>
      </header>
      {/* Tiny resting-calorie chip so the athlete sees what their body burns at
          rest — the baseline TDEE is scaled from. Hidden if BMR isn't known. */}
      {restingKcal != null && (
        <div className="mb-2 text-[10px] text-muted">
          <span className="font-medium text-foreground/70">Calories at rest</span>
          <span className="tabular-nums ml-1">{fmt(restingKcal)} kcal</span>
          <span className="ml-1 text-muted/70">· BMR · Mifflin-St Jeor</span>
        </div>
      )}

      {!hasStats && (
        <div className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 inline-block">
          Add your weight, height and age in <Link href="/profile" className="font-medium underline">your profile</Link> to enable targets.
        </div>
      )}

      {/* 4 pastel macro tiles in a single row on every viewport — labels are
          short enough to fit at 375 px. Matches the mockup. */}
      <div className="grid grid-cols-4 gap-1.5">
        <MacroTile
          label="Protein"
          unit="g"
          value={Math.round(intake.proteinG)}
          target={targets.protein}
          pct={progress.proteinPct}
          tile={{ bg: "bg-amber-50", text: "text-amber-900", muted: "text-amber-700/70" }}
        />
        <MacroTile
          label="Carbs"
          unit="g"
          value={Math.round(intake.carbsG)}
          target={targets.carbs}
          pct={progress.carbsPct}
          tile={{ bg: "bg-indigo-50", text: "text-indigo-900", muted: "text-indigo-700/70" }}
        />
        <MacroTile
          label="Fat"
          unit="g"
          value={Math.round(intake.fatG)}
          target={targets.fat}
          pct={progress.fatPct}
          tile={{ bg: "bg-rose-50", text: "text-rose-900", muted: "text-rose-700/70" }}
        />
        <MacroTile
          label="Water"
          unit="ml"
          value={intake.waterMl}
          target={targets.waterMl}
          pct={progress.waterPct}
          tile={{ bg: "bg-emerald-50", text: "text-emerald-900", muted: "text-emerald-700/70" }}
        />
      </div>

      {/* Quick-log icons: 7 across on every viewport. Supplement covers
          protein powder, energy gels, creatine, etc. */}
      <div className="mt-3 pt-2 border-t border-border grid grid-cols-7 gap-0.5">
        <QuickIcon icon={Coffee} label="Breakfast" href="/nutrition?meal=breakfast#meal" />
        <QuickIcon icon={Soup} label="Lunch" href="/nutrition?meal=lunch#meal" />
        <QuickIcon icon={Moon} label="Dinner" href="/nutrition?meal=dinner#meal" />
        <QuickIcon icon={Cake} label="Snack" href="/nutrition?meal=snack#meal" />
        <QuickIcon icon={Pill} label="Supplement" href="/nutrition?meal=supplement#meal" />
        <QuickIcon icon={Droplet} label="Water" href="/nutrition#water" />
        <QuickIcon icon={Scale} label="Weight" href="/nutrition#weight" />
      </div>
    </section>
  );
}
