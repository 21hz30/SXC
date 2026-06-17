"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { reloadWithFlash } from "@/lib/reloadWithFlash";

type ParsedFood = {
  description: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
};

/**
 * "Log a meal" form. Type what you ate → "Estimate with AI" fills in the
 * macro fields → tweak any number → save. Pure two-step flow: AI suggests,
 * you correct. No coupling between the AI estimate and the save itself —
 * blank macros save as null, so logging is still possible if AI is down.
 */
export default function LogMealForm({ saveAction, initialMealType = "" }: { saveAction: (formData: FormData) => Promise<void>; initialMealType?: string }) {
  const [description, setDescription] = useState("");
  const [mealType, setMealType] = useState(initialMealType);
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [notes, setNotes] = useState("");
  const [aiRaw, setAiRaw] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function estimate() {
    if (!description.trim()) {
      setError("Type what you ate first.");
      return;
    }
    setError(null);
    setEstimating(true);
    try {
      const res = await fetch("/api/nutrition/food/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "AI couldn't estimate this — fill the numbers manually.");
      }
      const p = (await res.json()) as ParsedFood & { raw: string };
      setDescription(p.description || description);
      if (p.calories != null) setCalories(String(p.calories));
      if (p.proteinG != null) setProtein(String(Math.round(p.proteinG * 10) / 10));
      if (p.carbsG != null) setCarbs(String(Math.round(p.carbsG * 10) / 10));
      if (p.fatG != null) setFat(String(Math.round(p.fatG * 10) / 10));
      if (p.fiberG != null) setFiber(String(Math.round(p.fiberG * 10) / 10));
      setAiRaw(p.raw ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEstimating(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setError("Type what you ate first.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("description", description.trim());
    if (mealType) fd.set("mealType", mealType);
    if (calories) fd.set("calories", calories);
    if (protein) fd.set("proteinG", protein);
    if (carbs) fd.set("carbsG", carbs);
    if (fat) fd.set("fatG", fat);
    if (fiber) fd.set("fiberG", fiber);
    if (notes.trim()) fd.set("notes", notes.trim());
    if (aiRaw) fd.set("aiAnalysisJson", aiRaw);
    startSave(async () => {
      await saveAction(fd);
      // Hard reload with a one-off `?flash=` so the global <Toaster> picks
      // up "Meal saved" as a brief confirmation. Reload is needed because
      // iOS WeChat's WKWebView caches the RSC payload and `router.refresh()`
      // wouldn't surface the new meal in today's log.
      reloadWithFlash("Meal saved");
    });
  }

  const inputCls = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm";
  const labelCls = "block text-xs font-medium text-muted uppercase tracking-wide mb-1";

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div>
        <label className={labelCls}>What did you eat?</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="例如：两个鸡蛋、一碗燕麦粥、一个香蕉、一杯黑咖啡"
          className={inputCls + " resize-y min-h-[3rem]"}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Meal (optional)</label>
          <select value={mealType} onChange={(e) => setMealType(e.target.value)} className={inputCls + " bg-white"}>
            <option value="">—</option>
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
            <option value="supplement">Supplement</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={estimate}
            disabled={estimating || !description.trim()}
            // iOS WeChat WKWebView (pre-iOS 16.4) doesn't render Tailwind v4's
            // `color-mix(in oklab, …)` output that backs `bg-accent/5`, so the
            // button rendered as a solid orange block with invisible text on
            // older devices. Switched to fixed Tailwind orange palette so the
            // compiled CSS is plain sRGB rgba().
            className="w-full rounded-lg border border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700 px-3 py-2 text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            {estimating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {estimating ? "Estimating…" : "Estimate with AI"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-border">
        <div>
          <label className={labelCls}>Calories</label>
          <input value={calories} onChange={(e) => setCalories(e.target.value)} type="number" min={0} placeholder="kcal" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Protein</label>
          <input value={protein} onChange={(e) => setProtein(e.target.value)} type="number" min={0} step="0.1" placeholder="g" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Carbs</label>
          <input value={carbs} onChange={(e) => setCarbs(e.target.value)} type="number" min={0} step="0.1" placeholder="g" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Fat</label>
          <input value={fat} onChange={(e) => setFat(e.target.value)} type="number" min={0} step="0.1" placeholder="g" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Fiber</label>
          <input value={fiber} onChange={(e) => setFiber(e.target.value)} type="number" min={0} step="0.1" placeholder="g" className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Notes (optional)</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="anything worth remembering…" className={inputCls} />
      </div>

      {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="rounded-lg bg-foreground text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40">
          {saving ? "Saving…" : "Save meal"}
        </button>
      </div>
    </form>
  );
}
