import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, getMyCustomerId } from "@/lib/auth";
import { hasDedicatedVisionModel } from "@/lib/ai";
import { startOfDay, endOfDay, formatTime } from "@/lib/utils";
import { Trash2, Utensils, Droplet, Scale, Camera, User2 } from "lucide-react";
import TodayNutrition from "@/components/TodayNutrition";
import LogMealForm from "@/components/LogMealForm";
import LogWaterForm from "@/components/LogWaterForm";
import LogWeightForm from "@/components/LogWeightForm";
import BodyStatsForm from "@/components/BodyStatsForm";
import { loadDayIntake } from "@/domain/foodlogs";
import { rollDay, bmi, bmiCategory, dailyTargets, bmrKcal, tdeeKcal, type Stats } from "@/domain/nutrition";
import BackButton from "@/components/BackButton";
import ConfirmSubmit from "@/components/ConfirmSubmit";

export const dynamic = "force-dynamic";

const MEAL_LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack", supplement: "Supplement" };
const VALID_MEAL_TYPES = new Set(Object.keys(MEAL_LABEL));

export default async function NutritionPage({ searchParams }: { searchParams: Promise<{ meal?: string }> }) {
  const user = await requireUser();
  const myCustomerId = await getMyCustomerId();
  if (!myCustomerId) redirect("/profile");

  const { meal } = await searchParams;
  const initialMealType = meal && VALID_MEAL_TYPES.has(meal) ? meal : "";

  const [me, intake, foods, waters, weights] = await Promise.all([
    db.customer.findUnique({ where: { id: myCustomerId }, select: { gender: true, weightKg: true, heightCm: true, age: true } }),
    loadDayIntake(myCustomerId, startOfDay(), endOfDay()),
    db.foodLog.findMany({ where: { customerId: myCustomerId, loggedAt: { gte: startOfDay(), lte: endOfDay() } }, orderBy: { loggedAt: "asc" } }),
    db.waterLog.findMany({ where: { customerId: myCustomerId, loggedAt: { gte: startOfDay(), lte: endOfDay() } }, orderBy: { loggedAt: "asc" } }),
    // Most-recent few weigh-ins so the athlete can see the trend at a glance.
    db.weightLog.findMany({ where: { customerId: myCustomerId }, orderBy: { loggedAt: "desc" }, take: 7 }),
  ]);
  const stats: Stats = { gender: me?.gender ?? null, weightKg: me?.weightKg ?? null, heightCm: me?.heightCm ?? null, age: me?.age ?? null };
  const progress = rollDay(stats, intake);
  const hasStats = stats.weightKg != null && stats.heightCm != null && stats.age != null && (stats.gender === "male" || stats.gender === "female");
  const latestWeight = weights[0] ?? null;
  // Pre-format dates server-side — `toLocaleDateString()` on a client
  // component would render with the browser's locale and mismatch SSR.
  function isoDay(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const weightsFmt = weights.map((w) => ({ ...w, dayText: isoDay(new Date(w.loggedAt)) }));
  // Derived stats for the Body section: BMI + classification + the full
  // target breakdown (BMR, TDEE, protein/carbs/fat/fiber/water).
  const bmiValue = bmi(stats);
  const bmiCat = bmiCategory(bmiValue);
  const bmr = bmrKcal(stats);
  const tdee = tdeeKcal(stats);
  const targets = dailyTargets(stats);

  async function saveMeal(formData: FormData) {
    "use server";
    const u = await requireUser();
    const mine = await getMyCustomerId();
    if (!mine) return;
    const num = (k: string): number | null => {
      const v = formData.get(k);
      if (v == null || String(v).trim() === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const intNum = (k: string): number | null => {
      const n = num(k);
      return n == null ? null : Math.round(n);
    };
    const description = String(formData.get("description") ?? "").trim();
    if (!description) return;
    await db.foodLog.create({
      data: {
        customerId: mine,
        description,
        mealType: (formData.get("mealType") ? String(formData.get("mealType")) : null),
        calories: intNum("calories"),
        proteinG: num("proteinG"),
        carbsG: num("carbsG"),
        fatG: num("fatG"),
        fiberG: num("fiberG"),
        aiAnalysisJson: formData.get("aiAnalysisJson") ? String(formData.get("aiAnalysisJson")) : null,
        notes: formData.get("notes") ? String(formData.get("notes")) : null,
      },
    });
    revalidatePath("/nutrition");
    revalidatePath("/");
    void u;
  }

  async function deleteMeal(formData: FormData) {
    "use server";
    await requireUser();
    const mine = await getMyCustomerId();
    if (!mine) return;
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await db.foodLog.deleteMany({ where: { id, customerId: mine } });
    revalidatePath("/nutrition");
    revalidatePath("/");
  }

  async function addWater(formData: FormData) {
    "use server";
    await requireUser();
    const mine = await getMyCustomerId();
    if (!mine) return;
    const amountMl = Math.round(Number(formData.get("amountMl") ?? 0));
    if (!Number.isFinite(amountMl) || amountMl <= 0) return;
    await db.waterLog.create({ data: { customerId: mine, amountMl } });
    revalidatePath("/nutrition");
    revalidatePath("/");
  }

  async function deleteWater(formData: FormData) {
    "use server";
    await requireUser();
    const mine = await getMyCustomerId();
    if (!mine) return;
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await db.waterLog.deleteMany({ where: { id, customerId: mine } });
    revalidatePath("/nutrition");
    revalidatePath("/");
  }

  // New weigh-in: record the row AND update Customer.weightKg so BMR/TDEE math
  // on the dashboard immediately reflects the new reading.
  async function saveWeight(formData: FormData) {
    "use server";
    await requireUser();
    const mine = await getMyCustomerId();
    if (!mine) return;
    const weightKg = Number(formData.get("weightKg") ?? 0);
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 400) return;
    const notes = formData.get("notes") ? String(formData.get("notes")) : null;
    await db.$transaction([
      db.weightLog.create({ data: { customerId: mine, weightKg, notes } }),
      db.customer.update({ where: { id: mine }, data: { weightKg } }),
    ]);
    revalidatePath("/nutrition");
    revalidatePath("/");
    revalidatePath("/profile");
  }
  async function deleteWeight(formData: FormData) {
    "use server";
    await requireUser();
    const mine = await getMyCustomerId();
    if (!mine) return;
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await db.weightLog.deleteMany({ where: { id, customerId: mine } });
    revalidatePath("/nutrition");
  }

  // Body stats edit — same fields the profile page exposes, just inlined here
  // so the athlete can correct height/age/gender without leaving the nutrition
  // flow. Weight goes through this AND through the dedicated weight-log form;
  // we don't write a WeightLog row from this server action because changing
  // your stats isn't the same as "I just weighed in".
  async function saveBodyStats(formData: FormData) {
    "use server";
    await requireUser();
    const mine = await getMyCustomerId();
    if (!mine) return;
    const num = (k: string): number | null | undefined => {
      const v = formData.get(k);
      if (v == null) return undefined; // not present in form
      const s = String(v).trim();
      if (!s) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : undefined;
    };
    const str = (k: string): string | null | undefined => {
      const v = formData.get(k);
      if (v == null) return undefined;
      const s = String(v).trim();
      return s ? s : null;
    };
    const data: { weightKg?: number | null; heightCm?: number | null; age?: number | null; gender?: string | null } = {};
    const w = num("weightKg"); if (w !== undefined) data.weightKg = w;
    const h = num("heightCm"); if (h !== undefined) data.heightCm = h;
    const a = num("age"); if (a !== undefined) data.age = a == null ? null : Math.round(a);
    const g = str("gender"); if (g !== undefined) data.gender = g;
    if (Object.keys(data).length === 0) return;
    await db.customer.update({ where: { id: mine }, data });
    revalidatePath("/nutrition");
    revalidatePath("/");
    revalidatePath("/profile");
  }

  // Nav strip at the top of the page: jumps to the matching section. Kept as
  // anchor links so it works without JS and on every viewport identically.
  const sectionNav: { id: string; label: string }[] = [
    { id: "body", label: "Body" },
    { id: "meal", label: "Meals" },
    { id: "water", label: "Water" },
    { id: "weight", label: "Weight" },
    { id: "today", label: "Today's log" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto pb-12">
      <BackButton fallback="/" label="Back to dashboard" />
      <header className="mt-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Nutrition · {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted mt-1">Log meals, water, and weight. The dashboard card updates as you go.</p>
      </header>

      {/* Today's macros — same card as the dashboard, kept in sync. */}
      <div className="mb-6">
        <TodayNutrition progress={progress} hasStats={hasStats} restingKcal={bmr} />
      </div>

      {/* Quick-jump strip — anchors to each section below. */}
      <nav className="mb-6 flex flex-wrap gap-1.5 text-xs">
        {sectionNav.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-border bg-card px-3 py-1.5 font-medium hover:border-accent hover:text-accent">{s.label}</a>
        ))}
      </nav>

      {/* BODY STATS + DERIVED TARGETS */}
      <section id="body" className="scroll-mt-20 mb-8">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide flex items-center gap-1.5 mb-3">
          <User2 size={13} /> Body &amp; targets
        </h2>
        <BodyStatsForm
          initial={{ weightKg: stats.weightKg, heightCm: stats.heightCm, age: stats.age, gender: stats.gender }}
          saveAction={saveBodyStats}
        />

        {/* Derived numbers: BMI + the daily-target breakdown driven by the body
            stats above. When stats are incomplete, dashes display so the
            athlete knows what's blocking the targets. */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">BMI</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold tabular-nums">{bmiValue ?? "—"}</span>
              {bmiCat && <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5 ${bmiCat.cls}`}>{bmiCat.label}</span>}
            </div>
            <div className="text-[10px] text-muted mt-0.5">kg / m²</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">BMR (resting)</div>
            <div className="text-xl font-bold tabular-nums">{bmr ?? "—"}</div>
            <div className="text-[10px] text-muted mt-0.5">kcal/day</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">TDEE</div>
            <div className="text-xl font-bold tabular-nums">{tdee ?? "—"}</div>
            <div className="text-[10px] text-muted mt-0.5">kcal/day · 1.55× BMR</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Fiber</div>
            <div className="text-xl font-bold tabular-nums">{targets.fiberG ?? "—"}</div>
            <div className="text-[10px] text-muted mt-0.5">g/day · 14 g per 1000 kcal</div>
          </div>
        </div>

        {/* Inline "where each target comes from" so coaches and athletes can
            sanity-check the math instead of trusting a black box. */}
        <details className="mt-3 bg-card border border-border rounded-xl group">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-xs text-muted hover:text-foreground select-none">
            Show full daily macro targets &amp; formulas
          </summary>
          <div className="px-4 pb-4 pt-1 text-[11px] text-muted space-y-1.5">
            <div><span className="font-semibold text-foreground">Protein</span> {targets.protein ? `${targets.protein.min}-${targets.protein.max}` : "—"} g · 1.2–1.6 g × kg body weight</div>
            <div><span className="font-semibold text-foreground">Carbs</span> {targets.carbs ? `${targets.carbs.min}-${targets.carbs.max}` : "—"} g · 4–6 g × kg body weight</div>
            <div><span className="font-semibold text-foreground">Fat</span> {targets.fat ? `${targets.fat.min}-${targets.fat.max}` : "—"} g · 0.8–1.0 g × kg body weight</div>
            <div><span className="font-semibold text-foreground">Fiber</span> {targets.fiberG ?? "—"} g · 14 g per 1000 kcal (IOM guidance)</div>
            <div><span className="font-semibold text-foreground">Water</span> {targets.waterMl ?? "—"} ml · 40 ml × kg, +500 ml per hour of training today</div>
            <div className="pt-1 border-t border-border mt-1.5"><span className="font-semibold text-foreground">BMR (calories at rest)</span> uses Mifflin-St Jeor; <span className="font-semibold text-foreground">TDEE</span> = BMR × 1.55 activity multiplier.</div>
            <div className="pt-1 text-[10px]"><span className="font-semibold text-foreground">Eaten calories</span> on the dashboard is the plain sum of all of today&apos;s logged meals — each meal&apos;s kcal is either what you typed or what the AI estimated when you tapped &ldquo;Estimate with AI&rdquo;.</div>
          </div>
        </details>
      </section>

      {/* MEALS */}
      <section id="meal" className="scroll-mt-20 mb-8">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide flex items-center gap-1.5">
            <Utensils size={13} /> Log a meal{initialMealType && <span className="text-[10px] text-accent font-semibold uppercase rounded-full bg-accent/10 px-2 py-0.5 ml-1">{MEAL_LABEL[initialMealType]}</span>}
          </h2>
          <span className="text-[11px] text-muted inline-flex items-center gap-1">
            <Camera size={12} /> {hasDedicatedVisionModel() ? "Snap a photo or describe it — AI fills the macros" : "Describe it — AI fills the macros"}
          </span>
        </div>
        <LogMealForm saveAction={saveMeal} initialMealType={initialMealType} visionEnabled={hasDedicatedVisionModel()} />
      </section>

      {/* WATER */}
      <section id="water" className="scroll-mt-20 mb-8">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide flex items-center gap-1.5 mb-3">
          <Droplet size={13} /> Log water
        </h2>
        <LogWaterForm addAction={addWater} />
      </section>

      {/* WEIGHT */}
      <section id="weight" className="scroll-mt-20 mb-8">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide flex items-center gap-1.5 mb-3">
          <Scale size={13} /> Log weight
        </h2>
        <LogWeightForm
          saveAction={saveWeight}
          latestKg={latestWeight?.weightKg ?? me?.weightKg ?? null}
          latestLoggedAtText={latestWeight ? isoDay(new Date(latestWeight.loggedAt)) : null}
        />
        {weightsFmt.length > 0 && (
          <ul className="mt-3 bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
            {weightsFmt.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div>
                  <div className="text-sm font-semibold tabular-nums">{w.weightKg} kg</div>
                  <div className="text-[11px] text-muted">{w.dayText} · {formatTime(w.loggedAt)}{w.notes ? ` · ${w.notes}` : ""}</div>
                </div>
                <form action={deleteWeight}>
                  <input type="hidden" name="id" value={w.id} />
                  <ConfirmSubmit message={`Remove this ${w.weightKg} kg entry?`} className="p-1.5 text-muted hover:text-red-600">
                    <Trash2 size={14} />
                  </ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* TODAY'S LOG */}
      <section id="today" className="scroll-mt-20">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-3">Today&apos;s log</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">Meals ({foods.length})</div>
            {foods.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-xl p-6 text-center text-xs text-muted">No meals yet today.</div>
            ) : (
              <ul className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
                {foods.map((f) => (
                  <li key={f.id} className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{f.description}</div>
                        <div className="text-[11px] text-muted">
                          {formatTime(f.loggedAt)}
                          {f.mealType && <> · {MEAL_LABEL[f.mealType] ?? f.mealType}</>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold tabular-nums">{f.calories != null ? `${f.calories} kcal` : "—"}</div>
                        <div className="text-[10px] text-muted tabular-nums whitespace-nowrap">
                          {f.proteinG != null ? `P ${Math.round(f.proteinG)}` : "P —"}{" · "}
                          {f.carbsG != null ? `C ${Math.round(f.carbsG)}` : "C —"}{" · "}
                          {f.fatG != null ? `F ${Math.round(f.fatG)}` : "F —"}
                        </div>
                      </div>
                      <form action={deleteMeal}>
                        <input type="hidden" name="id" value={f.id} />
                        <ConfirmSubmit message={`Delete "${f.description}"?`} className="p-1 text-muted hover:text-red-600">
                          <Trash2 size={13} />
                        </ConfirmSubmit>
                      </form>
                    </div>
                    {f.notes && <div className="mt-1 text-[11px] text-muted">{f.notes}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">Water ({(intake.waterMl / 1000).toFixed(1)} L)</div>
            {waters.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-xl p-6 text-center text-xs text-muted">No water yet today.</div>
            ) : (
              <ul className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
                {waters.map((w) => (
                  <li key={w.id} className="px-3 py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold tabular-nums">+{w.amountMl} ml</div>
                      <div className="text-[11px] text-muted">{formatTime(w.loggedAt)}</div>
                    </div>
                    <form action={deleteWater}>
                      <input type="hidden" name="id" value={w.id} />
                      <ConfirmSubmit message={`Remove this ${w.amountMl} ml entry?`} className="p-1 text-muted hover:text-red-600">
                        <Trash2 size={13} />
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <div className="mt-8 text-center">
        <Link href="/" className="text-xs text-muted hover:text-foreground">← Back to dashboard</Link>
      </div>
    </div>
  );
}
