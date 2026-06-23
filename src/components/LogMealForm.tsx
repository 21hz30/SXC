"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2, Camera, Upload } from "lucide-react";
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
 * "Log a meal" form. Describe what you ate (or snap a photo) → AI fills in the
 * macro fields → tweak any number → save. Pure two-step flow: AI suggests, you
 * correct. No coupling between the AI estimate and the save itself — blank
 * macros save as null, so logging is still possible if AI is down. The photo
 * button only shows when a vision model is configured (`visionEnabled`).
 */
export default function LogMealForm({ saveAction, initialMealType = "", visionEnabled = false }: { saveAction: (formData: FormData) => Promise<void>; initialMealType?: string; visionEnabled?: boolean }) {
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
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Fill the form fields from an AI estimate (shared by text + photo paths).
  function applyParsed(p: ParsedFood & { raw?: string }) {
    if (p.description) setDescription(p.description);
    if (p.calories != null) setCalories(String(p.calories));
    if (p.proteinG != null) setProtein(String(Math.round(p.proteinG * 10) / 10));
    if (p.carbsG != null) setCarbs(String(Math.round(p.carbsG * 10) / 10));
    if (p.fatG != null) setFat(String(Math.round(p.fatG * 10) / 10));
    if (p.fiberG != null) setFiber(String(Math.round(p.fiberG * 10) / 10));
    setAiRaw(p.raw ?? null);
  }

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
      applyParsed((await res.json()) as ParsedFood & { raw: string });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEstimating(false);
    }
  }

  // Resize the photo (longest edge → 1024px) and JPEG-compress it client-side
  // so the upload is ~100–200 KB, not a multi-MB phone original. Honors EXIF
  // orientation so iOS portrait photos aren't sent to the model sideways.
  async function shrinkToJpegBase64(file: File): Promise<string> {
    let src: CanvasImageSource;
    let sw: number;
    let sh: number;
    try {
      // createImageBitmap with `from-image` bakes EXIF rotation into the bitmap.
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      src = bmp;
      sw = bmp.width;
      sh = bmp.height;
    } catch {
      // Fallback for browsers without the option: decode via <img> (no EXIF fix).
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const img: HTMLImageElement = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("decode failed"));
        im.src = dataUrl;
      });
      src = img;
      sw = img.width;
      sh = img.height;
    }
    const MAX = 1024;
    const scale = Math.min(1, MAX / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unsupported");
    ctx.drawImage(src, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1] ?? "";
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same photo be re-picked
    if (!file) return;
    setError(null);
    setAnalyzing(true);
    try {
      const imageBase64 = await shrinkToJpegBase64(file);
      const res = await fetch("/api/nutrition/food/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mediaType: "image/jpeg" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Couldn't read the photo — describe the meal instead.");
      }
      applyParsed((await res.json()) as ParsedFood & { raw: string });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
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
  // Shared style for the two photo buttons (camera + library). Fixed sRGB sky
  // palette, not bg-accent/N — that color-mix output is invisible on old iOS.
  const photoBtnCls = `flex-1 cursor-pointer rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-700 px-3 py-2 text-sm font-medium flex items-center justify-center gap-1.5 ${analyzing || estimating ? "opacity-40 pointer-events-none" : ""}`;

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
      {/* AI assist: snap a photo, upload one from the library, or describe it —
          the model fills the macros. The two photo buttons share a row; "Estimate
          with AI" sits below. All wrap cleanly on H5. */}
      <div className="space-y-2">
        {visionEnabled && (
          <div className="flex gap-2">
            {/* capture="environment" jumps straight to the rear camera. */}
            <label className={photoBtnCls}>
              <input type="file" accept="image/*" capture="environment" onChange={onPhoto} disabled={analyzing || estimating} className="hidden" />
              {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              {analyzing ? "Reading photo…" : "Take a photo"}
            </label>
            {/* No capture → the native picker offers the Photo Library + Files,
                so the athlete can upload an existing photo of their meal. */}
            <label className={photoBtnCls}>
              <input type="file" accept="image/*" onChange={onPhoto} disabled={analyzing || estimating} className="hidden" />
              {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {analyzing ? "Reading photo…" : "Upload photo"}
            </label>
          </div>
        )}
        <button
          type="button"
          onClick={estimate}
          disabled={estimating || analyzing || !description.trim()}
          // iOS WeChat WKWebView (pre-iOS 16.4) doesn't render Tailwind v4's
          // color-mix(oklab) output that backs bg-accent/5, so we use the fixed
          // Tailwind orange palette (plain sRGB rgba) instead.
          className="w-full rounded-lg border border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700 px-3 py-2 text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          {estimating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {estimating ? "Estimating…" : "Estimate with AI"}
        </button>
      </div>

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
